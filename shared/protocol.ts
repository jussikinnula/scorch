/**
 * The WebSocket API between the clients (the big screen, the controllers, later the online players)
 * and the server. The messages are JSON objects with a type. This file is the single place where
 * they are described: both the server and the frontend import it. docs/PROTOCOL.md tells how the
 * messages are used.
 *
 * Everything here is implemented: the rooms (creating one, joining it with the QR code, its lobby),
 * the playing field, turning the turret ("aim"), choosing a weapon ("weapon"), firing ("fire") and
 * the speech bubbles ("say").
 */

/** The path of the WebSocket API on the server. */
export const SOCKET_PATH = "/ws";

/**
 * The version of the API. It is raised by one whenever anything in the API changes: a message, a
 * field, a limit, or what a message means. A client and a server talk only if they have the same
 * version: there is no point in trying when one does not know what the other means.
 *
 * A client tells its version in the address it connects to (see socketPath), the server in its
 * greeting. The test of this file fails when the messages change and the version does not.
 */
export const PROTOCOL_VERSION = 14;

/** The name of the part of the address of the WebSocket API where a client tells its version. */
export const PROTOCOL_PARAMETER = "protocol";

/** The path a client of this version connects to, e.g. /ws?protocol=2. */
export const socketPath = () => `${SOCKET_PATH}?${PROTOCOL_PARAMETER}=${PROTOCOL_VERSION}`;

// Limits. The server enforces them, and the frontend uses them to not send what would be refused.

export const MIN_PLAYERS = 2;
/** The largest number of players a room can be set to. */
export const MAX_PLAYERS = 10;
/** The maximum number of players of a new room. */
export const DEFAULT_MAX_PLAYERS = 8;
/** How many rounds a game can have, and how many a new room has: as in the original. */
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 1000;
export const DEFAULT_ROUNDS = 10;
/** The strongest wind a room can be set to, and that of a new room: as in the original. 0 is no wind. */
export const MAX_WIND = 500;
export const DEFAULT_MAX_WIND = 200;
/** The most money a room can give its players at the start of a game. A new room gives none, as the original. */
export const MAX_CASH = 1000000;
/** The interest that unspent money earns between two rounds, in per cent: the range and the default of the original. */
export const MAX_INTEREST = 30;
export const DEFAULT_INTEREST = 5;
/** The arms level of a room: the weapons of a higher level are not sold. The highest, which sells everything, is the default of the original. */
export const MAX_ARMS_LEVEL = 4;
/** The steps in which the screen changes the strongest wind. */
export const WIND_STEP = 50;
export const MAX_NAME_LENGTH = 16;
/** The longest text of a speech bubble, in characters. */
export const MAX_SAY_LENGTH = 60;
/** The angle of the turret in whole degrees: 0 points right, 90 up and 180 left. */
export const MIN_ANGLE = 0;
export const MAX_ANGLE = 180;
/** The firing power. The maximum of a tank is ten times its energy, as in the original. */
export const MIN_POWER = 0;
export const MAX_POWER = 1000;
/** How often the token of the QR code changes, in milliseconds. The previous token still works. */
export const JOIN_TOKEN_PERIOD = 30000;
/** How often a client sends its aim at most, in milliseconds. Only the latest aim is sent. */
export const AIM_INTERVAL = 50;
/** The shortest time between the speech bubbles of a player, in milliseconds. */
export const SAY_INTERVAL = 2000;
/** How long a player has for a turn in the classic mode, in milliseconds. After it the turn is skipped. */
export const TURN_TIME = 45000;
/** The energy of a new tank. A tank is destroyed when its energy is 0. */
export const MAX_ENERGY = 100;
/** How long the result of a round is shown before the next round starts, in milliseconds. */
export const ROUND_PAUSE = 5000;
/** How often those who show the field are told where the projectiles are, in milliseconds. */
export const SHOTS_INTERVAL = 50;

/** What rooms, tokens and keys look like: letters, digits, _ and -. They are used in addresses. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

// The state of a room

/**
 * How a room is played. Hotseat: one big screen shows the field, and the phones that join with its
 * QR code are the controllers. Online: every player has the field and the controls on a device of
 * its own, and joins from the list of public games or with a link.
 */
export type RoomMode = "hotseat" | "online";

/**
 * How long an online room waits for players in its lobby, in milliseconds. When the time is out the
 * game starts by itself with those who are there, or the room is closed if there are too few of them.
 */
