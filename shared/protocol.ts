/**
 * The WebSocket API between the clients (the big screen, the controllers, later the online players)
 * and the server. The messages are JSON objects with a type. This file is the single place where
 * they are described: both the server and the frontend import it. docs/PROTOCOL.md tells how the
 * messages are used.
 *
 * Everything here is implemented: the rooms (creating one, joining it with the QR code, its lobby),
 * the playing field, turning the turret ("aim"), firing ("fire") and the speech bubbles ("say").
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
export const PROTOCOL_VERSION = 4;

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
/** How long a tank reloads after firing, in milliseconds. So far there is one weapon, the Baby Missile. */
export const RELOAD_TIME = 3000;
/** The energy of a new tank. A tank is destroyed when its energy is 0. */
export const MAX_ENERGY = 100;
/** How long the result of a round is shown before the next round starts, in milliseconds. */
export const ROUND_PAUSE = 5000;
/** How often those who show the field are told where the projectiles are, in milliseconds. */
export const SHOTS_INTERVAL = 50;

/** What rooms, tokens and keys look like: letters, digits, _ and -. They are used in addresses. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

// The state of a room

/** How a room is joined. "online" comes later. */
export type RoomMode = "hotseat";

/** Where a room is in a match. The shop, the results and the end come with the game. */
export type RoomPhase = "lobby" | "playing";

export interface RoomSettings {
  /** The room is full, and in the lobby the game starts by itself, when this many have joined. */
  maxPlayers: number;
}

export interface PlayerInfo {
  /** The number of the player in the room, from 0. It also picks the colour of the tank. */
  id: number;
  name: string;
  /** Whether the device of the player is connected right now. */
  connected: boolean;
}

/** Everything about a room that everyone in it may know. There are no keys or tokens in it. */
export interface RoomState {
  room: string;
  mode: RoomMode;
  phase: RoomPhase;
  settings: RoomSettings;
  players: PlayerInfo[];
  /** Whether the screen of a hotseat room is connected. The game is paused while it is not. */
  screen: boolean;
  /** The number of the round that is being played, from 1. 0 before the game. */
  round: number;
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
}

/** A projectile in the air, as it is shown. */
export interface ShotState {
  id: number;
  /** The id of the player who fired it. */
  owner: number;
  /** In pixels of the playing field. A projectile can be outside the field: above it, or past its sides. */
  x: number;
  y: number;
}

/**
 * A change to the dirt of the playing field. Those who show the field make the same changes to
 * their own copy of the terrain, with the code of shared/sim/terrain.ts.
 */
export type TerrainChange =
  /** The dirt inside a circle is destroyed. */
  | { op: "carve"; x: number; y: number; r: number }
  /** All the dirt that has nothing under it falls straight down. */
  | { op: "settle" };

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
  | "bad-name"
  /** The client is not in a room, or its role may not do this. */
  | "not-allowed"
  /** The room is not in a phase where this can be done. */
  | "wrong-phase"
  | "rate-limited"
  /** The tank is still reloading after its last shot. */
  | "reloading"
  /** The tank of the player has been destroyed. */
  | "destroyed"
  /** Another connection took over this screen or this player. The server closes this one. */
  | "replaced";

/** What a client sends to the server. */
export type ClientMessage =
  | { type: "ping" }
  /** A screen creates a hotseat room and becomes its host. Answered with "created". */
  | { type: "create"; mode: RoomMode }
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
  /** The host changes the settings of the room, in the lobby. */
  | { type: "settings"; settings: RoomSettings }
  /** The host removes a player. */
  | { type: "kick"; id: number }
  /** The host starts the game. */
  | { type: "start" }
  /** A player turns the turret or sets the power, or both. */
  | { type: "aim"; angle?: number; power?: number }
  /** A player fires the tank, with the aim it has. */
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
  /** To the screen: the token to show in the QR code, and for how long it is the newest, in milliseconds. */
  | { type: "token"; token: string; expiresIn: number }
  /** To everyone in the room: the state of the room, whenever something in it changes. */
  | { type: "room"; state: RoomState }
  /** To those who show the playing field: the field at the start of a round. */
  | { type: "field"; field: FieldState }
  /** To those who show the playing field: the aim of a tank changed. To a controller: the aim of its own tank, when it cannot know it. */
  | { type: "aim"; id: number; angle: number; power: number }
  /** To a player: the energy of its tank, at first and whenever it changes. */
  | { type: "energy"; energy: number }
  /** To everyone in the room: the round ended. The winner is the id of the player whose tank is left, null if none is. */
  | { type: "roundOver"; round: number; winner: number | null }
  /** To a player: how long its tank still reloads, in milliseconds. 0 when it can fire. */
  | { type: "reload"; time: number }
  /** To those who show the playing field: all the projectiles in the air, while there are any, and once more when there are none. */
  | { type: "shots"; shots: ShotState[] }
  /** To those who show the playing field: an explosion. */
  | { type: "explode"; x: number; y: number; radius: number }
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
  return isInteger((value as RoomSettings).maxPlayers, MIN_PLAYERS, MAX_PLAYERS);
}

/** Whether something received from a client is a message of the API. */
export function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;

  switch (message.type) {
    case "ping":
    case "leave":
    case "start":
    case "fire":
      return true;
    case "create":
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
    case "say":
      return isText(message.text, MAX_SAY_LENGTH);
    default:
      return false;
  }
}
