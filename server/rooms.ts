import { randomBytes, randomInt } from "crypto";

import {
  ClientMessage,
  DEFAULT_MAX_PLAYERS,
  DEFAULT_INTEREST,
  DEFAULT_MAX_WIND,
  MAX_ARMS_LEVEL,
  DEFAULT_ROUNDS,
  ErrorCode,
  FieldState,
  JOIN_TOKEN_PERIOD,
  MAX_NAME_LENGTH,
  MIN_PLAYERS,
  PlayerInfo,
  ROUND_PAUSE,
  SAY_INTERVAL,
  RoomMode,
  RoomPhase,
  RoomSettings,
  RoomState,
  ServerMessage,
  SHOTS_INTERVAL,
  TURN_TIME
} from "../shared/protocol";
import { launch, Shot, stepShots, STEPS_PER_SECOND } from "../shared/sim/shots";
import { createField, removeTank } from "../shared/sim/field";
import { createRandom } from "../shared/sim/random";
import { damageReward, isForSale, ROUND_WIN, SHOP_TIME, withInterest } from "../shared/economy";
import { DEFAULT_WEAPON, findWeapon, MAX_ITEMS, starterKit, WEAPONS } from "../shared/weapons";

/** How long a room is kept when its screen is away, in milliseconds. */
export const ROOM_TIMEOUT = 5 * 60 * 1000;

export const ROOM_ID_LENGTH = 8;
export const JOIN_TOKEN_LENGTH = 10;

/** The characters of room ids and join tokens: no i, l, o, 0 or 1, which are easy to mix up. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export interface RoomsOptions {
  /** How often the join token of a room changes, in milliseconds. */
  tokenPeriod?: number;
  /** How long a room is kept when its screen is away, in milliseconds. */
  roomTimeout?: number;
  /** The seed of what is random in the games, for tests. Without it each game is different. */
  seed?: number;
  /** The strongest wind of a new room, for tests that need a shot to land where it is aimed. */
  maxWind?: number;
  /** Whether everyone starts a game with a bundle of each weapon, for tests that fire them. Otherwise weapons are bought. */
  kit?: boolean;
  /** How long the shop is open between two rounds at most, in milliseconds. 0: there is no shop, for tests of other things. */
  shopTime?: number;
}

interface Player<Member> {
  id: number;
  name: string;
  /** The secret with which the device of the player returns to the player. */
  key: string;
  /** The connection of the player, null while there is none. */
  member: Member | null;
  /** When the player last said something in a speech bubble. */
  saidAt: number;
  /** When the tank of the player can fire again. */
  reloadedAt: number;
  /** How many rounds of the game the player has won. */
  wins: number;
  /** The money of the player in dollars. It can be below zero. */
  money: number;
  /** How many the player has of each weapon, by its id. The weapons there is no end of are not here. */
  weapons: Record<string, number>;
  /** The id of the weapon the tank fires next. */
  weapon: string;
}

interface Room<Member> {
  id: string;
  /** The secret with which the screen returns to the room. */
  hostKey: string;
  mode: RoomMode;
  phase: RoomPhase;
  settings: RoomSettings;
  /** In the order of their ids. */
  players: Player<Member>[];
  /** The connection of the screen, null while there is none. */
  screen: Member | null;
  /** The playing field, once the game has started. */
  field: FieldState | null;
  /** The projectiles in the air. */
  shots: Shot[];
  nextShot: number;
  /** The number of the round that is being played, from 1. 0 before the game. */
  round: number;
  /** Starts the next round, when a round has ended and its result is being shown. */
  nextRoundTimer: ReturnType<typeof setTimeout> | null;
  /** While the shop is open: the ids of the players who are ready, when it closes at the latest, and the timer that closes it. */
  ready: Set<number>;
  shopEndsAt: number;
  shopTimer: ReturnType<typeof setTimeout> | null;
  /** In the classic mode: the ids of the players in the order of their turns in this round. */
  order: number[];
  /** In the classic mode: the id of the player whose turn it is, null when it is nobody's. */
  turn: number | null;
  /** Whether the player whose turn it is has fired. The turn passes when the shot is over. */
  turnFired: boolean;
  /** When the turn is skipped if the player has not fired by then, and the timer that skips it. */
  turnEndsAt: number;
  turnTimer: ReturnType<typeof setTimeout> | null;
  token: string;
  /** The token before the newest one, which still lets a controller join. */
  previousToken: string | null;
  tokenChangedAt: number;
  tokenTimer: ReturnType<typeof setInterval>;
  /** Removes the room, when the screen has been away for too long. */
  removeTimer: ReturnType<typeof setTimeout> | null;
}