export const LOBBY_TIME = 5 * 60 * 1000;

/** How long the host of an online room can be disconnected before another player becomes the host, in milliseconds. */
export const HOST_GRACE = 10000;

/**
 * Where a room is in a game: in the lobby before it, playing a round, in the shop between two
 * rounds, or finished, with the final results shown.
 */
export type RoomPhase = "lobby" | "playing" | "shop" | "finished";

/**
 * How the turns of a round go. Classic: one player at a time aims and fires, and the turn passes
 * when the shot is over (the Sequential mode of the original). Live: everyone fires whenever their
 * tank has reloaded.
 */
export type TurnMode = "classic" | "live";

/**
 * What the edges of the field do to a projectile (the walls of the original):
 * - none: it flies out. Past a side it is followed for a while and then gone; above the field it comes back down.
 * - rubber: it bounces back from the sides and from the top of the field.
 * - wraparound: what leaves from one side comes in from the other.
 */
export type WallMode = "none" | "rubber" | "wraparound";

export interface RoomSettings {
  /** The room is full, and in the lobby the game starts by itself, when this many have joined. */
  maxPlayers: number;
  /** How many rounds the game has. */
  rounds: number;
  turns: TurnMode;
  /** The strongest wind a round can have. The wind of each round is drawn from none to this, either way: mostly much less. */
  maxWind: number;
  /** The money each player has at the start of a game (Cash at Start). */
  cash: number;
  /** The interest that money which is not spent earns between two rounds, in per cent (Interest Rate). */
  interest: number;
  /** The weapons of a higher level than this are not sold (Arms Level, shared/weapons.ts). */
  armsLevel: number;
  /**
   * Whether every projectile leaves a trace of its path on the field for the rest of the round, as
   * a Tracer always does (Trace Paths).
   */
  traces: boolean;
  /** Whether the wind changes a little after every shot of a round (Changing Wind). */
  changingWind: boolean;
  /**
   * The chance, in per cent, that the dirt an explosion leaves with nothing under it stays hanging
   * in the air instead of falling (Suspend Dirt). 0: all dirt always falls.
   */
  suspendDirt: number;
  walls: WallMode;
}

export interface PlayerInfo {
  /** The number of the player in the room, from 0. It also picks the colour of the tank. */
  id: number;
  name: string;
  /** Whether the device of the player is connected right now. */
  connected: boolean;
  /** How many rounds of the game the player has won: its tank was the last one left. */
  wins: number;
  /** The money of the player in dollars. It can be below zero. Everyone sees it, as in the rankings of the original. */
  money: number;
}

/** The settings of a new room: those of the original where it has them. */
export const defaultSettings = (): RoomSettings => ({
  maxPlayers: DEFAULT_MAX_PLAYERS,
  rounds: DEFAULT_ROUNDS,
  turns: "classic",
  maxWind: DEFAULT_MAX_WIND,
  cash: 0,
  interest: DEFAULT_INTEREST,
  armsLevel: MAX_ARMS_LEVEL,
  traces: false,
  changingWind: false,
  suspendDirt: 0,
  walls: "none"
});

/** Everything about a room that everyone in it may know. There are no keys or tokens in it. */
export interface RoomState {
  room: string;
  mode: RoomMode;
  phase: RoomPhase;
  settings: RoomSettings;
  players: PlayerInfo[];
  /** Whether the screen of a hotseat room is connected. The game is paused while it is not. Always false in an online room. */
  screen: boolean;
  /**
   * The id of the player who is the host of an online room: the one who changes the settings, starts
   * the game and removes players. Null in a hotseat room, whose host is its screen.
   */
  host: number | null;
  /** Whether an online room is in the list of public games. False in a hotseat room. */
  public: boolean;
  /**
   * In the lobby of an online room: how long it is, in milliseconds, until the game starts by itself
   * with those who are there, or the room is closed if they are too few to play. Otherwise null.
   */
  startsIn: number | null;
  /** The number of the round that is being played, from 1. 0 before the game. */
  round: number;
  /**
   * In the classic mode, while a round is played: the id of the player whose turn it is, and how
   * long the player still has to fire, in milliseconds (0 once the shot has been fired). Otherwise null.
   */
  turn: { player: number; time: number } | null;
  /**
   * The wind of the round that is being played: how hard it blows, with a sign for the way. Positive
   * blows to the right. It pushes everything in the air sideways (shared/sim/shots.ts). 0 outside a
   * round. With Changing Wind on it changes during the round, and the state is sent again when it does.
   */
  wind: number;
  /**
   * While the shop is open: how long it still is, in milliseconds, and the ids of the players who
   * have said they are ready. Otherwise null.
   */
  shop: { time: number; ready: number[] } | null;
}

