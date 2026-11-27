import { randomBytes, randomInt } from "crypto";

import {
  ClientMessage,
  DEFAULT_MAX_WIND,
  defaultSettings,
  HOST_GRACE,
  LOBBY_TIME,
  MAX_ENERGY,
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
  TankState,
  TerrainChange,
  TURN_TIME
} from "../shared/protocol";
import { launch, Shot, stepShots, STEPS_PER_SECOND } from "../shared/sim/shots";
import { changeWind, createField, removeTank } from "../shared/sim/field";
import { createRandom, Random } from "../shared/sim/random";
import { findAccessory } from "../shared/accessories";
import {
  damageReward,
  findItem,
  isForSale,
  ITEMS,
  ROUND_WIN,
  sellCount,
  sellPrice,
  SHOP_TIME,
  withInterest
} from "../shared/economy";
import { batteriesFor, DEFAULT_WEAPON, findWeapon, MAX_ITEMS, starterKit } from "../shared/weapons";

/** How long a room is kept when its screen is away, in milliseconds. */
export const ROOM_TIMEOUT = 5 * 60 * 1000;

/** How many rooms the server has at most: its memory is small. */
export const MAX_ROOMS = 200;
/** How many of them can be online rooms. */
export const MAX_ONLINE_ROOMS = 50;
/** How many online rooms can be created from one address at a time: one game at a time is what a player needs. */
export const MAX_ONLINE_ROOMS_PER_ADDRESS = 1;
/** How many rooms can be created from one address at a time. A home has one address, so this is for many screens, not for many phones. */
export const MAX_ROOMS_PER_ADDRESS = 5;

export const ROOM_ID_LENGTH = 8;
export const JOIN_TOKEN_LENGTH = 10;
/** The token of an online room is its link: it does not change, so it is long enough not to be guessed. */
export const LINK_TOKEN_LENGTH = 20;