/** What a connection is: the screen of a room (no player) or a player of it. */
interface Session<Member> {
  room: Room<Member>;
  player: Player<Member> | null;
}

function randomId(length: number) {
  let id = "";
  for (let i = 0; i < length; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return id;
}

const randomKey = () => randomBytes(16).toString("base64url");

/**
 * The rooms of the game: who is in them and in what role. See docs/PROTOCOL.md.
 *
 * A member is a connection. The class does not know what a connection is: it is given a function
 * that sends a message to a member and one that closes a member, so it can be tested without sockets.
 */
class Rooms<Member> {
  private readonly rooms = new Map<string, Room<Member>>();
  private readonly tokens = new Map<string, Room<Member>>();
  private readonly sessions = new Map<Member, Session<Member>>();
  private readonly tokenPeriod: number;
  private readonly roomTimeout: number;
  private readonly seed: number | undefined;
  private readonly maxWind: number;
  private readonly kit: boolean;
  private readonly shopTime: number;
  /** Moves the projectiles of all the rooms, while there are any in the air. */
  private ticker: ReturnType<typeof setInterval> | null = null;

  /**
   * @param send Sends a message to a member.
   * @param close Closes the connection of a member, after what was sent to it has gone.
   */
  constructor(
    private readonly send: (member: Member, message: ServerMessage) => void,
    private readonly close: (member: Member) => void,
    options: RoomsOptions = {}
  ) {
    this.tokenPeriod = options.tokenPeriod ?? JOIN_TOKEN_PERIOD;
    this.roomTimeout = options.roomTimeout ?? ROOM_TIMEOUT;
    this.seed = options.seed;
    this.maxWind = options.maxWind ?? DEFAULT_MAX_WIND;
    this.kit = options.kit ?? false;
    this.shopTime = options.shopTime ?? SHOP_TIME;
  }

  /** How many rooms there are. */
  get size() {
    return this.rooms.size;
  }

  /** Handles a message of a member. Returns false if the message is not about the rooms. */
  handle(member: Member, message: ClientMessage) {
    switch (message.type) {
      case "create":
        this.create(member, message.mode);
        return true;
      case "host":
        this.host(member, message.room, message.hostKey);
        return true;
      case "join":
        this.join(member, message.token, message.name);
        return true;
      case "resume":
        this.resume(member, message.room, message.playerKey);
        return true;
      case "rejoin":
        this.rejoin(member, message.token, message.playerKey);
        return true;
      case "leave":
        this.leave(member);
        return true;
      case "settings":
        this.changeSettings(member, message.settings);
        return true;
      case "kick":
        this.kick(member, message.id);
        return true;
      case "start":
        this.start(member);
        return true;
      case "lobby":
        this.backToLobby(member);
        return true;
      case "aim":
        this.aim(member, message.angle, message.power);
        return true;
      case "weapon":
        this.chooseWeapon(member, message.weapon);
        return true;
      case "buy":
        this.buy(member, message.weapon);
        return true;
      case "ready":
        this.ready(member);
        return true;
      case "fire":
        this.fire(member);
        return true;
      case "say":
        this.say(member, message.text);
        return true;
      default:
        return false;
    }
  }

  /** The connection of a member was lost. The screen or the player it was stays in the room. */
  disconnect(member: Member) {
    const session = this.sessions.get(member);
    if (!session) return;
    this.sessions.delete(member);

    const { room, player } = session;
    if (player) {
      player.member = null;
    } else {
      room.screen = null;
      room.removeTimer = setTimeout(() => this.remove(room), this.roomTimeout);
    }
    this.announce(room);
    // The shop does not wait for a player who is away
    this.closeShopIfReady(room);
  }

  /** Removes all the rooms and stops their timers, when the server is closed. */
  shutdown() {
    for (const room of [...this.rooms.values()]) this.remove(room);
    this.stopTicker();
  }

  private create(member: Member, mode: RoomMode) {
    this.disconnect(member);

    let id = randomId(ROOM_ID_LENGTH);
    while (this.rooms.has(id)) id = randomId(ROOM_ID_LENGTH);

    const room: Room<Member> = {
      id,
      hostKey: randomKey(),
      mode,
      phase: "lobby",
      settings: {
        maxPlayers: DEFAULT_MAX_PLAYERS,
        rounds: DEFAULT_ROUNDS,
        turns: "classic",
        maxWind: this.maxWind,
        cash: 0,
        interest: DEFAULT_INTEREST,
        armsLevel: MAX_ARMS_LEVEL
      },
      players: [],
      screen: member,
      field: null,
      shots: [],
      nextShot: 1,
      round: 0,
      nextRoundTimer: null,
      order: [],
      turn: null,
      turnFired: false,
      turnEndsAt: 0,
      turnTimer: null,
      token: this.newToken(),
      previousToken: null,
      tokenChangedAt: Date.now(),
      tokenTimer: setInterval(() => this.rotateToken(room), this.tokenPeriod),
      removeTimer: null,
      ready: new Set(),
      shopEndsAt: 0,
      shopTimer: null
    };
    this.rooms.set(id, room);
    this.tokens.set(room.token, room);
    this.sessions.set(member, { room, player: null });
    this.welcomeScreen(room, member);
  }

  private host(member: Member, id: string, hostKey: string) {
    const room = this.rooms.get(id);
    if (!room) return this.refuse(member, "no-room", "host");
    if (room.hostKey !== hostKey) return this.refuse(member, "no-session", "host");

    if (room.screen !== member) {
      this.disconnect(member);
      if (room.screen) this.replace(room.screen);
      if (room.removeTimer) clearTimeout(room.removeTimer);
      room.removeTimer = null;
      room.screen = member;
      this.sessions.set(member, { room, player: null });
    }
    this.welcomeScreen(room, member);
  }

  private join(member: Member, token: string, name: string) {
    const room = this.tokens.get(token);
    if (!room) return this.refuse(member, "bad-token", "join");
    // Nobody new comes in while a round is going on: only before the game, and between two rounds while the shop is open
    if (room.phase !== "lobby" && room.phase !== "shop") return this.refuse(member, "wrong-phase", "join");
    if (room.players.length >= room.settings.maxPlayers) return this.refuse(member, "room-full", "join");
    this.disconnect(member);

    // The lowest free number, so that the colours of those who left are used again
    let id = 0;
    while (room.players.some((player) => player.id === id)) id += 1;

    const player: Player<Member> = {
      id,
      name: this.uniqueName(room, name),
      key: randomKey(),
      member,
      saidAt: -Infinity,
      reloadedAt: 0,
      wins: 0,
      // One who comes in the middle of a game starts as everyone did
      money: room.phase === "shop" ? room.settings.cash : 0,
      weapons: {},
      weapon: DEFAULT_WEAPON
    };
    room.players.push(player);
    room.players.sort((a, b) => a.id - b.id);
    this.sessions.set(member, { room, player });

    this.send(member, { type: "joined", room: room.id, id, playerKey: player.key });
    if (room.phase === "shop") this.sendWeapons(player);
    this.startIfFull(room);
    this.announce(room);
    this.sendField(room);
  }

  private resume(member: Member, id: string, playerKey: string) {
    const room = this.rooms.get(id);
    if (!room) return this.refuse(member, "no-room", "resume");
    const player = room.players.find((candidate) => candidate.key === playerKey);
    if (!player) return this.refuse(member, "no-session", "resume");
    this.returnPlayer(member, room, player);
  }

  private rejoin(member: Member, token: string, playerKey: string) {
    const room = this.tokens.get(token);
    if (!room) return this.refuse(member, "bad-token", "rejoin");
    const player = room.players.find((candidate) => candidate.key === playerKey);
    if (!player) return this.refuse(member, "no-session", "rejoin");
    this.returnPlayer(member, room, player);
  }

  /** Gives a player of a room, whose key a member has shown, to the member, and tells it what it needs. */
  private returnPlayer(member: Member, room: Room<Member>, player: Player<Member>) {
    if (player.member !== member) {
      this.disconnect(member);
      if (player.member) this.replace(player.member);
      player.member = member;
      this.sessions.set(member, { room, player });
    }
    this.send(member, { type: "joined", room: room.id, id: player.id, playerKey: player.key });
    this.announce(room);
    this.sendOwnAim(room, player);
    if (room.phase !== "lobby") this.sendWeapons(player);
  }

  private leave(member: Member) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "leave");

    this.sessions.delete(member);
    this.removePlayer(session.room, session.player);
  }

  private changeSettings(member: Member, settings: RoomSettings) {
    const room = this.roomOfScreen(member, "settings");
    if (!room) return;
    if (room.phase !== "lobby") return this.refuse(member, "wrong-phase", "settings");
    if (settings.maxPlayers < room.players.length) return this.refuse(member, "not-allowed", "settings");

    const { maxPlayers, rounds, turns, maxWind, cash, interest, armsLevel } = settings;
    room.settings = { maxPlayers, rounds, turns, maxWind, cash, interest, armsLevel };
    this.startIfFull(room);
    this.announce(room);
    this.sendField(room);
  }

  private kick(member: Member, id: number) {
    const room = this.roomOfScreen(member, "kick");
    if (!room) return;
    const player = room.players.find((candidate) => candidate.id === id);
    if (!player) return this.refuse(member, "not-allowed", "kick");

    if (player.member) {
      this.sessions.delete(player.member);
      // Tells the controller that it is not a player of the room any more
      this.send(player.member, { type: "error", code: "no-session" });
    }
    this.removePlayer(room, player);
  }

  private start(member: Member) {
    const room = this.roomOfScreen(member, "start");
    if (!room) return;
    if (room.phase !== "lobby") return this.refuse(member, "wrong-phase", "start");
    if (room.players.length < MIN_PLAYERS) return this.refuse(member, "not-allowed", "start");

    this.newGame(room);
  }

  /** After a game has finished: back to the lobby, where a new game can be started and new players can join. */
  private backToLobby(member: Member) {
    const room = this.roomOfScreen(member, "lobby");
    if (!room) return;
    if (room.phase !== "finished") return this.refuse(member, "wrong-phase", "lobby");

    room.phase = "lobby";
    room.field = null;
    room.round = 0;
    this.setTurn(room, null);
    for (const player of room.players) player.wins = 0;
    this.startIfFull(room);
    this.announce(room);
    this.sendField(room);
  }

  private aim(member: Member, angle: number | undefined, power: number | undefined) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "aim");
    const { room, player } = session;
    const tank = room.phase === "playing" && room.field?.tanks.find((candidate) => candidate.id === player.id);
    if (!tank) return this.refuse(member, "wrong-phase", "aim");
    if (tank.energy <= 0) return this.refuse(member, "destroyed", "aim");

    if (angle !== undefined) tank.angle = angle;
    // A tank cannot fire harder than its energy allows
    if (power !== undefined) tank.power = Math.min(power, tank.energy * 10);
    // Not back to the controller: it already shows what the player did
    if (room.screen) this.send(room.screen, { type: "aim", id: tank.id, angle: tank.angle, power: tank.power });
  }

  /** Whether a player has a weapon to fire: at least one of it, or there is no end of it. */
  private hasWeapon(player: Player<Member>, id: string) {
    const weapon = findWeapon(id);
    return weapon !== undefined && (!Number.isFinite(weapon.bundle) || player.weapons[id] > 0);
  }

  private sendWeapons(player: Player<Member>) {
    if (player.member) this.send(player.member, { type: "weapons", selected: player.weapon, counts: player.weapons });
  }

  private chooseWeapon(member: Member, id: string) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "weapon");
    const { room, player } = session;
    if (room.phase !== "playing") return this.refuse(member, "wrong-phase", "weapon");
    if (this.hasWeapon(player, id)) player.weapon = id;
    else this.refuse(member, "no-weapon", "weapon");
    // Also after a refusal: the controller shows what the tank really has
    this.sendWeapons(player);
  }

  /** Takes the weapon a tank fires from what the player has. When it was the last one, the tank goes back to the Baby Missile. */
  private useWeapon(player: Player<Member>) {
    const weapon = findWeapon(player.weapon) ?? findWeapon(DEFAULT_WEAPON)!;
    if (Number.isFinite(weapon.bundle)) {
      player.weapons[weapon.id] -= 1;
      if (player.weapons[weapon.id] <= 0) {
        delete player.weapons[weapon.id];
        player.weapon = DEFAULT_WEAPON;
      }
    }
    this.sendWeapons(player);
    return weapon;
  }

  private fire(member: Member) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "fire");
    const { room, player } = session;
    const tank = room.phase === "playing" && room.field?.tanks.find((candidate) => candidate.id === player.id);
    if (!tank) return this.refuse(member, "wrong-phase", "fire");
    if (tank.energy <= 0) return this.refuse(member, "destroyed", "fire");
    // Nobody fires while the result of a round is shown
    if (room.nextRoundTimer) return this.refuse(member, "wrong-phase", "fire");
    if (room.settings.turns === "classic") {
      // One shot on one's own turn. The turn passes when the shot is over, not by the clock any more.
      if (room.turn !== player.id || room.turnFired) return this.refuse(member, "not-your-turn", "fire");
      room.turnFired = true;
      room.turnEndsAt = Date.now();
      if (room.turnTimer) clearTimeout(room.turnTimer);
      room.turnTimer = null;
      room.shots.push(launch(tank, room.nextShot++, this.useWeapon(player).id));
      this.announce(room);
    } else {
      if (Date.now() < player.reloadedAt) return this.refuse(member, "reloading", "fire");
      // The bigger the weapon, the longer the tank reloads after it
      const weapon = this.useWeapon(player);
      player.reloadedAt = Date.now() + weapon.reload * 1000;
      room.shots.push(launch(tank, room.nextShot++, weapon.id));
      this.send(member, { type: "reload", time: weapon.reload * 1000 });
    }
    this.startTicker();
  }

  /**
   * A round is over when at most one tank is left and nothing is in the air any more. Its result is
   * told to everyone and shown for a while, and then the next round starts.
   */
  private endRoundIfOver(room: Room<Member>) {
    if (!room.field || room.nextRoundTimer || room.shots.length > 0) return;
    const left = room.field.tanks.filter((tank) => tank.energy > 0);
    if (left.length > 1) return;

    this.setTurn(room, null);
    const winner = room.players.find((player) => player.id === left[0]?.id);
    if (winner) {
      winner.wins += 1;
      winner.money += ROUND_WIN;
    }
    const message: ServerMessage = { type: "roundOver", round: room.round, winner: winner?.id ?? null };
    if (room.screen) this.send(room.screen, message);
    for (const player of room.players) if (player.member) this.send(player.member, message);
    // The wins and the money of the players are in the state of the room
    this.announce(room);

    room.nextRoundTimer = setTimeout(() => {
      room.nextRoundTimer = null;
      // After the last round the game is finished: the final results stay on the screen
      if (room.round >= room.settings.rounds) {
        room.phase = "finished";
        this.announce(room);
        return;
      }
      // Money that was not spent earns interest between the rounds
      for (const player of room.players) player.money = withInterest(player.money, room.settings.interest);
      this.nextRound(room);
    }, ROUND_PAUSE);
  }

  /** A new game starts: everyone gets the money of the start, and no weapons but the one everyone always has. */
  private newGame(room: Room<Member>) {
    for (const player of room.players) {
      player.money = room.settings.cash;
      player.weapons = this.kit ? starterKit() : {};
      player.weapon = DEFAULT_WEAPON;
    }
    this.nextRound(room);
  }

  /** Before each round the shop opens, if anyone has the money to buy anything. Otherwise the round starts at once. */
  private nextRound(room: Room<Member>) {
    const prices = WEAPONS.filter((weapon) => isForSale(weapon, room.settings.armsLevel)).map((weapon) => weapon.price);
    const cheapest = Math.min(...prices);
    if (this.shopTime > 0 && room.players.some((player) => player.money >= cheapest)) {
      room.phase = "shop";
      room.ready = new Set();
      room.shopEndsAt = Date.now() + this.shopTime;
      room.shopTimer = setTimeout(() => this.closeShop(room), this.shopTime);
      for (const player of room.players) this.sendWeapons(player);
      this.announce(room);
    } else {
      this.closeShop(room);
    }
  }

  /** The shop closes and the next round starts. */
  private closeShop(room: Room<Member>) {
    if (room.shopTimer) clearTimeout(room.shopTimer);
    room.shopTimer = null;
    this.begin(room);
    this.announce(room);
    this.sendField(room);
  }

  /** The shop closes when every player who is connected is ready. */
  private closeShopIfReady(room: Room<Member>) {
    if (room.phase !== "shop") return;
    const present = room.players.filter((player) => player.member);
    if (present.length > 0 && present.every((player) => room.ready.has(player.id))) this.closeShop(room);
  }

  private buy(member: Member, id: string) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "buy");
    const { room, player } = session;
    if (room.phase !== "shop") return this.refuse(member, "wrong-phase", "buy");
    const weapon = findWeapon(id);
    if (!weapon || !isForSale(weapon, room.settings.armsLevel)) return this.refuse(member, "no-weapon", "buy");
    if (player.money < weapon.price) return this.refuse(member, "no-money", "buy");
    const count = (player.weapons[id] ?? 0) + weapon.bundle;
    if (count > MAX_ITEMS) return this.refuse(member, "too-many", "buy");

    player.money -= weapon.price;
    player.weapons[id] = count;
    this.sendWeapons(player);
    this.announce(room);
  }

  private ready(member: Member) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "ready");
    const { room, player } = session;
    if (room.phase !== "shop") return this.refuse(member, "wrong-phase", "ready");
    room.ready.add(player.id);
    this.announce(room);
    this.closeShopIfReady(room);
  }

  /** Gives the turn to a player, who has a limited time to fire. Null takes the turn from everyone. */
  private setTurn(room: Room<Member>, id: number | null) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turn = id;
    room.turnFired = false;
    room.turnEndsAt = Date.now() + TURN_TIME;
    room.turnTimer = id === null ? null : setTimeout(() => this.passTurn(room), TURN_TIME);
  }

  /** Passes the turn to the next player in the order of the round whose tank is still there, and tells everyone. */
  private passTurn(room: Room<Member>) {
    const alive = new Set(room.field?.tanks.filter((tank) => tank.energy > 0).map((tank) => tank.id));
    const from = room.turn === null ? -1 : room.order.indexOf(room.turn);
    let next: number | null = null;
    for (let step = 1; step <= room.order.length && next === null; step++) {
      const id = room.order[(from + step) % room.order.length];
      if (alive.has(id)) next = id;
    }
    this.setTurn(room, next);
    this.announce(room);
  }

  /** Starts moving the projectiles, if they are not moving already. */
  private startTicker() {
    this.ticker ??= setInterval(() => this.tick(), SHOTS_INTERVAL);
  }

  private stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  /** Moves the projectiles of all the rooms forward by the time of a tick, and tells the screens what happened. */
  private tick() {
    let flying = false;
    for (const room of this.rooms.values()) {
      if (!room.field || room.shots.length === 0) continue;

      let paid = false;
      for (let step = 0; step < (STEPS_PER_SECOND * SHOTS_INTERVAL) / 1000; step++) {
        const { shots, events } = stepShots(room.field, room.shots, () => room.nextShot++);
        room.shots = shots;
        for (const event of events) {
          if (event.event === "damage") {
            // The one who fired is paid for the damage to others, and pays for the damage to itself
            const shooter = room.players.find((player) => player.id === event.by);
            if (shooter) shooter.money += damageReward(event.by === event.id, event.amount, event.energy === 0);
            paid = true;
            // The player is told the energy of its own tank; the screen gets it with the tanks below
            const hit = room.players.find((player) => player.id === event.id);
            if (hit?.member) this.send(hit.member, { type: "energy", energy: event.energy });
          } else if (!room.screen) {
            continue;
          } else if (event.event === "explode") {
            const { x, y, radius, weapon } = event;
            this.send(room.screen, { type: "explode", x, y, radius, weapon });
          } else {
            this.send(room.screen, { type: "terrain", changes: event.ops, tanks: room.field.tanks });
          }
        }
      }
      // The money of the players is in the state of the room
      if (paid) this.announce(room);
      // Also when the last one has gone: an empty list tells that nothing is in the air any more
      if (room.screen) {
        const shots = room.shots.map(({ id, owner, weapon, x, y }) => ({
          id,
          owner,
          weapon,
          x: Math.round(x),
          y: Math.round(y)
        }));
        this.send(room.screen, { type: "shots", shots });
      }
      flying ||= room.shots.length > 0;
      this.endRoundIfOver(room);
      // In the classic mode the turn passes when the shot of the turn is over
      if (room.turnFired && room.shots.length === 0 && !room.nextRoundTimer) this.passTurn(room);
    }
    if (!flying) this.stopTicker();
  }

  private say(member: Member, text: string) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "say");
    const { room, player } = session;
    // A speech bubble is above a tank, so there are none before the game
    if (!room.field?.tanks.some((tank) => tank.id === player.id)) return this.refuse(member, "wrong-phase", "say");
    if (Date.now() - player.saidAt < SAY_INTERVAL) return this.refuse(member, "rate-limited", "say");
    player.saidAt = Date.now();

    // The spaces at the ends are dropped, and those inside are single ones
    const message: ServerMessage = { type: "say", id: player.id, text: text.trim().replace(/\s+/g, " ") };
    if (room.screen) this.send(room.screen, message);
    // Also back to the one who said it, to show what was really shown
    this.send(member, message);
  }

  /** The room a member is the screen of. A member that is not a screen is refused. */
  private roomOfScreen(member: Member, re: ClientMessage["type"]) {
    const session = this.sessions.get(member);
    if (!session || session.player) {
      this.refuse(member, "not-allowed", re);
      return null;
    }
    return session.room;
  }

  private refuse(member: Member, code: ErrorCode, re: ClientMessage["type"]) {
    this.send(member, { type: "error", code, re });
  }

  /** Another connection took the place of a member: it is told so, and its connection is closed. */
  private replace(member: Member) {
    this.sessions.delete(member);
    this.send(member, { type: "error", code: "replaced" });
    this.close(member);
  }

  private removePlayer(room: Room<Member>, player: Player<Member>) {
    room.players = room.players.filter((candidate) => candidate !== player);
    if (room.field) removeTank(room.field, player.id);
    // The turn of a player who went passes on, unless a shot of that turn is still in the air
    if (room.turn === player.id && !room.turnFired) this.passTurn(room);
    else this.announce(room);
    this.sendField(room);
    this.closeShopIfReady(room);
  }

  /** The game starts by itself when the room is full. */
  private startIfFull(room: Room<Member>) {
    if (room.phase === "lobby" && room.players.length >= room.settings.maxPlayers) this.newGame(room);
  }

  /** Starts the game: makes the playing field and tells each player the aim of its tank. */
  private begin(room: Room<Member>) {
    // Each round has a terrain of its own, also when the seed is fixed for a test
    const random = createRandom((this.seed ?? randomInt(2 ** 32)) + room.round);
    room.phase = "playing";
    room.round += 1;
    room.shots = [];
    for (const player of room.players) player.reloadedAt = 0;
    const ids = room.players.map((player) => player.id);
    if (room.settings.turns === "classic") {
      // The order of the turns is drawn for each round
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      room.order = ids;
      this.setTurn(room, ids[0] ?? null);
    } else {
      room.order = [];
      this.setTurn(room, null);
    }
    room.field = createField(
      room.players.map((player) => player.id),
      random,
      room.settings.maxWind
    );
    for (const player of room.players) {
      this.sendOwnAim(room, player);
      this.sendWeapons(player);
    }
  }

  /** Sends the playing field to the screen, which shows it. Nothing is sent before the game has started. */
  private sendField(room: Room<Member>) {
    if (room.field && room.screen) this.send(room.screen, { type: "field", field: room.field });
  }

  /**
   * Tells a player what only the server knows about its tank, when the player cannot know it, at
   * the start of a round and after returning: the aim, how long the tank still reloads, its energy
   * and its weapons.
   */
  private sendOwnAim(room: Room<Member>, player: Player<Member>) {
    const tank = room.field?.tanks.find((candidate) => candidate.id === player.id);
    if (tank && player.member) {
      this.send(player.member, { type: "aim", id: tank.id, angle: tank.angle, power: tank.power });
      this.send(player.member, { type: "reload", time: Math.max(0, player.reloadedAt - Date.now()) });
      this.send(player.member, { type: "energy", energy: tank.energy });
    }
  }

  /** A name that nobody else in the room has: a number is added to a name that is taken. */
  private uniqueName(room: Room<Member>, wanted: string) {
    const taken = new Set(room.players.map((player) => player.name.toLowerCase()));
    const base = wanted.trim();
    let name = base;
    for (let number = 2; taken.has(name.toLowerCase()); number++) {
      const suffix = ` ${number}`;
      name = [...base].slice(0, MAX_NAME_LENGTH - suffix.length).join("") + suffix;
    }
    return name;
  }

  private newToken() {
    let token = randomId(JOIN_TOKEN_LENGTH);
    while (this.tokens.has(token)) token = randomId(JOIN_TOKEN_LENGTH);
    return token;
  }

  private rotateToken(room: Room<Member>) {
    if (room.previousToken) this.tokens.delete(room.previousToken);
    room.previousToken = room.token;
    room.token = this.newToken();
    room.tokenChangedAt = Date.now();
    this.tokens.set(room.token, room);
    if (room.screen) this.sendToken(room, room.screen);
  }

  private sendToken(room: Room<Member>, screen: Member) {
    const expiresIn = Math.max(0, room.tokenChangedAt + this.tokenPeriod - Date.now());
    this.send(screen, { type: "token", token: room.token, expiresIn });
  }

  /** What a screen is told when it gets its room: the key, the state and the token of the QR code. */
  private welcomeScreen(room: Room<Member>, screen: Member) {
    this.send(screen, { type: "created", room: room.id, hostKey: room.hostKey });
    this.announce(room);
    this.sendToken(room, screen);
    this.sendField(room);
  }

  private state(room: Room<Member>): RoomState {
    const players: PlayerInfo[] = room.players.map(({ id, name, member, wins, money }) => ({
      id,
      name,
      connected: member !== null,
      wins,
      money
    }));
    return {
      room: room.id,
      mode: room.mode,
      phase: room.phase,
      settings: room.settings,
      players,
      screen: room.screen !== null,
      round: room.round,
      turn: room.turn === null ? null : { player: room.turn, time: Math.max(0, room.turnEndsAt - Date.now()) },
      wind: room.phase === "playing" && room.field ? room.field.wind : 0,
      shop: room.phase === "shop" ? { time: Math.max(0, room.shopEndsAt - Date.now()), ready: [...room.ready] } : null
    };
  }

  /** Tells everyone in the room its state. */
  private announce(room: Room<Member>) {
    const message: ServerMessage = { type: "room", state: this.state(room) };
    if (room.screen) this.send(room.screen, message);
    for (const player of room.players) if (player.member) this.send(player.member, message);
  }

  private remove(room: Room<Member>) {
    clearInterval(room.tokenTimer);
    if (room.removeTimer) clearTimeout(room.removeTimer);
    if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);
    if (room.turnTimer) clearTimeout(room.turnTimer);
    if (room.shopTimer) clearTimeout(room.shopTimer);
    this.tokens.delete(room.token);
    if (room.previousToken) this.tokens.delete(room.previousToken);
    this.rooms.delete(room.id);

    if (room.screen) this.sessions.delete(room.screen);
    for (const player of room.players) {
      if (!player.member) continue;
      this.sessions.delete(player.member);
      this.send(player.member, { type: "error", code: "no-room" });
    }
  }
}

export default Rooms;