/** An online room in the list of public games. */
export interface PublicRoom {
  room: string;
  /** The token to join it with. */
  token: string;
  /** The name of its host. */
  host: string;
  players: number;
  settings: RoomSettings;
  /** How long it is until the game starts by itself, in milliseconds. */
  startsIn: number;
}

/** A tank on the playing field. */
export interface TankState {
  /** The id of the player. */
  id: number;
  /** The middle of the bottom of the tank, in pixels of the playing field. */
  x: number;
  y: number;
  angle: number;
  /** At most ten times the energy of the tank, as in the original. */
  power: number;
  /** From 100 down to 0. A tank with no energy is destroyed: it stays on the field as a wreck. */
  energy: number;
  /**
   * How much damage the shield of the tank still takes, and how much it took when it was put up.
   * Both are 0 when the tank has no shield.
   */
  shield: number;
  shieldMax: number;
}

/** A projectile in the air, as it is shown. */
export interface ShotState {
  id: number;
  /** The id of the player who fired it. */
  owner: number;
  /** The id of the weapon (shared/weapons.ts), which tells what it looks like. */
  weapon: string;
  /** In pixels of the playing field. A projectile can be outside the field: above it, or past its sides. */
  x: number;
  y: number;
  /**
   * Of a bomb that a weapon threw from where it went off (a Funky Bomb): which of them it is, from 0.
   * Such a bomb is shown with a trace from where it was thrown, in a colour of its own.
   */
  part?: number;
}

/**
 * A change to the dirt of the playing field. Those who show the field make the same changes to
 * their own copy of the terrain, with the code of shared/sim/terrain.ts.
 */
export type TerrainChange =
  /** The dirt inside a circle is destroyed. */
  | { op: "carve"; x: number; y: number; r: number }
  /** A ball of dirt is made. */
  | { op: "fill"; x: number; y: number; r: number }
  /** All the dirt that has nothing under it falls straight down. */
  | { op: "settle" }
  /** Liquid dirt is poured on the ground at a column: it flows downhill, fills the holes it reaches and sets. The amount is in pixels of dirt. */
  | { op: "pour"; x: number; amount: number };

/** The playing field at the start of a round. */
export interface FieldState {
  width: number;
  height: number;
  /**
   * The dirt, column by column from the left. A column is a list of pairs of y coordinates, from
   * the top down: dirt from the first (inclusive) to the second (exclusive) of each pair.
   * A column of plain ground is one pair, e.g. [412, 720].
   */
  terrain: number[][];
  tanks: TankState[];
  /** The wind of the round, as in the state of the room. */
  wind: number;
  /** What the edges of the field do to a projectile, as in the settings of the room. */
  walls: WallMode;
}

// The messages

export type ErrorCode =
  /** The client has another version of the API than the server. Nothing but a ping is answered. */
  | "wrong-version"
  /** The message was not a message of the API. */
  | "bad-message"
  /** The token of the QR code is not valid (any more). */
  | "bad-token"
  /** There is no such room (any more). */
  | "no-room"
  /** The key does not open the room: not its host, or not a player of it. */
  | "no-session"
  | "room-full"
  /** The server has as many games as it takes, in all or from this address. */
  | "busy"
  | "bad-name"
  /** The client is not in a room, or its role may not do this. */
  | "not-allowed"
  /** The room is not in a phase where this can be done. */
  | "wrong-phase"
  | "rate-limited"
  /** The tank is still reloading after its last shot. */
  | "reloading"
  /** There is no such weapon, or the player has none of it. */
  | "no-weapon"
  /** The player does not have the money for what it tried to buy. */
  | "no-money"
  /** The player would have more of an item than anyone can have. */
  | "too-many"
  /** The tank of the player has been destroyed. */
  | "destroyed"
  /** In the classic mode: it is not the turn of the player, or the player has already fired on this turn. */
  | "not-your-turn"
  /** Another connection took over this screen or this player. The server closes this one. */
  | "replaced";

