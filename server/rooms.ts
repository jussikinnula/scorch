import { randomBytes, randomInt } from "crypto";

import {
  ClientMessage,
  DEFAULT_MAX_PLAYERS,
  ErrorCode,
  FieldState,
  JOIN_TOKEN_PERIOD,
  MAX_NAME_LENGTH,
  MIN_PLAYERS,
  PlayerInfo,
  RELOAD_TIME,
  SAY_INTERVAL,
  RoomMode,
  RoomPhase,
  RoomSettings,
  RoomState,
  ServerMessage,
  SHOTS_INTERVAL
} from "../shared/protocol";
import { launch, Shot, stepShots, STEPS_PER_SECOND } from "../shared/sim/shots";
import { createField, removeTank } from "../shared/sim/field";
import { createRandom } from "../shared/sim/random";

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
      case "aim":
        this.aim(member, message.angle, message.power);
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
      settings: { maxPlayers: DEFAULT_MAX_PLAYERS },
      players: [],
      screen: member,
      field: null,
      shots: [],
      nextShot: 1,
      token: this.newToken(),
      previousToken: null,
      tokenChangedAt: Date.now(),
      tokenTimer: setInterval(() => this.rotateToken(room), this.tokenPeriod),
      removeTimer: null
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
    // Nobody new comes in while the game is going on
    if (room.phase !== "lobby") return this.refuse(member, "wrong-phase", "join");
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
      reloadedAt: 0
    };
    room.players.push(player);
    room.players.sort((a, b) => a.id - b.id);
    this.sessions.set(member, { room, player });

    this.send(member, { type: "joined", room: room.id, id, playerKey: player.key });
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

    room.settings = { maxPlayers: settings.maxPlayers };
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

    this.begin(room);
    this.announce(room);
    this.sendField(room);
  }

  private aim(member: Member, angle: number | undefined, power: number | undefined) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "aim");
    const { room, player } = session;
    const tank = room.field?.tanks.find((candidate) => candidate.id === player.id);
    if (!tank) return this.refuse(member, "wrong-phase", "aim");

    if (angle !== undefined) tank.angle = angle;
    if (power !== undefined) tank.power = power;
    // Not back to the controller: it already shows what the player did
    if (room.screen) this.send(room.screen, { type: "aim", id: tank.id, angle: tank.angle, power: tank.power });
  }

  private fire(member: Member) {
    const session = this.sessions.get(member);
    if (!session?.player) return this.refuse(member, "not-allowed", "fire");
    const { room, player } = session;
    const tank = room.field?.tanks.find((candidate) => candidate.id === player.id);
    if (!tank) return this.refuse(member, "wrong-phase", "fire");
    if (Date.now() < player.reloadedAt) return this.refuse(member, "reloading", "fire");

    player.reloadedAt = Date.now() + RELOAD_TIME;
    room.shots.push(launch(tank, room.nextShot++));
    this.send(member, { type: "reload", time: RELOAD_TIME });
    this.startTicker();
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

      for (let step = 0; step < (STEPS_PER_SECOND * SHOTS_INTERVAL) / 1000; step++) {
        const { shots, events } = stepShots(room.field, room.shots);
        room.shots = shots;
        for (const event of events) {
          if (!room.screen) continue;
          if (event.event === "explode") {
            this.send(room.screen, { type: "explode", x: event.x, y: event.y, radius: event.radius });
          } else {
            this.send(room.screen, { type: "terrain", changes: event.ops, tanks: room.field.tanks });
          }
        }
      }
      // Also when the last one has gone: an empty list tells that nothing is in the air any more
      if (room.screen) {
        const shots = room.shots.map(({ id, owner, x, y }) => ({ id, owner, x: Math.round(x), y: Math.round(y) }));
        this.send(room.screen, { type: "shots", shots });
      }
      flying ||= room.shots.length > 0;
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
    this.announce(room);
    if (room.field) {
      removeTank(room.field, player.id);
      this.sendField(room);
    }
  }

  /** The game starts by itself when the room is full. */
  private startIfFull(room: Room<Member>) {
    if (room.phase === "lobby" && room.players.length >= room.settings.maxPlayers) this.begin(room);
  }

  /** Starts the game: makes the playing field and tells each player the aim of its tank. */
  private begin(room: Room<Member>) {
    const random = createRandom(this.seed ?? randomInt(2 ** 32));
    room.phase = "playing";
    room.field = createField(
      room.players.map((player) => player.id),
      random
    );
    for (const player of room.players) this.sendOwnAim(room, player);
  }

  /** Sends the playing field to the screen, which shows it. Nothing is sent before the game has started. */
  private sendField(room: Room<Member>) {
    if (room.field && room.screen) this.send(room.screen, { type: "field", field: room.field });
  }

  /**
   * Tells a player what only the server knows about its tank, when the player cannot know it, at
   * first and after returning: the aim, and how long the tank still reloads.
   */
  private sendOwnAim(room: Room<Member>, player: Player<Member>) {
    const tank = room.field?.tanks.find((candidate) => candidate.id === player.id);
    if (tank && player.member) {
      this.send(player.member, { type: "aim", id: tank.id, angle: tank.angle, power: tank.power });
      this.send(player.member, { type: "reload", time: Math.max(0, player.reloadedAt - Date.now()) });
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
    const players: PlayerInfo[] = room.players.map(({ id, name, member }) => ({
      id,
      name,
      connected: member !== null
    }));
    return {
      room: room.id,
      mode: room.mode,
      phase: room.phase,
      settings: room.settings,
      players,
      screen: room.screen !== null
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