/** The characters of room ids and join tokens: no i, l, o, 0 or 1, which are easy to mix up. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export interface RoomsOptions<Member = unknown> {
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
  /** How many rooms there can be in all, how many of them online rooms, and how many from one address. */
  maxRooms?: number;
  maxOnlineRooms?: number;
  /** How many online rooms can be created from one address. */
  maxOnlineRoomsPerAddress?: number;
  /** How long an online room waits for players in its lobby before it starts by itself or is closed, in milliseconds. */
  lobbyTime?: number;
  maxRoomsPerAddress?: number;
  /** Tells the address a member connected from, for the limit of rooms from one address. Without it there is no such limit. */
  addressOf?: (member: Member) => string | undefined;
  /** How long the host of an online room can be disconnected before another player becomes the host, in milliseconds. */
  hostGrace?: number;
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
  /** The order in which the players came into the room: the one with the smallest has been there the longest. */
  joined: number;
  /** How many rounds of the game the player has won. */
  wins: number;
  /** The money of the player in dollars. It can be below zero. */
  money: number;
  /** How many the player has of each weapon, by its id. The weapons there is no end of are not here. */
  weapons: Record<string, number>;
  /** The id of the weapon the tank fires next. */
  weapon: string;
  /**
   * The player left after the game had finished: it is still among the players, so that the result
   * of the game stays as it was, until the room goes back to the lobby.
   */
  gone?: boolean;
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
  /** How many players have come into the room in all. */
  joins: number;
  /** The order in which the rooms were created. */
  created: number;
  /** The address the room was created from, if it is known. */
  creator: string | undefined;
  /** In an online room: the id of the player who is the host, and whether the room is in the list of public games. */
  hostId: number | null;
  public: boolean;
  /** In the lobby of an online room: when the game starts by itself or the room is closed, and the timer that does it. */
  lobbyEndsAt: number;
  lobbyTimer: ReturnType<typeof setTimeout> | null;
  /** In an online room: passes the host on, when the host has been disconnected for too long. */
  hostTimer: ReturnType<typeof setTimeout> | null;
  /** The connection of the screen, null while there is none. */
  screen: Member | null;
  /** The playing field, once the game has started. */
  field: FieldState | null;
  /** What is random in the round that is being played is drawn from this. */
  random: Random;
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
  /** Changes the token of a hotseat room now and then. The token of an online room does not change. */
  tokenTimer: ReturnType<typeof setInterval> | null;
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
  private readonly hostGrace: number;
  private readonly maxRooms: number;
  /** How many rooms have been created in all. */
  private created = 0;
  private readonly maxRoomsPerAddress: number;
  private readonly maxOnlineRooms: number;
  private readonly maxOnlineRoomsPerAddress: number;
  private readonly lobbyTime: number;
  private readonly addressOf: (member: Member) => string | undefined;
  /** Moves the projectiles of all the rooms, while there are any in the air. */
  private ticker: ReturnType<typeof setInterval> | null = null;

  /**
   * @param send Sends a message to a member.
   * @param close Closes the connection of a member, after what was sent to it has gone.
   */
  constructor(
    private readonly send: (member: Member, message: ServerMessage) => void,
    private readonly close: (member: Member) => void,
    options: RoomsOptions<Member> = {}
  ) {
    this.tokenPeriod = options.tokenPeriod ?? JOIN_TOKEN_PERIOD;
    this.roomTimeout = options.roomTimeout ?? ROOM_TIMEOUT;
    this.seed = options.seed;
    this.maxWind = options.maxWind ?? DEFAULT_MAX_WIND;
    this.kit = options.kit ?? false;
    this.shopTime = options.shopTime ?? SHOP_TIME;
    this.hostGrace = options.hostGrace ?? HOST_GRACE;
    this.maxRooms = options.maxRooms ?? MAX_ROOMS;
    this.maxRoomsPerAddress = options.maxRoomsPerAddress ?? MAX_ROOMS_PER_ADDRESS;
    this.maxOnlineRooms = options.maxOnlineRooms ?? MAX_ONLINE_ROOMS;
    this.maxOnlineRoomsPerAddress = options.maxOnlineRoomsPerAddress ?? MAX_ONLINE_ROOMS_PER_ADDRESS;
    this.lobbyTime = options.lobbyTime ?? LOBBY_TIME;
    this.addressOf = options.addressOf ?? (() => undefined);
  }

  /** How many rooms there are. */
  get size() {
    return this.rooms.size;
  }

  /** Handles a message of a member. Returns false if the message is not about the rooms. */
  handle(member: Member, message: ClientMessage) {
    switch (message.type) {
      case "create":
        if (message.mode === "online") this.createOnline(member, message.name, message.public, message.settings);
        else this.create(member);
        return true;
      case "list":
        this.list(member);
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
      case "sell":
        this.sell(member, message.weapon);
        return true;
      case "use":
        this.useItem(member, message.item);
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
      if (room.mode === "online") {
        // The host is waited for a moment, in case it comes back; then another player becomes the host
        if (player.id === room.hostId && !room.hostTimer) {
          room.hostTimer = setTimeout(() => {
            room.hostTimer = null;
            this.passHost(room);
          }, this.hostGrace);
        }
        // An online room that nobody is connected to is kept for a while, as a hotseat room without its screen
        if (!room.removeTimer && room.players.every((candidate) => !candidate.member)) {
          room.removeTimer = setTimeout(() => this.remove(room), this.roomTimeout);
        }
      }
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

  /** Whether there is room for one more room, from the address of a member. If not, the member is told so. */
  private hasRoomFor(member: Member, mode: RoomMode) {
    const address = this.addressOf(member);
    const all = [...this.rooms.values()];
    const own = address === undefined ? [] : all.filter((room) => room.creator === address);
    const fits =
      this.rooms.size < this.maxRooms &&
      own.length < this.maxRoomsPerAddress &&
      (mode !== "online" ||
        (all.filter((room) => room.mode === "online").length < this.maxOnlineRooms &&
          own.filter((room) => room.mode === "online").length < this.maxOnlineRoomsPerAddress));
    if (fits) return true;
    this.refuse(member, "busy", "create");
    return false;
  }

  /** A hotseat room, whose host is the screen that creates it. */
  private create(member: Member) {
    if (!this.hasRoomFor(member, "hotseat")) return;
    this.disconnect(member);
    const room = this.newRoom("hotseat", member);
    room.screen = member;
    room.tokenTimer = setInterval(() => this.rotateToken(room), this.tokenPeriod);
    this.sessions.set(member, { room, player: null });
    this.welcomeScreen(room, member);
  }

  /**
   * An online room, whose first player and host is the one who creates it. Its settings are given
   * when it is created and stay as they are, so that those who see the room can choose it by them.
   */
  private createOnline(member: Member, name: string, open: boolean, settings: RoomSettings) {
    if (!this.hasRoomFor(member, "online")) return;
    this.disconnect(member);
    const room = this.newRoom("online", member);
    room.public = open;
    // Only what is known of the settings is kept
    const { maxPlayers, rounds, turns, maxWind, cash, interest, armsLevel, traces, changingWind, suspendDirt, walls } =
      settings;
    room.settings = {
      maxPlayers,
      rounds,
      turns,
      maxWind,
      cash,
      interest,
      armsLevel,
      traces,
      changingWind,
      suspendDirt,
      walls
    };
    const player = this.addPlayer(room, member, name);
    room.hostId = player.id;
    this.openLobby(room);
    this.send(member, { type: "joined", room: room.id, id: player.id, playerKey: player.key });
    this.announce(room);
    this.sendToken(room, member);
  }

  /**
   * The lobby of an online room is open for a limited time, so that a room nobody comes to does not
   * stay in the list. When the time is out the game starts with those who are there; if they are too
   * few to play, the room is closed.
   */
  private openLobby(room: Room<Member>) {
    if (room.lobbyTimer) clearTimeout(room.lobbyTimer);
    room.lobbyEndsAt = Date.now() + this.lobbyTime;
    room.lobbyTimer = setTimeout(() => {
      room.lobbyTimer = null;
      if (room.phase !== "lobby") return;
      if (room.players.length >= MIN_PLAYERS) this.newGame(room);
      else this.remove(room);
    }, this.lobbyTime);
  }

  /** The public online rooms that can be joined: those in the lobby that are not full. */
  private list(member: Member) {
    const rooms = [...this.rooms.values()]
      .filter((room) => room.public && room.phase === "lobby" && room.players.length < room.settings.maxPlayers)
      // Those with the most players first: they are the nearest to starting. The older of two with as many is first.
      .sort((a, b) => b.players.length - a.players.length || a.created - b.created)
      .map((room) => ({
        room: room.id,
        token: room.token,
        host: room.players.find((player) => player.id === room.hostId)?.name ?? "",
        players: room.players.length,
        settings: room.settings,
        startsIn: Math.max(0, room.lobbyEndsAt - Date.now())
      }));
    this.send(member, { type: "rooms", rooms });
  }

  private newRoom(mode: RoomMode, creator: Member) {
    let id = randomId(ROOM_ID_LENGTH);
    while (this.rooms.has(id)) id = randomId(ROOM_ID_LENGTH);

    const room: Room<Member> = {
      id,
      hostKey: randomKey(),
      mode,
      phase: "lobby",
      settings: { ...defaultSettings(), maxWind: this.maxWind },
      players: [],
      joins: 0,
      created: this.created++,
      creator: this.addressOf(creator),
      hostId: null,
      public: false,
      hostTimer: null,
      lobbyEndsAt: 0,
      lobbyTimer: null,
      screen: null,
      field: null,
      random: Math.random,
      shots: [],
      nextShot: 1,
      round: 0,
      nextRoundTimer: null,
      order: [],
      turn: null,
      turnFired: false,
      turnEndsAt: 0,
      turnTimer: null,
      token: this.newToken(mode === "online" ? LINK_TOKEN_LENGTH : JOIN_TOKEN_LENGTH),
      previousToken: null,
      tokenChangedAt: Date.now(),
      tokenTimer: null,
      removeTimer: null,
      ready: new Set(),
      shopEndsAt: 0,
      shopTimer: null
    };
    this.rooms.set(id, room);
    this.tokens.set(room.token, room);
    return room;
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
    // Nobody new comes in once the game has started: not during a round, and not in the shop between two
    if (room.phase !== "lobby") return this.refuse(member, "wrong-phase", "join");
    if (room.players.length >= room.settings.maxPlayers) return this.refuse(member, "room-full", "join");
    this.disconnect(member);

    const player = this.addPlayer(room, member, name);
    this.send(member, { type: "joined", room: room.id, id: player.id, playerKey: player.key });
    if (room.mode === "online") this.sendToken(room, member);
    this.startIfFull(room);
    this.announce(room);
    this.sendField(room);
  }

  /** Makes a member a new player of a room. */
  private addPlayer(room: Room<Member>, member: Member, name: string) {
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
      joined: room.joins++,
      wins: 0,
      money: 0,
      weapons: {},
      weapon: DEFAULT_WEAPON
    };
    room.players.push(player);
    room.players.sort((a, b) => a.id - b.id);
    this.sessions.set(member, { room, player });
    return player;
  }

  private resume(member: Member, id: string, playerKey: string) {
    const room = this.rooms.get(id);
    if (!room) return this.refuse(member, "no-room", "resume");
    const player = room.players.find((candidate) => candidate.key === playerKey && !candidate.gone);
    if (!player) return this.refuse(member, "no-session", "resume");
    this.returnPlayer(member, room, player);
  }

  private rejoin(member: Member, token: string, playerKey: string) {
    const room = this.tokens.get(token);
    if (!room) return this.refuse(member, "bad-token", "rejoin");
    const player = room.players.find((candidate) => candidate.key === playerKey && !candidate.gone);
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
      // Someone is in the room again, and a host that came back in time stays the host
      if (room.mode === "online") {
        if (room.removeTimer) clearTimeout(room.removeTimer);
        room.removeTimer = null;
        if (player.id === room.hostId && room.hostTimer) {
          clearTimeout(room.hostTimer);
          room.hostTimer = null;
        }
      }
    }
    this.send(member, { type: "joined", room: room.id, id: player.id, playerKey: player.key });
    this.announce(room);
    if (room.mode === "online") {
      // An online player shows the field itself: it gets the link of the room and the field as it is now
      this.sendToken(room, member);
      if (room.field) this.send(member, { type: "field", field: room.field });
    }
    this.sendOwnAim(room, player);
    if (room.phase !== "lobby") this.sendWeapons(player);
  }

  private leave(member: Member) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "leave");

    this.sessions.delete(member);
    this.removePlayer(session.room, session.player);
  }

  /**
   * The host of an online room has gone, or has been disconnected for too long: the player who has
   * been in the room the longest becomes the host, one who is connected if there is one.
   */
  private passHost(room: Room<Member>) {
    const old = room.players.find((player) => player.id === room.hostId);
    if (old?.member) return;
    const others = room.players.filter((player) => player !== old && !player.gone).sort((a, b) => a.joined - b.joined);
    const next = others.find((player) => player.member) ?? (old ? null : others[0]);
    if (!next) return;
    room.hostId = next.id;
    this.announce(room);
  }

  private changeSettings(member: Member, settings: RoomSettings) {
    const room = this.roomOfHost(member, "settings");
    if (!room) return;
    if (room.phase !== "lobby") return this.refuse(member, "wrong-phase", "settings");
    // The settings of an online room were given when it was created, and others may have chosen it by them
    if (room.mode === "online") return this.refuse(member, "not-allowed", "settings");
    if (settings.maxPlayers < room.players.length) return this.refuse(member, "not-allowed", "settings");

    // Only what is known of the settings is kept
    const { maxPlayers, rounds, turns, maxWind, cash, interest, armsLevel, traces, changingWind, suspendDirt, walls } =
      settings;
    room.settings = {
      maxPlayers,
      rounds,
      turns,
      maxWind,
      cash,
      interest,
      armsLevel,
      traces,
      changingWind,
      suspendDirt,
      walls
    };
    this.startIfFull(room);
    this.announce(room);
    this.sendField(room);
  }

  private kick(member: Member, id: number) {
    const room = this.roomOfHost(member, "kick");
    if (!room) return;
    const player = room.players.find((candidate) => candidate.id === id);
    // The host of an online room leaves as anyone does, with "leave"
    if (!player || player.member === member) return this.refuse(member, "not-allowed", "kick");

    if (player.member) {
      this.sessions.delete(player.member);
      // Tells the controller that it is not a player of the room any more
      this.send(player.member, { type: "error", code: "no-session" });
    }
    this.removePlayer(room, player);
  }

  private start(member: Member) {
    const room = this.roomOfHost(member, "start");
    if (!room) return;
    if (room.phase !== "lobby") return this.refuse(member, "wrong-phase", "start");
    if (room.players.length < MIN_PLAYERS) return this.refuse(member, "not-allowed", "start");

    this.newGame(room);
  }

  /** After a game has finished: back to the lobby, where a new game can be started and new players can join. */
  private backToLobby(member: Member) {
    const room = this.roomOfHost(member, "lobby");
    if (!room) return;
    if (room.phase !== "finished") return this.refuse(member, "wrong-phase", "lobby");

    room.phase = "lobby";
    // Those who left after the game ended were kept for its result: they are not in the next game
    room.players = room.players.filter((player) => !player.gone);
    room.field = null;
    room.round = 0;
    this.setTurn(room, null);
    for (const player of room.players) player.wins = 0;
    if (room.mode === "online") this.openLobby(room);
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
    this.show(room, { type: "aim", id: tank.id, angle: tank.angle, power: tank.power }, member);
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

  /**
   * A tank fires the weapon its player has chosen: the weapon is used up, and so are the batteries
   * that an energy weapon takes. The power of the shot chooses how many of them.
   */
  private launch(room: Room<Member>, player: Player<Member>, tank: TankState) {
    const chosen = findWeapon(player.weapon);
    let batteries = 0;
    if (chosen?.kind === "plasma" || chosen?.kind === "laser") {
      batteries = batteriesFor(tank.power, player.weapons.battery ?? 0);
      if (batteries > 0) {
        player.weapons.battery -= batteries;
        if (player.weapons.battery <= 0) delete player.weapons.battery;
      }
    }
    const weapon = this.useWeapon(player);
    room.shots.push(launch(tank, room.nextShot++, weapon.id, batteries));
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
      this.launch(room, player, tank);
      this.announce(room);
    } else {
      if (Date.now() < player.reloadedAt) return this.refuse(member, "reloading", "fire");
      // The bigger the weapon, the longer the tank reloads after it
      const weapon = this.launch(room, player, tank);
      player.reloadedAt = Date.now() + weapon.reload * 1000;
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
    if (room.lobbyTimer) clearTimeout(room.lobbyTimer);
    room.lobbyTimer = null;
    for (const player of room.players) {
      player.money = room.settings.cash;
      player.weapons = this.kit ? starterKit() : {};
      player.weapon = DEFAULT_WEAPON;
    }
    this.nextRound(room);
  }

  /** Before each round the shop opens, if anyone has the money to buy anything. Otherwise the round starts at once. */
  private nextRound(room: Room<Member>) {
    const prices = ITEMS.filter((item) => isForSale(item, room.settings.armsLevel)).map((item) => item.price);
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
    const weapon = findItem(id);
    if (!weapon || !isForSale(weapon, room.settings.armsLevel)) return this.refuse(member, "no-weapon", "buy");
    if (player.money < weapon.price) return this.refuse(member, "no-money", "buy");
    const count = (player.weapons[id] ?? 0) + weapon.bundle;
    if (count > MAX_ITEMS) return this.refuse(member, "too-many", "buy");

    player.money -= weapon.price;
    player.weapons[id] = count;
    this.sendWeapons(player);
    this.announce(room);
  }

  private sell(member: Member, id: string) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "sell");
    const { room, player } = session;
    if (room.phase !== "shop") return this.refuse(member, "wrong-phase", "sell");
    const weapon = findItem(id);
    const owned = player.weapons[id] ?? 0;
    if (!weapon || owned <= 0) return this.refuse(member, "no-weapon", "sell");

    const count = sellCount(weapon, owned);
    player.money += sellPrice(weapon, count);
    if (owned > count) player.weapons[id] = owned - count;
    else {
      delete player.weapons[id];
      if (player.weapon === id) player.weapon = DEFAULT_WEAPON;
    }
    this.sendWeapons(player);
    this.announce(room);
  }

  /**
   * A player uses an accessory during a round: a battery gives energy back to the tank, a shield is
   * put up around it in place of the one it may have had. A parachute is not used: it opens by itself.
   */
  private useItem(member: Member, id: string) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "use");
    const { room, player } = session;
    const tank = room.phase === "playing" && room.field?.tanks.find((candidate) => candidate.id === player.id);
    if (!tank || room.nextRoundTimer) return this.refuse(member, "wrong-phase", "use");
    if (tank.energy <= 0) return this.refuse(member, "destroyed", "use");
    const accessory = findAccessory(id);
    if (!accessory || accessory.kind === "parachute" || !(player.weapons[id] > 0)) {
      return this.refuse(member, "no-weapon", "use");
    }
    if (accessory.kind === "battery") {
      // A battery is of no use to a tank that has all of its energy
      if (tank.energy >= MAX_ENERGY) return this.refuse(member, "not-allowed", "use");
      tank.energy = Math.min(MAX_ENERGY, tank.energy + accessory.strength);
    } else {
      tank.shield = accessory.strength;
      tank.shieldMax = accessory.strength;
      // What the shield does beside taking damage is that of the new one only
      delete tank.deflects;
      delete tank.repels;
      delete tank.laserproof;
      if (accessory.deflects) tank.deflects = true;
      if (accessory.repels) tank.repels = accessory.repels;
      if (accessory.laserproof) tank.laserproof = true;
    }
    player.weapons[id] -= 1;
    if (player.weapons[id] <= 0) delete player.weapons[id];
    this.send(member, { type: "energy", energy: tank.energy, shield: tank.shield });
    this.sendWeapons(player);
    // Those who show the field see the energy and the shield of the tank
    this.show(room, { type: "terrain", changes: [], tanks: room.field!.tanks });
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
      // The changes to the dirt during a tick are told together: what digs changes it at every step
      const changes: TerrainChange[] = [];
      // The tanks are told with the dirt, also when only they changed: what burns them does not change the dirt
      let told = false;
      for (let step = 0; step < (STEPS_PER_SECOND * SHOTS_INTERVAL) / 1000; step++) {
        // The parachutes of the players are among what they have: one that opens is used up
        const parachutes = Object.fromEntries(room.players.map((player) => [player.id, player.weapons.parachute ?? 0]));
        // With Suspend Dirt the dirt an explosion leaves in the air stays there, as often as the room is set to
        const { settings, random } = room;
        const hangs = () => random() * 100 < settings.suspendDirt;
        const { shots, events } = stepShots(room.field, room.shots, () => room.nextShot++, parachutes, hangs);
        room.shots = shots;
        for (const event of events) {
          if (event.event === "damage") {
            // The one who fired is paid for the damage to others, and pays for the damage to itself
            const shooter = room.players.find((player) => player.id === event.by);
            if (shooter) shooter.money += damageReward(event.by === event.id, event.amount, event.energy === 0);
            paid = true;
            // The player is told the energy of its own tank; the screen gets it with the tanks below
            const hit = room.players.find((player) => player.id === event.id);
            const shield = room.field.tanks.find((tank) => tank.id === event.id)?.shield ?? 0;
            if (hit?.member) this.send(hit.member, { type: "energy", energy: event.energy, shield });
          } else if (event.event === "shield") {
            // Damage to a shield pays as damage to the tank would have
            const shooter = room.players.find((player) => player.id === event.by);
            if (shooter) shooter.money += damageReward(false, event.amount, false);
            paid = true;
            const owner = room.players.find((player) => player.id === event.id);
            const tank = room.field.tanks.find((candidate) => candidate.id === event.id);
            if (owner?.member && tank) {
              this.send(owner.member, { type: "energy", energy: tank.energy, shield: tank.shield });
            }
          } else if (event.event === "deflect") {
            // The shield lost some of itself: its owner is told, and so are those who show the field
            const owner = room.players.find((player) => player.id === event.id);
            const tank = room.field.tanks.find((candidate) => candidate.id === event.id);
            if (owner?.member && tank) {
              this.send(owner.member, { type: "energy", energy: tank.energy, shield: tank.shield });
            }
            told = true;
          } else if (event.event === "parachute") {
            const owner = room.players.find((player) => player.id === event.id);
            if (owner) {
              owner.weapons.parachute = (owner.weapons.parachute ?? 1) - 1;
              if (owner.weapons.parachute <= 0) delete owner.weapons.parachute;
              this.sendWeapons(owner);
            }
          } else if (event.event === "beam") {
            const { x1, y1, x2, y2, weapon } = event;
            this.show(room, { type: "beam", x1, y1, x2, y2, weapon });
          } else if (event.event === "burn") {
            const { id, x, depths, weapon } = event;
            this.show(room, { type: "burn", id, x, depths, weapon });
          } else if (event.event === "explode") {
            const { x, y, radius, weapon, part } = event;
            this.show(room, { type: "explode", x, y, radius, weapon, ...(part === undefined ? {} : { part }) });
          } else {
            changes.push(...event.ops);
            told = true;
          }
        }
      }
      if (told) this.show(room, { type: "terrain", changes, tanks: room.field.tanks });
      // The money of the players is in the state of the room
      if (paid) this.announce(room);
      // Also when the last one has gone: an empty list tells that nothing is in the air any more
      if (this.viewers(room).length > 0) {
        const shots = room.shots.map(({ id, owner, weapon, x, y, part }) => ({
          id,
          owner,
          weapon,
          x: Math.round(x),
          y: Math.round(y),
          ...(part === undefined ? {} : { part })
        }));
        this.show(room, { type: "shots", shots });
      }
      flying ||= room.shots.length > 0;
      this.endRoundIfOver(room);
      // With Changing Wind the wind moves a little whenever the air has cleared after a shot
      if (room.settings.changingWind && room.shots.length === 0 && !room.nextRoundTimer) {
        room.field.wind = changeWind(room.field.wind, room.settings.maxWind, room.random);
        this.announce(room);
      }
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
    this.show(room, message, member);
    // Also back to the one who said it, to show what was really shown
    this.send(member, message);
  }

  /**
   * Those who show the playing field of a room, and so are told what happens on it: the screen of a
   * hotseat room, and every connected player of an online room, each of whom has the field on its own device.
   */
  private viewers(room: Room<Member>): Member[] {
    if (room.mode === "online") {
      return room.players.flatMap((player) => (player.member ? [player.member] : []));
    }
    return room.screen ? [room.screen] : [];
  }

  /** Tells those who show the playing field something, except the one it is about if it already knows. */
  private show(room: Room<Member>, message: ServerMessage, except?: Member) {
    for (const viewer of this.viewers(room)) if (viewer !== except) this.send(viewer, message);
  }

  /**
   * Whether a member is the host of its room: the one who changes the settings, starts the game and
   * removes players. In a hotseat room the host is the screen, in an online room one of the players.
   */
  private isHost(session: Session<Member>) {
    if (session.room.mode === "online") return session.player !== null && session.player.id === session.room.hostId;
    return session.player === null;
  }

  /** The room a member is the host of. A member that is not a host is refused. */
  private roomOfHost(member: Member, re: ClientMessage["type"]) {
    const session = this.sessions.get(member);
    if (!session || !this.isHost(session)) {
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
    if (room.phase === "finished") {
      // A game that is over stays as it ended: the one who leaves is not taken from its result
      player.gone = true;
      player.member = null;
      if (room.mode === "online") {
        if (room.players.every((candidate) => candidate.gone)) return this.remove(room);
        if (player.id === room.hostId) {
          if (room.hostTimer) clearTimeout(room.hostTimer);
          room.hostTimer = null;
          this.passHost(room);
        }
      }
      return this.announce(room);
    }
    room.players = room.players.filter((candidate) => candidate !== player);
    if (room.mode === "online") {
      // An online game goes on to its end with those who are left; when the last one has gone, so has the room
      if (room.players.length === 0) return this.remove(room);
      if (player.id === room.hostId) {
        if (room.hostTimer) clearTimeout(room.hostTimer);
        room.hostTimer = null;
        this.passHost(room);
      }
    }
    if (room.field) removeTank(room.field, player.id);
    // The turn of a player who went passes on, unless a shot of that turn is still in the air
    if (room.turn === player.id && !room.turnFired) this.passTurn(room);
    else this.announce(room);
    this.sendField(room);
    this.closeShopIfReady(room);
    // The one who went may have been the last one in the way of the end of the round
    if (room.phase === "playing") this.endRoundIfOver(room);
  }

  /** The game starts by itself when the room is full. */
  private startIfFull(room: Room<Member>) {
    if (room.phase === "lobby" && room.players.length >= room.settings.maxPlayers) this.newGame(room);
  }

  /** Starts the game: makes the playing field and tells each player the aim of its tank. */
  private begin(room: Room<Member>) {
    // Each round has a terrain of its own, also when the seed is fixed for a test
    const random = createRandom((this.seed ?? randomInt(2 ** 32)) + room.round);
    room.random = random;
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
      room.settings.maxWind,
      room.settings.walls
    );
    for (const player of room.players) {
      this.sendOwnAim(room, player);
      this.sendWeapons(player);
    }
  }

  /** Sends the playing field to the screen, which shows it. Nothing is sent before the game has started. */
  private sendField(room: Room<Member>) {
    if (room.field) this.show(room, { type: "field", field: room.field });
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
      this.send(player.member, { type: "energy", energy: tank.energy, shield: tank.shield });
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

  private newToken(length = JOIN_TOKEN_LENGTH) {
    let token = randomId(length);
    while (this.tokens.has(token)) token = randomId(length);
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
    // The token of an online room does not change
    const expiresIn = room.tokenTimer ? Math.max(0, room.tokenChangedAt + this.tokenPeriod - Date.now()) : 0;
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
      host: room.hostId,
      public: room.public,
      startsIn: room.lobbyTimer && room.phase === "lobby" ? Math.max(0, room.lobbyEndsAt - Date.now()) : null,
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
    if (room.tokenTimer) clearInterval(room.tokenTimer);
    if (room.hostTimer) clearTimeout(room.hostTimer);
    if (room.lobbyTimer) clearTimeout(room.lobbyTimer);
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