/** What a client sends to the server. */
export type ClientMessage =
  | { type: "ping" }
  /** A screen creates a hotseat room and becomes its host. Answered with "created". */
  | { type: "create"; mode: "hotseat" }
  /**
   * A player creates an online room, and is its first player and its host. A public room is in the
   * list of games anyone can join; a private one is joined only with its link. The settings of an
   * online room are given here and stay as they are: those who see the room choose it by them.
   * Answered with "joined".
   */
  | { type: "create"; mode: "online"; name: string; public: boolean; settings: RoomSettings }
  /** Asks for the public online rooms that can be joined. Answered with "rooms". */
  | { type: "list" }
  /** A screen returns to its room, e.g. after a reload. Answered with "created". */
  | { type: "host"; room: string; hostKey: string }
  /** A controller joins the room of a token of the QR code. Answered with "joined". */
  | { type: "join"; token: string; name: string }
  /** A controller returns to its player, e.g. after the phone was locked. Answered with "joined". */
  | { type: "resume"; room: string; playerKey: string }
  /**
   * A device that has been a player somewhere asks, with a token of the QR code, whether it is a
   * player of that room. If it is, it returns to the player ("joined"); if not, the answer is the
   * error "no-session", and the device can join as a new player.
   */
  | { type: "rejoin"; token: string; playerKey: string }
  /** A player leaves the room for good. */
  | { type: "leave" }
  /** The host changes the settings of a hotseat room, in the lobby. Those of an online room cannot be changed. */
  | { type: "settings"; settings: RoomSettings }
  /** The host removes a player. */
  | { type: "kick"; id: number }
  /** The host starts the game. */
  | { type: "start" }
  /** The host takes a finished game back to the lobby, where a new one can be started and new players can join. */
  | { type: "lobby" }
  /** A player turns the turret or sets the power, or both. */
  | { type: "aim"; angle?: number; power?: number }
  /** A player chooses the weapon the tank fires next. Answered with "weapons". */
  | { type: "weapon"; weapon: string }
  /** In the shop: a player buys a bundle of a weapon. Answered with "weapons"; the money is in the state of the room. */
  | { type: "buy"; weapon: string }
  /**
   * In the shop: a player sells a bundle of a weapon back, or what it has left of one, for less than
   * it costs. Answered with "weapons"; the money is in the state of the room.
   */
  | { type: "sell"; weapon: string }
  /** In the shop: a player has bought what it wants. The next round starts when everyone has said so. */
  | { type: "ready" }
  /**
   * A player uses an accessory it has, during a round: a battery gives the tank energy, a shield is
   * put up around it. Answered with "energy" and "weapons".
   */
  | { type: "use"; item: string }
  /** A player fires the tank, with the aim and the weapon it has. */
  | { type: "fire" }
  /** A player says something in a speech bubble above the tank. */
  | { type: "say"; text: string };

/** What the server sends to a client. */
export type ServerMessage =
  | { type: "hello"; protocol: number }
  | { type: "pong" }
  /** Something a client asked for was refused. "re" is the type of the message that was refused. */
  | { type: "error"; code: ErrorCode; re?: ClientMessage["type"] }
  /** To a screen: it is the host of the room. The key is a secret to keep on the device. */
  | { type: "created"; room: string; hostKey: string }
  /** To a controller: it is this player of the room. The key is a secret to keep on the device. */
  | { type: "joined"; room: string; id: number; playerKey: string }
  /** The public online rooms that can be joined right now: those in the lobby that are not full. */
  | { type: "rooms"; rooms: PublicRoom[] }
  /**
   * To the screen: the token to show in the QR code, and for how long it is the newest, in milliseconds.
   * To a player of an online room: the token of the link to the room, which does not change (expiresIn is 0).
   */
  | { type: "token"; token: string; expiresIn: number }
  /** To everyone in the room: the state of the room, whenever something in it changes. */
  | { type: "room"; state: RoomState }
  /** To those who show the playing field: the field at the start of a round. */
  | { type: "field"; field: FieldState }
  /** To those who show the playing field: the aim of a tank changed. To a controller: the aim of its own tank, when it cannot know it. */
  | { type: "aim"; id: number; angle: number; power: number }
  /** To a player: the energy of its tank and what is left of its shield (0 when it has none), at first and whenever either changes. */
  | { type: "energy"; energy: number; shield: number }
  /** To everyone in the room: the round ended. The winner is the id of the player whose tank is left, null if none is. */
  | { type: "roundOver"; round: number; winner: number | null }
  /** To a player: how long its tank still reloads, in milliseconds. 0 when it can fire. */
  | { type: "reload"; time: number }
  /** To those who show the playing field: all the projectiles in the air, while there are any, and once more when there are none. */
  | { type: "shots"; shots: ShotState[] }
  /**
   * To a player: the weapon its tank fires next, and how many it has of each weapon and accessory, by
   * the id of the item. A weapon there is no end of (the Baby Missile) is not among them, nor an item
   * the player has none of.
   */
  | { type: "weapons"; selected: string; counts: Record<string, number> }
  /** To those who show the playing field: a weapon went off. The id of the weapon tells what it looks and sounds like. */
  | { type: "explode"; x: number; y: number; radius: number; weapon: string; part?: number }
  /**
   * To those who show the playing field: something that burns lies on the ground (Napalm). How deep
   * it lies on each column, in pixels, from the column x to the right. It is told again with the
   * same id while it spreads: each telling is all of it. It burns for a moment after the last one.
   */
  | { type: "burn"; id: number; x: number; depths: number[]; weapon: string }
  /** To those who show the playing field: the dirt changed, and the tanks are as they are after it: where, and with what energy. */
  | { type: "terrain"; changes: TerrainChange[]; tanks: TankState[] }
  /** To those who show the playing field, and to the one who said it: a speech bubble. */
  | { type: "say"; id: number; text: string };

// Checking what a client sent. Nothing a client sends is trusted.

const isInteger = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const isId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

/** A text of at most the given number of characters that is not empty or only spaces, and has no control characters. */
function isText(value: unknown, maxLength: number): value is string {
  if (typeof value !== "string") return false;
  const length = [...value].length;
  // eslint-disable-next-line no-control-regex
  return length > 0 && length <= maxLength && value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
}

export function isRoomSettings(value: unknown): value is RoomSettings {
  if (typeof value !== "object" || value === null) return false;
  const { maxPlayers, rounds, turns, maxWind, cash, interest, armsLevel, traces, changingWind, suspendDirt, walls } =
    value as RoomSettings;
  return (
    isInteger(maxPlayers, MIN_PLAYERS, MAX_PLAYERS) &&
    isInteger(rounds, MIN_ROUNDS, MAX_ROUNDS) &&
    isInteger(maxWind, 0, MAX_WIND) &&
    isInteger(cash, 0, MAX_CASH) &&
    isInteger(interest, 0, MAX_INTEREST) &&
    isInteger(armsLevel, 0, MAX_ARMS_LEVEL) &&
    typeof traces === "boolean" &&
    typeof changingWind === "boolean" &&
    isInteger(suspendDirt, 0, 100) &&
    (walls === "none" || walls === "rubber" || walls === "wraparound") &&
    (turns === "classic" || turns === "live")
  );
}

/** Whether something received from a client is a message of the API. */
export function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;

  switch (message.type) {
    case "ping":
    case "list":
    case "leave":
    case "start":
    case "lobby":
    case "ready":
    case "fire":
      return true;
    case "create":
      if (message.mode === "online") {
        return (
          isText(message.name, MAX_NAME_LENGTH) &&
          typeof message.public === "boolean" &&
          isRoomSettings(message.settings)
        );
      }
      return message.mode === "hotseat";
    case "host":
      return isId(message.room) && isId(message.hostKey);
    case "join":
      return isId(message.token) && isText(message.name, MAX_NAME_LENGTH);
    case "resume":
      return isId(message.room) && isId(message.playerKey);
    case "rejoin":
      return isId(message.token) && isId(message.playerKey);
    case "settings":
      return isRoomSettings(message.settings);
    case "kick":
      return isInteger(message.id, 0, MAX_PLAYERS - 1);
    case "aim": {
      const { angle, power } = message;
      if (angle === undefined && power === undefined) return false;
      return (
        (angle === undefined || isInteger(angle, MIN_ANGLE, MAX_ANGLE)) &&
        (power === undefined || isInteger(power, MIN_POWER, MAX_POWER))
      );
    }
    case "weapon":
    case "buy":
    case "sell":
      return isId(message.weapon);
    case "use":
      return isId(message.item);
    case "say":
      return isText(message.text, MAX_SAY_LENGTH);
    default:
      return false;
  }
}
