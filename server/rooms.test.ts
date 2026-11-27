// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MAX_PLAYERS, MAX_NAME_LENGTH, RoomState, ServerMessage, defaultSettings } from "../shared/protocol";
import Rooms, { JOIN_TOKEN_LENGTH, LINK_TOKEN_LENGTH, ROOM_ID_LENGTH, RoomsOptions } from "./rooms";

/** A connection of a test: it collects what the rooms send to it. */
interface Member {
  name: string;
  messages: ServerMessage[];
  closed: boolean;
}

const TOKEN_PERIOD = 30000;
const ROOM_TIMEOUT = 300000;

describe("Rooms", () => {
  let rooms: Rooms<Member>;

  const member = (name: string): Member => ({ name, messages: [], closed: false });

  /** The last message of a type that a member has got. */
  const last = <Type extends ServerMessage["type"]>(of: Member, type: Type) => {
    const message = of.messages.filter((candidate) => candidate.type === type).pop();
    if (!message) throw new Error(`${of.name} has not got a "${type}" message`);
    return message as Extract<ServerMessage, { type: Type }>;
  };
  /** All the messages of a type that a member has got. */
  const all = <Type extends ServerMessage["type"]>(of: Member, type: Type) =>
    of.messages.filter((candidate) => candidate.type === type) as Extract<ServerMessage, { type: Type }>[];
  const state = (of: Member): RoomState => last(of, "room").state;
  const errors = (of: Member) => of.messages.filter((message) => message.type === "error");

  /** A screen with a room of its own. */
  const createRoom = () => {
    const screen = member("screen");
    rooms.handle(screen, { type: "create", mode: "hotseat" });
    return screen;
  };

  /** A controller that joins the room of a screen with the newest token. */
  const joinRoom = (screen: Member, name: string) => {
    const controller = member(name);
    rooms.handle(controller, { type: "join", token: last(screen, "token").token, name });
    return controller;
  };

  /** Rooms with no wind and the same terrains every time, so that a shot lands where it is aimed. */
  const createRooms = (options: RoomsOptions<Member>) =>
    new Rooms<Member>(
      (to, message) => to.messages.push(message),
      (who) => (who.closed = true),
      { tokenPeriod: TOKEN_PERIOD, roomTimeout: ROOM_TIMEOUT, seed: 1, maxWind: 0, ...options }
    );

  beforeEach(() => {
    vi.useFakeTimers();
    rooms = createRooms({ kit: true, shopTime: 0 });
  });

  afterEach(() => {
    rooms.shutdown();
    vi.useRealTimers();
  });

  describe("creating a room", () => {
    it("gives the screen the room, its key, its state and a token", () => {
      const screen = createRoom();

      const created = last(screen, "created");
      expect(created.room).toHaveLength(ROOM_ID_LENGTH);
      expect(created.hostKey).toHaveLength(22);
      expect(state(screen)).toEqual({
        room: created.room,
        mode: "hotseat",
        phase: "lobby",
        settings: {
          maxPlayers: DEFAULT_MAX_PLAYERS,
          rounds: 10,
          turns: "classic",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        },
        players: [],
        screen: true,
        round: 0,
        turn: null,
        wind: 0,
        shop: null,
        host: null,
        public: false,
        startsIn: null
      });
      expect(last(screen, "token")).toEqual({
        type: "token",
        token: expect.stringMatching(new RegExp(`^[a-z2-9]{${JOIN_TOKEN_LENGTH}}$`)),
        expiresIn: TOKEN_PERIOD
      });
      expect(rooms.size).toBe(1);
    });

    it("does not handle messages that are not about the rooms", () => {
      expect(rooms.handle(member("someone"), { type: "ping" })).toBe(false);
    });
  });

  describe("joining", () => {
    it("makes the controller a player and tells everyone", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const bob = joinRoom(screen, "Bob");

      expect(last(ann, "joined")).toEqual({
        type: "joined",
        room: last(screen, "created").room,
        id: 0,
        playerKey: expect.stringMatching(/^[\w-]{22}$/)
      });
      expect(last(bob, "joined").id).toBe(1);
      const players = [
        { id: 0, name: "Ann", connected: true, wins: 0, money: 0 },
        { id: 1, name: "Bob", connected: true, wins: 0, money: 0 }
      ];
      for (const who of [screen, ann, bob]) expect(state(who).players).toEqual(players);
    });

    it("does not send the keys to the others", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");

      const secrets = [last(screen, "created").hostKey, last(ann, "joined").playerKey];
      expect(JSON.stringify(ann.messages)).not.toContain(secrets[0]);
      expect(JSON.stringify(screen.messages)).not.toContain(secrets[1]);
      expect(JSON.stringify(state(ann))).not.toMatch(/key|token/i);
    });

    it("refuses a token that is not of a room", () => {
      createRoom();
      const controller = member("controller");
      rooms.handle(controller, { type: "join", token: "nosuchtoken", name: "Ann" });
      expect(controller.messages).toEqual([{ type: "error", code: "bad-token", re: "join" }]);
    });

    it("adds a number to a name that is taken", () => {
      const screen = createRoom();
      joinRoom(screen, "Sprig");
      joinRoom(screen, " sprig ");
      joinRoom(screen, "SPRIG");
      const long = "a".repeat(MAX_NAME_LENGTH);
      joinRoom(screen, long);
      joinRoom(screen, long);

      const names = state(screen).players.map((player) => player.name);
      expect(names).toEqual(["Sprig", "sprig 2", "SPRIG 3", long, `${"a".repeat(MAX_NAME_LENGTH - 2)} 2`]);
    });

    it("refuses a player when the room is full: the game has started by itself", () => {
      const screen = createRoom();
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 2,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      const cat = joinRoom(screen, "Cat");

      expect(cat.messages).toEqual([{ type: "error", code: "wrong-phase", re: "join" }]);
      expect(state(screen).players).toHaveLength(2);
    });

    it("gives the number of a player who left to the next one", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      rooms.handle(ann, { type: "leave" });
      const cat = joinRoom(screen, "Cat");

      expect(last(cat, "joined").id).toBe(0);
      expect(state(screen).players.map((player) => player.name)).toEqual(["Cat", "Bob"]);
    });
  });

  describe("the join token", () => {
    it("changes, and the previous one still works", () => {
      const screen = createRoom();
      const first = last(screen, "token").token;

      vi.advanceTimersByTime(TOKEN_PERIOD);
      const second = last(screen, "token").token;
      expect(second).not.toBe(first);

      const ann = member("Ann");
      rooms.handle(ann, { type: "join", token: first, name: "Ann" });
      expect(last(ann, "joined").id).toBe(0);

      vi.advanceTimersByTime(TOKEN_PERIOD);
      const bob = member("Bob");
      rooms.handle(bob, { type: "join", token: first, name: "Bob" });
      expect(bob.messages).toEqual([{ type: "error", code: "bad-token", re: "join" }]);
      const cat = member("Cat");
      rooms.handle(cat, { type: "join", token: second, name: "Cat" });
      expect(last(cat, "joined").id).toBe(1);
    });

    it("tells a returning screen how long the token is still the newest", () => {
      const screen = createRoom();
      vi.advanceTimersByTime(TOKEN_PERIOD + 10000);
      const { room, hostKey } = last(screen, "created");

      const again = member("screen again");
      rooms.handle(again, { type: "host", room, hostKey });
      expect(last(again, "token")).toEqual({
        type: "token",
        token: last(screen, "token").token,
        expiresIn: TOKEN_PERIOD - 10000
      });
    });
  });

  describe("the lobby", () => {
    it("starts the game when the screen says so and there are two players", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");

      rooms.handle(screen, { type: "start" });
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "start" }]);
      expect(state(screen).phase).toBe("lobby");

      joinRoom(screen, "Bob");
      rooms.handle(screen, { type: "start" });
      expect(state(screen).phase).toBe("playing");
      expect(state(ann).phase).toBe("playing");

      rooms.handle(screen, { type: "start" });
      expect(errors(screen).pop()).toEqual({ type: "error", code: "wrong-phase", re: "start" });
    });

    it("starts the game by itself when the room becomes full", () => {
      const screen = createRoom();
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 3,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      expect(state(screen).phase).toBe("lobby");
      joinRoom(screen, "Cat");
      expect(state(screen).phase).toBe("playing");
    });

    it("starts the game when the maximum is lowered to the number of players", () => {
      const screen = createRoom();
      joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 2,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      expect(state(screen).phase).toBe("playing");
    });

    it("lets the screen change the maximum number of players, but not below those in the room", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      joinRoom(screen, "Cat");

      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 5,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      expect(state(ann).settings).toEqual({
        maxPlayers: 5,
        rounds: 10,
        turns: "live",
        maxWind: 0,
        cash: 0,
        interest: 5,
        armsLevel: 4,
        traces: false,
        changingWind: false,
        suspendDirt: 0,
        walls: "none"
      });

      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 2,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "settings" }]);
      expect(state(ann).settings).toEqual({
        maxPlayers: 5,
        rounds: 10,
        turns: "live",
        maxWind: 0,
        cash: 0,
        interest: 5,
        armsLevel: 4,
        traces: false,
        changingWind: false,
        suspendDirt: 0,
        walls: "none"
      });
    });

    it("does not let the settings be changed after the game has started", () => {
      const screen = createRoom();
      joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      rooms.handle(screen, { type: "start" });
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 5,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      expect(errors(screen)).toEqual([{ type: "error", code: "wrong-phase", re: "settings" }]);
    });

    it("does not let a new player join after the game has started", () => {
      const screen = createRoom();
      joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      rooms.handle(screen, { type: "start" });
      const cat = joinRoom(screen, "Cat");
      expect(cat.messages).toEqual([{ type: "error", code: "wrong-phase", re: "join" }]);
      expect(state(screen).players).toHaveLength(2);
    });

    it("lets only the screen do what the host does", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      const outsider = member("outsider");

      for (const who of [ann, outsider]) {
        rooms.handle(who, { type: "start" });
        rooms.handle(who, { type: "kick", id: 1 });
        rooms.handle(who, {
          type: "settings",
          settings: {
            maxPlayers: 2,
            rounds: 10,
            turns: "live",
            maxWind: 0,
            cash: 0,
            interest: 5,
            armsLevel: 4,
            traces: false,
            changingWind: false,
            suspendDirt: 0,
            walls: "none"
          }
        });
        expect(errors(who)).toEqual([
          { type: "error", code: "not-allowed", re: "start" },
          { type: "error", code: "not-allowed", re: "kick" },
          { type: "error", code: "not-allowed", re: "settings" }
        ]);
      }
      expect(state(screen)).toMatchObject({
        phase: "lobby",
        settings: {
          maxPlayers: DEFAULT_MAX_PLAYERS,
          rounds: 10,
          turns: "classic",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      expect(state(screen).players).toHaveLength(2);
    });

    it("removes a player the screen kicks, and the key of the player stops working", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const { room, playerKey } = last(ann, "joined");

      rooms.handle(screen, { type: "kick", id: 0 });
      expect(state(screen).players).toEqual([]);
      expect(errors(ann)).toEqual([{ type: "error", code: "no-session" }]);

      rooms.handle(ann, { type: "resume", room, playerKey });
      expect(errors(ann).pop()).toEqual({ type: "error", code: "no-session", re: "resume" });

      rooms.handle(screen, { type: "kick", id: 0 });
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "kick" }]);
    });

    it("removes a player who leaves, and refuses a leave from others", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const before = ann.messages.length;

      rooms.handle(ann, { type: "leave" });
      expect(state(screen).players).toEqual([]);
      expect(ann.messages).toHaveLength(before);

      rooms.handle(screen, { type: "leave" });
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "leave" }]);
    });
  });

  describe("losing and regaining a connection", () => {
    it("keeps a player whose connection was lost, and lets the player return", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const { room, playerKey } = last(ann, "joined");

      rooms.disconnect(ann);
      expect(state(screen).players).toEqual([{ id: 0, name: "Ann", connected: false, wins: 0, money: 0 }]);

      const again = member("Ann again");
      rooms.handle(again, { type: "resume", room, playerKey });
      expect(last(again, "joined")).toEqual({ type: "joined", room, id: 0, playerKey });
      expect(state(screen).players).toEqual([{ id: 0, name: "Ann", connected: true, wins: 0, money: 0 }]);
    });

    it("closes the old connection when a player returns on another one", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const { room, playerKey } = last(ann, "joined");

      const again = member("Ann again");
      rooms.handle(again, { type: "resume", room, playerKey });
      expect(ann.messages.pop()).toEqual({ type: "error", code: "replaced" });
      expect(ann.closed).toBe(true);

      // The old connection going away does not take the player with it
      rooms.disconnect(ann);
      expect(state(screen).players).toEqual([{ id: 0, name: "Ann", connected: true, wins: 0, money: 0 }]);
    });

    it("returns a device that scans the QR code again to the player it already is", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      const { room, playerKey } = last(ann, "joined");
      rooms.disconnect(ann);
      rooms.handle(screen, { type: "start" });

      // Also in the middle of the game, when nobody new can join, and with a newer token
      vi.advanceTimersByTime(TOKEN_PERIOD);
      const again = member("Ann again");
      rooms.handle(again, { type: "rejoin", token: last(screen, "token").token, playerKey });
      expect(last(again, "joined")).toEqual({ type: "joined", room, id: 0, playerKey });
      expect(last(again, "aim")).toMatchObject({ type: "aim", id: 0 });
      expect(state(screen).players).toEqual([
        { id: 0, name: "Ann", connected: true, wins: 0, money: 0 },
        { id: 1, name: "Bob", connected: true, wins: 0, money: 0 }
      ]);
    });

    it("tells a device that is not a player of the room of the QR code that it is not", () => {
      const first = createRoom();
      const second = createRoom();
      const ann = joinRoom(first, "Ann");
      const { playerKey } = last(ann, "joined");

      const someone = member("someone");
      rooms.handle(someone, { type: "rejoin", token: last(second, "token").token, playerKey });
      rooms.handle(someone, { type: "rejoin", token: "nosuchtoken", playerKey });
      expect(someone.messages).toEqual([
        { type: "error", code: "no-session", re: "rejoin" },
        { type: "error", code: "bad-token", re: "rejoin" }
      ]);
      expect(state(second).players).toEqual([]);
    });

    it("refuses a return to a room that is not there or with a key that is not of it", () => {
      const screen = createRoom();
      const { room } = last(screen, "created");
      const someone = member("someone");

      rooms.handle(someone, { type: "resume", room: "nosuchroom", playerKey: "x" });
      rooms.handle(someone, { type: "resume", room, playerKey: "x" });
      rooms.handle(someone, { type: "host", room: "nosuchroom", hostKey: "x" });
      rooms.handle(someone, { type: "host", room, hostKey: "x" });
      expect(someone.messages).toEqual([
        { type: "error", code: "no-room", re: "resume" },
        { type: "error", code: "no-session", re: "resume" },
        { type: "error", code: "no-room", re: "host" },
        { type: "error", code: "no-session", re: "host" }
      ]);
    });

    it("tells the players when the screen is away, and lets the screen return", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const { room, hostKey } = last(screen, "created");

      rooms.disconnect(screen);
      expect(state(ann).screen).toBe(false);

      vi.advanceTimersByTime(ROOM_TIMEOUT - 1);
      const again = member("screen again");
      rooms.handle(again, { type: "host", room, hostKey });
      expect(state(ann).screen).toBe(true);
      expect(state(again).players).toHaveLength(1);

      vi.advanceTimersByTime(ROOM_TIMEOUT);
      expect(rooms.size).toBe(1);
    });

    it("closes the old connection when the screen returns on another one", () => {
      const screen = createRoom();
      const { room, hostKey } = last(screen, "created");

      const again = member("screen again");
      rooms.handle(again, { type: "host", room, hostKey });
      expect(screen.messages.pop()).toEqual({ type: "error", code: "replaced" });
      expect(screen.closed).toBe(true);
      expect(state(again).screen).toBe(true);
    });

    it("answers a screen that asks for its own room again", () => {
      const screen = createRoom();
      const { room, hostKey } = last(screen, "created");
      const before = screen.messages.length;

      rooms.handle(screen, { type: "host", room, hostKey });
      expect(screen.messages.slice(before).map((message) => message.type)).toEqual(["created", "room", "token"]);
      expect(screen.closed).toBe(false);
    });

    it("removes a room whose screen stays away, and tells its players", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const { room, playerKey } = last(ann, "joined");
      const token = last(screen, "token").token;

      rooms.disconnect(screen);
      vi.advanceTimersByTime(ROOM_TIMEOUT);

      expect(rooms.size).toBe(0);
      expect(ann.messages.pop()).toEqual({ type: "error", code: "no-room" });
      rooms.handle(ann, { type: "resume", room, playerKey });
      expect(ann.messages.pop()).toEqual({ type: "error", code: "no-room", re: "resume" });
      const bob = member("Bob");
      rooms.handle(bob, { type: "join", token, name: "Bob" });
      expect(bob.messages).toEqual([{ type: "error", code: "bad-token", re: "join" }]);
    });

    it("lets a connection move from one room to another", () => {
      const first = createRoom();
      const second = createRoom();
      const ann = joinRoom(first, "Ann");

      rooms.handle(ann, { type: "join", token: last(second, "token").token, name: "Ann" });
      expect(state(first).players).toEqual([{ id: 0, name: "Ann", connected: false, wins: 0, money: 0 }]);
      expect(state(second).players).toEqual([{ id: 0, name: "Ann", connected: true, wins: 0, money: 0 }]);
    });
  });

  describe("the playing field", () => {
    /** A room with a game going on between Ann and Bob. */
    const startGame = () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const bob = joinRoom(screen, "Bob");
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      rooms.handle(screen, { type: "start" });
      return { screen, ann, bob };
    };
    const types = (of: Member) => of.messages.map((message) => message.type);

    it("is not sent before the game has started", () => {
      const screen = createRoom();
      joinRoom(screen, "Ann");
      expect(types(screen)).not.toContain("field");
    });

    it("is sent to the screen when the game starts, with a tank for each player", () => {
      const { screen, ann } = startGame();

      const { field } = last(screen, "field");
      expect(field.terrain).toHaveLength(field.width);
      expect(field.tanks.map((tank) => tank.id)).toEqual([0, 1]);
      // A controller does not show the field
      expect(types(ann)).not.toContain("field");
    });

    it("is also made when the game starts by itself", () => {
      const screen = createRoom();
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 2,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      expect(last(screen, "field").field.tanks).toHaveLength(2);
    });

    it("tells each player the aim of its own tank, and not that of the others", () => {
      const { screen, ann, bob } = startGame();
      const [first, second] = last(screen, "field").field.tanks;

      const aims = (of: Member) => of.messages.filter((message) => message.type === "aim");
      expect(aims(ann)).toEqual([{ type: "aim", id: 0, angle: first.angle, power: first.power }]);
      expect(aims(bob)).toEqual([{ type: "aim", id: 1, angle: second.angle, power: second.power }]);
    });

    it("turns the turret of the tank of a player and tells the screen, not the player", () => {
      const { screen, ann, bob } = startGame();
      const before = ann.messages.length;

      rooms.handle(ann, { type: "aim", angle: 33 });
      expect(last(screen, "aim")).toEqual({ type: "aim", id: 0, angle: 33, power: 500 });
      rooms.handle(ann, { type: "aim", power: 720 });
      expect(last(screen, "aim")).toEqual({ type: "aim", id: 0, angle: 33, power: 720 });
      rooms.handle(bob, { type: "aim", angle: 100, power: 10 });
      expect(last(screen, "aim")).toEqual({ type: "aim", id: 1, angle: 100, power: 10 });

      expect(ann.messages).toHaveLength(before);
    });

    it("refuses an aim before the game, and from those who are not players", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      rooms.handle(ann, { type: "aim", angle: 33 });
      expect(errors(ann)).toEqual([{ type: "error", code: "wrong-phase", re: "aim" }]);

      rooms.handle(screen, { type: "aim", angle: 33 });
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "aim" }]);
      const outsider = member("outsider");
      rooms.handle(outsider, { type: "aim", angle: 33 });
      expect(errors(outsider)).toEqual([{ type: "error", code: "not-allowed", re: "aim" }]);
    });

    it("gives a screen that returns the field as it is now", () => {
      const { screen, ann } = startGame();
      rooms.handle(ann, { type: "aim", angle: 33, power: 720 });
      const { room, hostKey } = last(screen, "created");
      rooms.disconnect(screen);

      // What happens while the screen is away is not lost
      rooms.handle(ann, { type: "aim", angle: 34 });
      const again = member("screen again");
      rooms.handle(again, { type: "host", room, hostKey });

      expect(types(again)).toEqual(["created", "room", "token", "field"]);
      expect(last(again, "field").field.tanks[0]).toMatchObject({ id: 0, angle: 34, power: 720 });
      expect(last(again, "field").field.terrain).toEqual(last(screen, "field").field.terrain);
    });

    it("gives a controller that returns the aim of its tank", () => {
      const { ann } = startGame();
      rooms.handle(ann, { type: "aim", angle: 33, power: 720 });
      const { room, playerKey } = last(ann, "joined");
      rooms.disconnect(ann);

      const again = member("Ann again");
      rooms.handle(again, { type: "resume", room, playerKey });
      expect(types(again)).toEqual(["joined", "room", "aim", "reload", "energy", "weapons"]);
      expect(last(again, "aim")).toEqual({ type: "aim", id: 0, angle: 33, power: 720 });
    });

    it("takes away the tank of a player who leaves or is removed", () => {
      const { screen, ann } = startGame();
      rooms.handle(ann, { type: "leave" });
      expect(last(screen, "field").field.tanks.map((tank) => tank.id)).toEqual([1]);

      rooms.handle(screen, { type: "kick", id: 1 });
      expect(last(screen, "field").field.tanks).toEqual([]);
    });

    it("keeps the tank of a player whose connection is lost", () => {
      const { screen, ann } = startGame();
      const fields = screen.messages.filter((message) => message.type === "field").length;
      rooms.disconnect(ann);
      expect(screen.messages.filter((message) => message.type === "field")).toHaveLength(fields);
      expect(last(screen, "field").field.tanks).toHaveLength(2);
    });
  });

  describe("firing", () => {
    const startGame = () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const bob = joinRoom(screen, "Bob");
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      rooms.handle(screen, { type: "start" });
      return { screen, ann, bob };
    };
    const of = <Type extends ServerMessage["type"]>(member: Member, type: Type) =>
      member.messages.filter((message) => message.type === type) as Extract<ServerMessage, { type: Type }>[];
    /** Aims straight up at low power, so that the shot comes down on the tank that fires it and takes some of its energy. */
    const aimBeside = (who: Member) => {
      rooms.handle(who, { type: "aim", angle: 90, power: 100 });
    };

    it("sends a projectile into the air, which the screen is told about until it is gone", () => {
      const { screen, ann, bob } = startGame();
      const tank = last(screen, "field").field.tanks[0];
      rooms.handle(ann, { type: "fire" });

      vi.advanceTimersByTime(50);
      const [first] = of(screen, "shots");
      expect(first.shots).toEqual([
        { id: 1, owner: 0, weapon: "baby-missile", x: expect.any(Number), y: expect.any(Number) }
      ]);
      // It has left upwards from the tank
      expect(first.shots[0].y).toBeLessThan(tank.y);

      vi.advanceTimersByTime(60000);
      const snapshots = of(screen, "shots");
      expect(snapshots.length).toBeGreaterThan(10);
      expect(snapshots[snapshots.length - 1].shots).toEqual([]);
      // Only the last one is empty, and nothing is sent after it
      expect(snapshots.filter((snapshot) => snapshot.shots.length === 0)).toHaveLength(1);
      vi.advanceTimersByTime(60000);
      expect(of(screen, "shots")).toHaveLength(snapshots.length);

      // The controllers do not show the field
      for (const controller of [ann, bob]) {
        expect(of(controller, "shots")).toEqual([]);
        expect(of(controller, "explode")).toEqual([]);
        expect(of(controller, "terrain")).toEqual([]);
      }
    });

    it("tells the screen about the explosion and the change of the terrain", () => {
      const { screen, ann } = startGame();
      aimBeside(ann);
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(60000);

      const [explosion] = of(screen, "explode");
      const [terrain] = of(screen, "terrain");
      const tank = terrain.tanks[0];
      expect(Math.abs(explosion.x - tank.x)).toBeLessThan(50);
      expect(terrain.changes).toEqual([
        { op: "carve", x: explosion.x, y: explosion.y, r: explosion.radius },
        { op: "settle" }
      ]);
      // The tanks come with the change: the one beside the explosion has lost energy, the other has not
      expect(terrain.tanks.map((moved) => moved.id)).toEqual([0, 1]);
      expect(terrain.tanks[0].energy).toBeLessThan(100);
      expect(terrain.tanks[1].energy).toBe(100);
    });

    it("gives a screen that returns the terrain as it is after the explosions", () => {
      const { screen, ann } = startGame();
      aimBeside(ann);
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(60000);
      const [explosion] = of(screen, "explode");
      const { room, hostKey } = last(screen, "created");

      const again = member("screen again");
      rooms.handle(again, { type: "host", room, hostKey });
      const { field } = last(again, "field");
      // There is a crater where the explosion was
      expect(field.terrain[explosion.x][0]).toBeGreaterThan(explosion.y);
      expect(field.tanks[0].y).toBe(of(screen, "terrain")[0].tanks[0].y);
    });

    it("gives everyone a bundle of each weapon at the start of a game, and the Baby Missile to fire", () => {
      const { ann } = startGame();
      const weapons = last(ann, "weapons");
      expect(weapons.selected).toBe("baby-missile");
      expect(weapons.counts).toMatchObject({ missile: 5, nuke: 1, tracer: 20 });
      expect(weapons.counts["baby-missile"]).toBeUndefined();
    });

    it("lets a player choose a weapon it has, and fires it", () => {
      const { screen, ann } = startGame();
      rooms.handle(ann, { type: "weapon", weapon: "missile" });
      expect(last(ann, "weapons").selected).toBe("missile");

      aimBeside(ann);
      rooms.handle(ann, { type: "fire" });
      // One less, and the same weapon is still chosen
      expect(last(ann, "weapons")).toMatchObject({ selected: "missile", counts: { missile: 4 } });
      vi.advanceTimersByTime(50);
      expect(of(screen, "shots")[0].shots[0].weapon).toBe("missile");
      vi.advanceTimersByTime(5000);
      expect(last(screen, "explode")).toMatchObject({ radius: 40, weapon: "missile" });
    });

    it("goes back to the Baby Missile when the last one of a weapon is fired", () => {
      const { ann } = startGame();
      rooms.handle(ann, { type: "weapon", weapon: "nuke" });
      rooms.handle(ann, { type: "aim", power: 0 });
      // Nothing was fired yet: the nuke is still there
      expect(last(ann, "weapons").counts.nuke).toBe(1);
      rooms.handle(ann, { type: "aim", angle: 90, power: 1000 });
      rooms.handle(ann, { type: "fire" });
      const weapons = last(ann, "weapons");
      expect(weapons.selected).toBe("baby-missile");
      expect(weapons.counts.nuke).toBeUndefined();

      rooms.handle(ann, { type: "weapon", weapon: "nuke" });
      expect(errors(ann)).toEqual([{ type: "error", code: "no-weapon", re: "weapon" }]);
      expect(last(ann, "weapons").selected).toBe("baby-missile");
    });

    it("refuses a weapon that does not exist or that the player has none of, and one chosen outside a game", () => {
      const { screen, ann } = startGame();
      rooms.handle(ann, { type: "weapon", weapon: "death-ray" });
      rooms.handle(ann, { type: "weapon", weapon: "tracer" });
      for (let shot = 0; shot < 20; shot++) {
        rooms.handle(ann, { type: "fire" });
        vi.advanceTimersByTime(1000);
      }
      rooms.handle(ann, { type: "weapon", weapon: "tracer" });
      rooms.handle(screen, { type: "weapon", weapon: "missile" });
      expect(errors(ann)).toEqual([
        { type: "error", code: "no-weapon", re: "weapon" },
        { type: "error", code: "no-weapon", re: "weapon" }
      ]);
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "weapon" }]);

      const lobby = createRoom();
      const cid = joinRoom(lobby, "Cid");
      rooms.handle(cid, { type: "weapon", weapon: "missile" });
      expect(errors(cid)).toEqual([{ type: "error", code: "wrong-phase", re: "weapon" }]);
    });

    it("reloads longer after a bigger weapon", () => {
      const { ann } = startGame();
      // Dirt, which does not harm the tank it falls on
      rooms.handle(ann, { type: "weapon", weapon: "ton-of-dirt" });
      rooms.handle(ann, { type: "fire" });
      expect(last(ann, "reload")).toEqual({ type: "reload", time: 12000 });
      vi.advanceTimersByTime(11000);
      rooms.handle(ann, { type: "fire" });
      expect(errors(ann)).toEqual([{ type: "error", code: "reloading", re: "fire" }]);
    });

    it("tells a controller that returns its weapons, and keeps them over the rounds", () => {
      const { screen, ann } = startGame();
      rooms.handle(ann, { type: "weapon", weapon: "tracer" });
      rooms.handle(ann, { type: "fire" });
      rooms.disconnect(ann);
      const again = member("Ann again");
      rooms.handle(again, { type: "resume", room: state(screen).room, playerKey: last(ann, "joined").playerKey });
      expect(last(again, "weapons")).toMatchObject({ selected: "tracer", counts: { tracer: 19, missile: 5 } });
    });

    it("shows a digger eating its way into the dirt, and the bombs of a Funky Bomb as parts of it", () => {
      const { screen, ann } = startGame();
      rooms.handle(ann, { type: "weapon", weapon: "heavy-digger" });
      rooms.handle(ann, { type: "aim", angle: 80, power: 300 });
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(10000);
      // Many tellings of the dirt, each with a little more of the tunnels, and the heads among the shots
      const digs = all(screen, "terrain").filter((message) => message.changes.some((change) => change.op === "carve"));
      expect(digs.length).toBeGreaterThan(10);
      expect(all(screen, "shots").some((message) => message.shots.length === 5)).toBe(true);
      expect(last(screen, "shots").shots).toEqual([]);

      rooms.handle(ann, { type: "weapon", weapon: "funky-bomb" });
      rooms.handle(ann, { type: "aim", angle: 85, power: 300 });
      rooms.handle(ann, { type: "fire" });
      expect(errors(ann)).toEqual([]);
      vi.advanceTimersByTime(15000);
      const parts = all(screen, "shots").flatMap((message) => message.shots.flatMap((shot) => shot.part ?? []));
      expect(new Set(parts).size).toBe(6);
      const blasts = all(screen, "explode").filter((message) => message.weapon === "funky-bomb");
      expect(
        blasts
          .map((blast) => blast.part)
          .filter((part) => part !== undefined)
          .sort()
      ).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("tells where napalm burns and how deep, and pours liquid dirt a little at a time", () => {
      const { screen, ann } = startGame();
      rooms.handle(ann, { type: "weapon", weapon: "napalm" });
      rooms.handle(ann, { type: "aim", angle: 85, power: 300 });
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(15000);
      expect(all(screen, "burn").length).toBeGreaterThan(5);
      // The tanks are told again when it has burned, though the dirt did not change: their energy is shown from that
      const after = last(screen, "terrain");
      expect(after.changes).toEqual([]);
      expect(after.tanks).toHaveLength(2);
      const burn = last(screen, "burn");
      expect(burn.weapon).toBe("napalm");
      expect(burn.depths.reduce((sum, depth) => sum + depth, 0)).toBeGreaterThan(0);
      expect(burn.depths[0]).toBeGreaterThan(0);
      expect(burn.depths[burn.depths.length - 1]).toBeGreaterThan(0);

      rooms.handle(ann, { type: "weapon", weapon: "liquid-dirt" });
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(15000);
      const pours = all(screen, "terrain").filter((message) => message.changes.some((change) => change.op === "pour"));
      expect(pours.length).toBeGreaterThan(10);
      expect(last(screen, "shots").shots).toEqual([]);
    });

    it("leaves dirt hanging in the air when the room is set to, until an Earth Disrupter brings it down", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      const settings = { ...state(screen).settings, turns: "live" as const, maxWind: 0 };
      rooms.handle(screen, { type: "settings", settings: { ...settings, suspendDirt: 100 } });
      rooms.handle(screen, { type: "start" });

      rooms.handle(ann, { type: "weapon", weapon: "riot-charge" });
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(4000);
      const dug = last(screen, "terrain").changes;
      expect(dug.length).toBeGreaterThan(1);
      expect(dug.every((change) => change.op === "carve")).toBe(true);

      rooms.handle(ann, { type: "weapon", weapon: "earth-disrupter" });
      rooms.handle(ann, { type: "aim", angle: 90, power: 100 });
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(8000);
      expect(last(screen, "explode").weapon).toBe("earth-disrupter");
      expect(last(screen, "terrain").changes).toEqual([{ op: "settle" }]);
    });

    it("changes the wind a little after every shot when the room is set to, and tells it to everyone", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      const settings = { ...state(screen).settings, turns: "live" as const, maxWind: 200 };
      rooms.handle(screen, { type: "settings", settings: { ...settings, changingWind: true } });
      rooms.handle(screen, { type: "start" });

      const winds = [state(ann).wind];
      for (let shot = 0; shot < 12; shot++) {
        // Tracers, which harm nobody
        rooms.handle(ann, { type: "weapon", weapon: "tracer" });
        rooms.handle(ann, { type: "aim", angle: 90, power: 200 });
        rooms.handle(ann, { type: "fire" });
        vi.advanceTimersByTime(8000);
        winds.push(state(ann).wind);
      }
      const changes = winds.slice(1).map((wind, index) => wind - winds[index]);
      expect(changes.some((change) => change !== 0)).toBe(true);
      for (const change of changes) expect(Math.abs(change)).toBeLessThanOrEqual(5);
      for (const wind of winds) expect(Math.abs(wind)).toBeLessThanOrEqual(200);
    });

    it("keeps the wind of a round as it is unless the room is set to change it", () => {
      const { screen, ann } = startGame();
      rooms.handle(screen, { type: "lobby" });
      const before = state(ann).wind;
      rooms.handle(ann, { type: "weapon", weapon: "tracer" });
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(8000);
      expect(state(ann).wind).toBe(before);
    });

    it("gives the field the walls the room is set to", () => {
      const screen = createRoom();
      joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      rooms.handle(screen, { type: "settings", settings: { ...state(screen).settings, walls: "rubber" } });
      rooms.handle(screen, { type: "start" });
      expect(last(screen, "field").field.walls).toBe("rubber");
    });

    it("draws a wind for each round, within what the room allows, and tells it to everyone", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      expect(state(screen).wind).toBe(0);
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 10,
          turns: "live",
          maxWind: 500,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      rooms.handle(screen, { type: "start" });

      const { wind } = state(ann);
      expect(Number.isInteger(wind)).toBe(true);
      expect(wind).not.toBe(0);
      expect(Math.abs(wind)).toBeLessThanOrEqual(500);
      expect(state(screen).wind).toBe(wind);
      expect(last(screen, "field").field.wind).toBe(wind);
    });

    it("has a wind of at most 200 in a new room, as the original, unless told otherwise", () => {
      const sent: ServerMessage[] = [];
      const other = new Rooms<string>(
        (_, message) => sent.push(message),
        () => {}
      );
      other.handle("screen", { type: "create", mode: "hotseat" });
      const room = sent.find((message) => message.type === "room") as Extract<ServerMessage, { type: "room" }>;
      expect(room.state.settings.maxWind).toBe(200);
      other.handle("screen", {
        type: "settings",
        settings: {
          ...room.state.settings,
          maxWind: 501,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      } as never);
    });

    it("reloads for three seconds after a shot", () => {
      const { ann } = startGame();
      rooms.handle(ann, { type: "fire" });
      expect(last(ann, "reload")).toEqual({ type: "reload", time: 3000 });

      vi.advanceTimersByTime(2999);
      rooms.handle(ann, { type: "fire" });
      expect(errors(ann)).toEqual([{ type: "error", code: "reloading", re: "fire" }]);

      vi.advanceTimersByTime(1);
      rooms.handle(ann, { type: "fire" });
      expect(errors(ann)).toHaveLength(1);
      expect(of(ann, "reload")).toHaveLength(3);
    });

    it("lets every player have a projectile in the air at the same time", () => {
      const { screen, ann, bob } = startGame();
      rooms.handle(ann, { type: "fire" });
      rooms.handle(bob, { type: "fire" });
      vi.advanceTimersByTime(50);
      expect(last(screen, "shots").shots.map((shot) => [shot.id, shot.owner])).toEqual([
        [1, 0],
        [2, 1]
      ]);
    });

    it("tells a controller that returns how long its tank still reloads", () => {
      const { ann } = startGame();
      rooms.handle(ann, { type: "fire" });
      const { room, playerKey } = last(ann, "joined");
      rooms.disconnect(ann);
      vi.advanceTimersByTime(1000);

      const again = member("Ann again");
      rooms.handle(again, { type: "resume", room, playerKey });
      expect(last(again, "reload")).toEqual({ type: "reload", time: 2000 });

      vi.advanceTimersByTime(5000);
      const later = member("Ann later");
      rooms.handle(later, { type: "resume", room, playerKey });
      expect(last(later, "reload")).toEqual({ type: "reload", time: 0 });
    });

    it("keeps the projectiles flying while the screen is away", () => {
      const { screen, ann } = startGame();
      aimBeside(ann);
      rooms.handle(ann, { type: "fire" });
      const { room, hostKey } = last(screen, "created");
      const before = JSON.stringify(last(screen, "field").field.terrain);
      rooms.disconnect(screen);
      vi.advanceTimersByTime(60000);

      const again = member("screen again");
      rooms.handle(again, { type: "host", room, hostKey });
      // The shot has landed meanwhile: there is a crater, and the tank beside it has lost energy
      expect(JSON.stringify(last(again, "field").field.terrain)).not.toBe(before);
      expect(last(again, "field").field.tanks[0].energy).toBeLessThan(100);
      expect(of(again, "shots")).toEqual([]);
    });

    it("is refused before the game, and from those who are not players", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      rooms.handle(ann, { type: "fire" });
      rooms.handle(screen, { type: "fire" });
      expect(errors(ann)).toEqual([{ type: "error", code: "wrong-phase", re: "fire" }]);
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "fire" }]);
    });
  });

  describe("damage and the rounds", () => {
    const startGame = () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const bob = joinRoom(screen, "Bob");
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      rooms.handle(screen, { type: "start" });
      return { screen, ann, bob };
    };
    const of = <Type extends ServerMessage["type"]>(member: Member, type: Type) =>
      member.messages.filter((message) => message.type === type) as Extract<ServerMessage, { type: Type }>[];
    /** Ann fires a Baby Missile straight up at low power: it comes down on her own tank and takes some of its energy. */
    const hitSelf = (ann: Member) => {
      rooms.handle(ann, { type: "aim", angle: 90, power: 100 });
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(3100);
    };
    /** Ann fires a Baby Nuke straight up at low power, so that it comes down on her own tank and destroys it. */
    const destroySelf = (ann: Member) => {
      rooms.handle(ann, { type: "weapon", weapon: "baby-nuke" });
      rooms.handle(ann, { type: "aim", angle: 90, power: 100 });
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(2000);
    };

    it("tells the players the energy of their tanks at the start", () => {
      const { screen, ann, bob } = startGame();
      expect(of(ann, "energy")).toEqual([{ type: "energy", energy: 100, shield: 0 }]);
      expect(of(bob, "energy")).toEqual([{ type: "energy", energy: 100, shield: 0 }]);
      expect(last(screen, "field").field.tanks.map((tank) => tank.energy)).toEqual([100, 100]);
      expect(state(screen).round).toBe(1);
    });

    it("takes energy from a tank that is hit, and tells the player and the screen", () => {
      const { screen, ann, bob } = startGame();
      hitSelf(ann);

      const { energy } = last(ann, "energy");
      expect(energy).toBeLessThan(100);
      expect(energy).toBeGreaterThan(0);
      expect(last(screen, "terrain").tanks[0].energy).toBe(energy);
      expect(last(screen, "terrain").tanks[1].energy).toBe(100);
      expect(of(bob, "energy")).toHaveLength(1);
    });

    it("does not let a tank fire harder than its energy allows", () => {
      const { screen, ann } = startGame();
      hitSelf(ann);
      const { energy } = last(ann, "energy");

      rooms.handle(ann, { type: "aim", power: 1000 });
      expect(last(screen, "aim")).toMatchObject({ id: 0, power: energy * 10 });
    });

    it("ends the round when one tank is left, and starts the next one after a while", () => {
      const { screen, ann, bob } = startGame();
      destroySelf(ann);
      expect(last(ann, "energy").energy).toBe(0);

      const over = { type: "roundOver", round: 1, winner: 1 };
      for (const who of [screen, ann, bob]) expect(of(who, "roundOver")).toEqual([over]);

      // A destroyed tank does nothing, and nobody fires while the result is shown
      rooms.handle(ann, { type: "fire" });
      rooms.handle(ann, { type: "aim", angle: 10 });
      rooms.handle(bob, { type: "fire" });
      expect(errors(ann).slice(-2)).toEqual([
        { type: "error", code: "destroyed", re: "fire" },
        { type: "error", code: "destroyed", re: "aim" }
      ]);
      expect(errors(bob)).toEqual([{ type: "error", code: "wrong-phase", re: "fire" }]);

      // The result is shown for five seconds from the end of the round
      const fields = of(screen, "field").length;
      expect(state(screen).round).toBe(1);
      vi.advanceTimersByTime(5000);

      // A new round: a new terrain, and everyone is whole again
      expect(of(screen, "field")).toHaveLength(fields + 1);
      expect(state(screen).round).toBe(2);
      expect(last(screen, "field").field.tanks.map((tank) => tank.energy)).toEqual([100, 100]);
      expect(last(ann, "energy")).toEqual({ type: "energy", energy: 100, shield: 0 });
      expect(last(ann, "reload")).toEqual({ type: "reload", time: 0 });
      rooms.handle(ann, { type: "fire" });
      expect(errors(ann)).toHaveLength(2);
      expect(of(ann, "roundOver")).toHaveLength(1);
    });

    it("counts the rounds each player has won", () => {
      const { screen, ann } = startGame();
      destroySelf(ann);
      expect(state(screen).players.map((player) => [player.name, player.wins])).toEqual([
        ["Ann", 0],
        ["Bob", 1]
      ]);
    });

    it("finishes the game after its last round, and goes back to the lobby when the screen says so", () => {
      const screen = createRoom();
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 2,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      const ann = joinRoom(screen, "Ann");
      const bob = joinRoom(screen, "Bob");
      rooms.handle(screen, { type: "lobby" });
      expect(errors(screen)).toEqual([{ type: "error", code: "wrong-phase", re: "lobby" }]);
      rooms.handle(screen, { type: "start" });

      destroySelf(ann);
      vi.advanceTimersByTime(5000);
      expect(state(screen)).toMatchObject({ phase: "playing", round: 2 });
      destroySelf(bob);
      vi.advanceTimersByTime(5000);

      // No third round: the final results are shown, and nothing can be done on the field
      expect(state(ann)).toMatchObject({ phase: "finished", round: 2 });
      expect(state(ann).players.map((player) => player.wins)).toEqual([1, 1]);
      rooms.handle(ann, { type: "fire" });
      rooms.handle(ann, { type: "aim", angle: 10 });
      expect(errors(ann).slice(-2)).toEqual([
        { type: "error", code: "wrong-phase", re: "fire" },
        { type: "error", code: "wrong-phase", re: "aim" }
      ]);
      vi.advanceTimersByTime(60000);
      expect(state(ann).phase).toBe("finished");

      rooms.handle(ann, { type: "lobby" });
      expect(errors(ann).pop()).toEqual({ type: "error", code: "not-allowed", re: "lobby" });
      rooms.handle(screen, { type: "lobby" });
      expect(state(ann)).toMatchObject({ phase: "lobby", round: 0 });
      expect(state(ann).players.map((player) => player.wins)).toEqual([0, 0]);

      // New players can join again, and a new game starts from the first round
      const cat = joinRoom(screen, "Cat");
      expect(last(cat, "joined").id).toBe(2);
      rooms.handle(screen, { type: "start" });
      expect(state(screen)).toMatchObject({ phase: "playing", round: 1 });
      expect(last(screen, "field").field.tanks).toHaveLength(3);
    });

    it("gives a controller that returns the energy of its tank", () => {
      const { ann } = startGame();
      hitSelf(ann);
      const { energy } = last(ann, "energy");
      const { room, playerKey } = last(ann, "joined");

      const again = member("Ann again");
      rooms.handle(again, { type: "resume", room, playerKey });
      expect(last(again, "energy")).toEqual({ type: "energy", energy, shield: 0 });
    });
  });

  describe("the turns of the classic mode", () => {
    /** A game of three in the classic mode, and its players in the order of their turns. */
    const startClassic = () => {
      const screen = createRoom();
      const players = ["Ann", "Bob", "Cat"].map((name) => joinRoom(screen, name));
      rooms.handle(screen, { type: "start" });
      const byId = (id: number) => players[id];
      return { screen, players, byId };
    };
    const whose = (screen: Member) => state(screen).turn?.player ?? null;
    /** Aims so that the shot lands far from every tank: steeply up at little power lands beside the tank itself. */
    const fireAway = (who: Member) => {
      rooms.handle(who, { type: "aim", angle: 90, power: 0 });
      rooms.handle(who, { type: "aim", angle: 45, power: 40 });
      rooms.handle(who, { type: "fire" });
    };

    it("is the mode of a new room, and gives the first turn to one of the players", () => {
      const { screen, players } = startClassic();
      expect(state(screen).settings.turns).toBe("classic");
      expect(state(screen).turn).toEqual({ player: expect.any(Number), time: 45000 });
      for (const player of players) expect(state(player).turn).toEqual(state(screen).turn);
    });

    it("lets only the player whose turn it is fire, once", () => {
      const { screen, players, byId } = startClassic();
      const first = whose(screen)!;
      for (const [id, player] of players.entries()) {
        if (id === first) continue;
        rooms.handle(player, { type: "fire" });
        expect(errors(player)).toEqual([{ type: "error", code: "not-your-turn", re: "fire" }]);
      }

      rooms.handle(byId(first), { type: "fire" });
      rooms.handle(byId(first), { type: "fire" });
      expect(errors(byId(first))).toEqual([{ type: "error", code: "not-your-turn", re: "fire" }]);
      // There is no reloading in the classic mode
      expect(byId(first).messages.filter((message) => message.type === "reload")).toHaveLength(1);
      // The clock of the turn stops when the shot is fired
      expect(state(screen).turn).toEqual({ player: first, time: 0 });
    });

    it("lets everyone turn their turret at any time", () => {
      const { screen, players } = startClassic();
      for (const player of players) rooms.handle(player, { type: "aim", angle: 33 });
      expect(last(screen, "field").field.tanks.map((tank) => tank.angle)).toEqual([33, 33, 33]);
    });

    it("passes the turn when the shot is over, to each player in an order that stays for the round", () => {
      const { screen, byId } = startClassic();
      const order: number[] = [];
      for (let turn = 0; turn < 6; turn++) {
        const player = whose(screen)!;
        order.push(player);
        fireAway(byId(player));
        // Not before the shot has landed
        expect(whose(screen)).toBe(player);
        vi.advanceTimersByTime(5000);
      }
      expect([...order.slice(0, 3)].sort()).toEqual([0, 1, 2]);
      expect(order.slice(3)).toEqual(order.slice(0, 3));
    });

    it("passes the turn after a riot charge too, which is not a projectile: the dirt changes at once", () => {
      const { screen, byId } = startClassic();
      const player = whose(screen)!;
      rooms.handle(byId(player), { type: "weapon", weapon: "riot-charge" });
      rooms.handle(byId(player), { type: "fire" });
      expect(last(byId(player), "weapons").counts["riot-charge"]).toBe(9);
      vi.advanceTimersByTime(500);
      expect(last(screen, "explode").weapon).toBe("riot-charge");
      expect(last(screen, "shots").shots).toEqual([]);
      expect(whose(screen)).not.toBe(player);
    });

    it("skips the turn of a player who does not fire in time", () => {
      const { screen } = startClassic();
      const first = whose(screen)!;
      vi.advanceTimersByTime(44999);
      expect(state(screen).turn).toEqual({ player: first, time: 45000 });
      vi.advanceTimersByTime(1);
      expect(whose(screen)).not.toBe(first);
      expect(state(screen).turn!.time).toBe(45000);
    });

    it("skips the players whose tanks have been destroyed", () => {
      const { screen, byId } = startClassic();
      const first = whose(screen)!;
      // The first one destroys itself: a shot straight up comes down on the tank
      rooms.handle(byId(first), { type: "weapon", weapon: "baby-nuke" });
      rooms.handle(byId(first), { type: "aim", angle: 90, power: 100 });
      rooms.handle(byId(first), { type: "fire" });
      vi.advanceTimersByTime(3000);

      const second = whose(screen)!;
      expect(second).not.toBe(first);
      fireAway(byId(second));
      vi.advanceTimersByTime(5000);
      const third = whose(screen)!;
      expect([first, second]).not.toContain(third);
      fireAway(byId(third));
      vi.advanceTimersByTime(5000);
      expect(whose(screen)).toBe(second);
    });

    it("passes the turn when the player whose turn it is leaves or is removed", () => {
      const { screen, byId } = startClassic();
      const first = whose(screen)!;
      rooms.handle(byId(first), { type: "leave" });
      const second = whose(screen)!;
      expect(second).not.toBe(first);
      rooms.handle(screen, { type: "kick", id: second });
      expect([first, second]).not.toContain(whose(screen));
    });

    it("takes the turn away when the round ends, and gives a first turn in the next round", () => {
      const screen = createRoom();
      const players = [joinRoom(screen, "Ann"), joinRoom(screen, "Bob")];
      rooms.handle(screen, { type: "start" });
      const first = whose(screen)!;
      rooms.handle(players[first], { type: "weapon", weapon: "baby-nuke" });
      rooms.handle(players[first], { type: "aim", angle: 90, power: 100 });
      rooms.handle(players[first], { type: "fire" });
      vi.advanceTimersByTime(3000);

      expect(last(screen, "roundOver")).toEqual({ type: "roundOver", round: 1, winner: 1 - first });
      expect(state(screen).turn).toBeNull();
      vi.advanceTimersByTime(5000);
      expect(state(screen)).toMatchObject({ round: 2, turn: { time: 45000 } });
    });

    it("tells a player who returns whose turn it is and how much time is left", () => {
      const { screen, players } = startClassic();
      const { room, playerKey } = last(players[0], "joined");
      rooms.disconnect(players[0]);
      vi.advanceTimersByTime(10000);

      const again = member("Ann again");
      rooms.handle(again, { type: "resume", room, playerKey });
      expect(state(again).turn).toEqual({ player: whose(screen), time: 35000 });
    });

    it("has no turns in the live mode", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const bob = joinRoom(screen, "Bob");
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      rooms.handle(screen, { type: "start" });
      expect(state(screen).turn).toBeNull();
      rooms.handle(ann, { type: "fire" });
      rooms.handle(bob, { type: "fire" });
      expect(errors(ann).concat(errors(bob))).toEqual([]);
    });
  });

  describe("the speech bubbles", () => {
    const startGame = () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const bob = joinRoom(screen, "Bob");
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 10,
          turns: "live",
          maxWind: 0,
          cash: 0,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none"
        }
      });
      rooms.handle(screen, { type: "start" });
      return { screen, ann, bob };
    };
    const said = (of: Member) => of.messages.filter((message) => message.type === "say");

    it("are shown on the screen and to the one who said it, not to the other players", () => {
      const { screen, ann, bob } = startGame();
      rooms.handle(ann, { type: "say", text: "Eat this!" });

      const bubble = { type: "say", id: 0, text: "Eat this!" };
      expect(said(screen)).toEqual([bubble]);
      expect(said(ann)).toEqual([bubble]);
      expect(said(bob)).toEqual([]);
    });

    it("have their spaces tidied", () => {
      const { screen, ann } = startGame();
      rooms.handle(ann, { type: "say", text: "  so   much   room  " });
      expect(said(screen)).toEqual([{ type: "say", id: 0, text: "so much room" }]);
    });

    it("can be said only every two seconds by a player", () => {
      const { screen, ann, bob } = startGame();
      rooms.handle(ann, { type: "say", text: "One" });
      vi.advanceTimersByTime(1999);
      rooms.handle(ann, { type: "say", text: "Two" });
      expect(errors(ann)).toEqual([{ type: "error", code: "rate-limited", re: "say" }]);

      // The others are not held back by it
      rooms.handle(bob, { type: "say", text: "Me too" });
      vi.advanceTimersByTime(1);
      rooms.handle(ann, { type: "say", text: "Three" });
      expect(said(screen).map((message) => message.type === "say" && message.text)).toEqual(["One", "Me too", "Three"]);
    });

    it("are refused before the game, and from those who are not players", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      rooms.handle(ann, { type: "say", text: "Hello" });
      rooms.handle(screen, { type: "say", text: "Hello" });
      rooms.handle(member("outsider"), { type: "say", text: "Hello" });

      expect(errors(ann)).toEqual([{ type: "error", code: "wrong-phase", re: "say" }]);
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "say" }]);
      expect(said(screen)).toEqual([]);
    });
  });

  describe("money and the shop", () => {
    const of = <Type extends ServerMessage["type"]>(member: Member, type: Type) =>
      member.messages.filter((message) => message.type === type) as Extract<ServerMessage, { type: Type }>[];
    const money = (of: Member, id: number) => state(of).players.find((player) => player.id === id)!.money;

    /** A game of three with the real shop, and the given money at the start. */
    const startGame = (cash: number, more: Partial<RoomState["settings"]> = {}) => {
      rooms.shutdown();
      rooms = createRooms({});
      const screen = createRoom();
      const players = [joinRoom(screen, "Ann"), joinRoom(screen, "Bob"), joinRoom(screen, "Cid")];
      rooms.handle(screen, {
        type: "settings",
        settings: {
          maxPlayers: 8,
          rounds: 3,
          turns: "live",
          maxWind: 0,
          cash,
          interest: 5,
          armsLevel: 4,
          traces: false,
          changingWind: false,
          suspendDirt: 0,
          walls: "none",
          ...more
        }
      });
      rooms.handle(screen, { type: "start" });
      return { screen, players };
    };
    /** A player fires Baby Missiles straight up at low power until they have come down on its own tank often enough to destroy it. */
    const destroySelf = (who: Member) => {
      for (let shot = 0; shot < 20 && last(who, "energy").energy > 0; shot++) {
        rooms.handle(who, { type: "aim", angle: 90, power: 100 });
        rooms.handle(who, { type: "fire" });
        vi.advanceTimersByTime(3100);
      }
    };

    it("starts the first round at once when nobody has money, with only the Baby Missile", () => {
      const { screen, players } = startGame(0);
      expect(state(screen)).toMatchObject({ phase: "playing", round: 1, shop: null });
      expect(last(players[0], "weapons")).toEqual({ type: "weapons", selected: "baby-missile", counts: {} });
      expect(state(screen).players.map((player) => player.money)).toEqual([0, 0, 0]);
    });

    it("opens the shop before the first round when the players start with money", () => {
      const { screen, players } = startGame(10000);
      expect(state(screen)).toMatchObject({ phase: "shop", round: 0, shop: { time: 60000, ready: [] } });
      expect(of(screen, "field")).toEqual([]);
      expect(money(screen, 0)).toBe(10000);

      // Nothing of a round can be done in the shop
      rooms.handle(players[0], { type: "fire" });
      expect(errors(players[0])).toEqual([{ type: "error", code: "wrong-phase", re: "fire" }]);
    });

    it("sells a bundle of a weapon for its price", () => {
      const { screen, players } = startGame(10000);
      const [ann] = players;
      rooms.handle(ann, { type: "buy", weapon: "missile" });
      expect(last(ann, "weapons").counts).toEqual({ missile: 5 });
      expect(money(screen, 0)).toBe(8125);
      expect(money(screen, 1)).toBe(10000);

      rooms.handle(ann, { type: "buy", weapon: "missile" });
      expect(last(ann, "weapons").counts).toEqual({ missile: 10 });
      expect(money(ann, 0)).toBe(6250);
    });

    it("buys an item back for less than it costs, a bundle at a time", () => {
      const { screen, players } = startGame(10000);
      const [ann] = players;
      rooms.handle(ann, { type: "buy", weapon: "missile" });
      rooms.handle(ann, { type: "buy", weapon: "missile" });
      expect(money(screen, 0)).toBe(6250);
      // Five Missiles cost 1,875 and sell for four fifths of it
      rooms.handle(ann, { type: "sell", weapon: "missile" });
      expect(last(ann, "weapons").counts).toEqual({ missile: 5 });
      expect(money(screen, 0)).toBe(7750);
      rooms.handle(ann, { type: "sell", weapon: "missile" });
      expect(last(ann, "weapons").counts).toEqual({});
      expect(money(screen, 0)).toBe(9250);

      rooms.handle(ann, { type: "sell", weapon: "missile" });
      rooms.handle(ann, { type: "sell", weapon: "baby-missile" });
      rooms.handle(screen, { type: "sell", weapon: "missile" });
      expect(errors(ann)).toEqual([
        { type: "error", code: "no-weapon", re: "sell" },
        { type: "error", code: "no-weapon", re: "sell" }
      ]);
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "sell" }]);
      expect(money(screen, 0)).toBe(9250);
    });

    it("sells what is left of a bundle, and only in the shop", () => {
      const { screen, players } = startGame(10000);
      const [ann, bob, cid] = players;
      rooms.handle(ann, { type: "buy", weapon: "tracer" });
      for (const player of players) rooms.handle(player, { type: "ready" });
      rooms.handle(ann, { type: "weapon", weapon: "tracer" });
      rooms.handle(ann, { type: "fire" });
      rooms.handle(ann, { type: "sell", weapon: "tracer" });
      expect(errors(ann)).toEqual([{ type: "error", code: "wrong-phase", re: "sell" }]);

      // The round ends, and the 19 tracers that are left are sold: the one that was chosen is not any more
      vi.advanceTimersByTime(3000);
      destroySelf(bob);
      destroySelf(cid);
      vi.advanceTimersByTime(8000);
      expect(state(screen).phase).toBe("shop");
      const before = money(screen, 0);
      rooms.handle(ann, { type: "sell", weapon: "tracer" });
      expect(last(ann, "weapons")).toEqual({ type: "weapons", selected: "baby-missile", counts: {} });
      expect(money(screen, 0)).toBe(before + 7);
    });

    it("refuses what cannot be bought", () => {
      const { screen, players } = startGame(10000);
      const [ann] = players;
      rooms.handle(ann, { type: "buy", weapon: "nuke" });
      rooms.handle(ann, { type: "buy", weapon: "baby-missile" });
      rooms.handle(ann, { type: "buy", weapon: "death-ray" });
      rooms.handle(screen, { type: "buy", weapon: "missile" });
      expect(errors(ann)).toEqual([
        { type: "error", code: "no-money", re: "buy" },
        { type: "error", code: "no-weapon", re: "buy" },
        { type: "error", code: "no-weapon", re: "buy" }
      ]);
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "buy" }]);
      expect(money(screen, 0)).toBe(10000);

      // At most 99 of anything: five bundles of tracers fit, the sixth does not
      for (let bundle = 0; bundle < 5; bundle++) rooms.handle(ann, { type: "buy", weapon: "tracer" });
      expect(last(ann, "weapons").counts.tracer).toBe(80);
      rooms.handle(ann, { type: "buy", weapon: "tracer" });
      expect(errors(ann).pop()).toEqual({ type: "error", code: "too-many", re: "buy" });
      expect(money(screen, 0)).toBe(9960);
    });

    it("starts the round when everyone who is connected is ready", () => {
      const { screen, players } = startGame(10000);
      const [ann, bob, cid] = players;
      rooms.handle(ann, { type: "buy", weapon: "missile" });
      rooms.handle(ann, { type: "ready" });
      rooms.handle(bob, { type: "ready" });
      expect(state(screen)).toMatchObject({ phase: "shop", shop: { ready: [0, 1] } });

      // The shop does not wait for one who is away
      rooms.disconnect(cid);
      expect(state(screen)).toMatchObject({ phase: "playing", round: 1, shop: null });
      expect(of(screen, "field")).toHaveLength(1);
      // What was bought can be fired
      rooms.handle(ann, { type: "weapon", weapon: "missile" });
      expect(last(ann, "weapons")).toMatchObject({ selected: "missile", counts: { missile: 5 } });
      rooms.handle(ann, { type: "buy", weapon: "missile" });
      expect(errors(ann)).toEqual([{ type: "error", code: "wrong-phase", re: "buy" }]);
    });

    it("closes the shop by itself after a minute", () => {
      const { screen } = startGame(10000);
      vi.advanceTimersByTime(59000);
      expect(state(screen).phase).toBe("shop");
      vi.advanceTimersByTime(1000);
      expect(state(screen)).toMatchObject({ phase: "playing", round: 1 });
    });

    it("tells a player who returns to the shop what it has", () => {
      const { screen, players } = startGame(10000);
      const [ann] = players;
      rooms.handle(ann, { type: "buy", weapon: "missile" });
      rooms.disconnect(ann);
      vi.advanceTimersByTime(20000);
      const again = member("Ann again");
      rooms.handle(again, { type: "resume", room: state(screen).room, playerKey: last(ann, "joined").playerKey });
      expect(state(again)).toMatchObject({ phase: "shop", shop: { time: 40000 } });
      expect(money(again, 0)).toBe(8125);
      expect(last(again, "weapons").counts).toEqual({ missile: 5 });
    });

    it("pays the winner of a round, charges for damage to oneself, and opens the shop with interest", () => {
      const { screen, players } = startGame(0);
      const [ann, bob, cid] = players;
      destroySelf(ann);
      destroySelf(bob);
      expect(last(screen, "roundOver")).toMatchObject({ round: 1, winner: 2 });
      // As measured from the original: 5,000 for the one who is left, -1,500 for destroying oneself
      expect(state(screen).players.map((player) => player.money)).toEqual([-1500, -1500, 5000]);

      vi.advanceTimersByTime(5000);
      expect(state(screen)).toMatchObject({ phase: "shop", round: 1 });
      // Five per cent on what was not spent; a debt stays as it is
      expect(state(screen).players.map((player) => player.money)).toEqual([-1500, -1500, 5250]);
      rooms.handle(ann, { type: "buy", weapon: "tracer" });
      expect(errors(ann)).toEqual([{ type: "error", code: "no-money", re: "buy" }]);

      rooms.handle(cid, { type: "buy", weapon: "missile" });
      for (const player of players) rooms.handle(player, { type: "ready" });
      expect(state(screen)).toMatchObject({ phase: "playing", round: 2 });
      expect(last(cid, "weapons").counts).toEqual({ missile: 5 });
    });

    it("sells only the weapons of the arms level of the room", () => {
      const { screen, players } = startGame(50000, {
        armsLevel: 0,
        traces: false,
        changingWind: false,
        suspendDirt: 0,
        walls: "none"
      });
      const [ann] = players;
      rooms.handle(ann, { type: "buy", weapon: "nuke" });
      rooms.handle(ann, { type: "buy", weapon: "mirv" });
      expect(errors(ann)).toEqual([
        { type: "error", code: "no-weapon", re: "buy" },
        { type: "error", code: "no-weapon", re: "buy" }
      ]);
      rooms.handle(ann, { type: "buy", weapon: "baby-nuke" });
      expect(last(ann, "weapons").counts).toEqual({ "baby-nuke": 3 });
      expect(money(screen, 0)).toBe(40000);
    });

    it("pays the interest the room is set to", () => {
      const { screen, players } = startGame(0, { interest: 30 });
      destroySelf(players[0]);
      destroySelf(players[1]);
      vi.advanceTimersByTime(5000);
      expect(state(screen).players.map((player) => player.money)).toEqual([-1500, -1500, 6500]);
    });

    it("lets nobody new join while the shop is open: the game has started", () => {
      const { screen } = startGame(10000);
      expect(state(screen).phase).toBe("shop");
      const dee = joinRoom(screen, "Dee");
      expect(dee.messages).toEqual([{ type: "error", code: "wrong-phase", re: "join" }]);
      expect(state(screen).players).toHaveLength(3);

      // Nor can the settings be changed any more
      rooms.handle(screen, { type: "settings", settings: { ...state(screen).settings, maxPlayers: 10 } });
      expect(errors(screen)).toEqual([{ type: "error", code: "wrong-phase", re: "settings" }]);
    });

    it("uses batteries for an energy weapon, as many as the power of the shot asks for, and shows the beam of a laser", () => {
      const { screen, players } = startGame(100000);
      const [ann] = players;
      for (const weapon of ["battery", "laser", "plasma-blast"]) rooms.handle(ann, { type: "buy", weapon });
      expect(last(ann, "weapons").counts).toEqual({ battery: 10, laser: 5, "plasma-blast": 5 });
      for (const player of players) rooms.handle(player, { type: "ready" });
      expect(state(screen).phase).toBe("playing");

      rooms.handle(ann, { type: "weapon", weapon: "laser" });
      rooms.handle(ann, { type: "aim", angle: 90, power: 600 });
      rooms.handle(ann, { type: "fire" });
      expect(last(ann, "weapons").counts).toEqual({ battery: 7, laser: 4, "plasma-blast": 5 });
      vi.advanceTimersByTime(1000);
      const beam = last(screen, "beam");
      expect(beam.weapon).toBe("laser");
      expect(beam.x2).toBe(beam.x1);
      expect(last(screen, "shots").shots).toEqual([]);

      // A Plasma Blast with all the power takes five, and the two that are left after it are all the next one gets
      vi.advanceTimersByTime(20000);
      rooms.handle(ann, { type: "weapon", weapon: "plasma-blast" });
      rooms.handle(ann, { type: "aim", angle: 90, power: 1000 });
      rooms.handle(ann, { type: "fire" });
      expect(last(ann, "weapons").counts).toEqual({ battery: 2, laser: 4, "plasma-blast": 4 });
      vi.advanceTimersByTime(20000);
      expect(last(screen, "explode")).toMatchObject({ weapon: "plasma-blast", radius: 150 });
      rooms.handle(ann, { type: "fire" });
      expect(last(ann, "weapons").counts).toEqual({ laser: 4, "plasma-blast": 3 });
      vi.advanceTimersByTime(1000);
      expect(last(screen, "explode").radius).toBeLessThan(150);
    });

    it("puts up a force shield, which those who show the field see as one that deflects", () => {
      const { screen, players } = startGame(100000);
      const [ann] = players;
      rooms.handle(ann, { type: "buy", weapon: "force-shield" });
      expect(last(ann, "weapons").counts).toEqual({ "force-shield": 3 });
      for (const player of players) rooms.handle(player, { type: "ready" });
      rooms.handle(ann, { type: "use", item: "force-shield" });
      expect(last(ann, "energy")).toEqual({ type: "energy", energy: 100, shield: 150 });
      expect(last(screen, "terrain").tanks[0]).toMatchObject({ shield: 150, shieldMax: 150, deflects: true });
      expect(last(screen, "terrain").tanks[1].deflects).toBeUndefined();
    });

    it("sells accessories beside the weapons, and buys them back", () => {
      const { screen, players } = startGame(100000);
      const [ann] = players;
      rooms.handle(ann, { type: "buy", weapon: "parachute" });
      rooms.handle(ann, { type: "buy", weapon: "battery" });
      rooms.handle(ann, { type: "buy", weapon: "shield" });
      expect(last(ann, "weapons").counts).toEqual({ parachute: 8, battery: 10, shield: 3 });
      expect(money(screen, 0)).toBe(100000 - 10000 - 5000 - 20000);
      rooms.handle(ann, { type: "sell", weapon: "shield" });
      expect(last(ann, "weapons").counts).toEqual({ parachute: 8, battery: 10 });
      expect(money(screen, 0)).toBe(65000 + 16000);

      // An accessory is not fired
      for (const player of players) rooms.handle(player, { type: "ready" });
      rooms.handle(ann, { type: "weapon", weapon: "battery" });
      expect(errors(ann)).toEqual([{ type: "error", code: "no-weapon", re: "weapon" }]);
      expect(last(ann, "weapons").selected).toBe("baby-missile");
    });

    it("gives energy back with a battery, and puts up a shield that takes the damage of others", () => {
      const { screen, players } = startGame(100000);
      const [ann, bob] = players;
      rooms.handle(ann, { type: "buy", weapon: "battery" });
      rooms.handle(ann, { type: "buy", weapon: "shield" });
      rooms.handle(ann, { type: "buy", weapon: "heavy-shield" });
      for (const player of players) rooms.handle(player, { type: "ready" });

      // A battery is of no use to a whole tank, and nobody uses what it does not have
      rooms.handle(ann, { type: "use", item: "battery" });
      rooms.handle(bob, { type: "use", item: "shield" });
      rooms.handle(ann, { type: "use", item: "parachute" });
      rooms.handle(screen, { type: "use", item: "battery" });
      expect(errors(ann)).toEqual([
        { type: "error", code: "not-allowed", re: "use" },
        { type: "error", code: "no-weapon", re: "use" }
      ]);
      expect(errors(bob)).toEqual([{ type: "error", code: "no-weapon", re: "use" }]);
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "use" }]);

      // Ann hurts herself, and a battery gives ten of it back
      rooms.handle(ann, { type: "aim", angle: 90, power: 100 });
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(3100);
      const hurt = last(ann, "energy").energy;
      expect(hurt).toBeLessThan(90);
      rooms.handle(ann, { type: "use", item: "battery" });
      expect(last(ann, "energy")).toEqual({ type: "energy", energy: hurt + 10, shield: 0 });
      expect(last(ann, "weapons").counts.battery).toBe(9);
      expect(last(screen, "terrain").tanks.find((tank) => tank.id === 0)!.energy).toBe(hurt + 10);

      // A shield, and a heavier one in its place
      rooms.handle(ann, { type: "use", item: "shield" });
      expect(last(ann, "energy").shield).toBe(100);
      expect(last(screen, "terrain").tanks.find((tank) => tank.id === 0)).toMatchObject({
        shield: 100,
        shieldMax: 100
      });
      rooms.handle(ann, { type: "use", item: "heavy-shield" });
      expect(last(ann, "energy").shield).toBe(200);
      expect(last(ann, "weapons").counts).toMatchObject({ shield: 2, "heavy-shield": 1 });
    });

    it("opens a parachute of a tank that falls, and takes it from what the player has", () => {
      const { screen, players } = startGame(100000);
      const [ann] = players;
      rooms.handle(ann, { type: "buy", weapon: "parachute" });
      rooms.handle(ann, { type: "buy", weapon: "riot-bomb" });
      for (const player of players) rooms.handle(player, { type: "ready" });
      // A Riot Bomb straight up comes down on the tank and takes the ground from under it
      rooms.handle(ann, { type: "weapon", weapon: "riot-bomb" });
      rooms.handle(ann, { type: "aim", angle: 90, power: 100 });
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(3100);
      expect(last(ann, "weapons").counts.parachute).toBe(7);
      expect(last(screen, "terrain").tanks.find((tank) => tank.id === 0)!.energy).toBe(100);
    });

    it("pays for the damage to another tank, and more for destroying it", () => {
      const { screen, players } = startGame(0);
      const field = last(screen, "field").field;
      // The first tank from the left fires at the second with what the flight needs
      const [from, to] = [...field.tanks].sort((a, b) => a.x - b.x);
      const shooter = players[from.id];
      let paid = 0;
      for (let power = 150; power <= 700 && paid === 0; power += 5) {
        rooms.handle(shooter, { type: "aim", angle: 60, power });
        rooms.handle(shooter, { type: "fire" });
        vi.advanceTimersByTime(8000);
        paid = money(screen, from.id);
      }
      const energy = last(screen, "terrain").tanks.find((tank) => tank.id === to.id)!.energy;
      expect(energy).toBeLessThan(100);
      expect(paid).toBe((100 - energy) * 20 + (energy === 0 ? 2000 : 0));
    });
  });

  describe("online rooms", () => {
    const of = <Type extends ServerMessage["type"]>(member: Member, type: Type) =>
      member.messages.filter((message) => message.type === type) as Extract<ServerMessage, { type: Type }>[];
    const types = (member: Member) => member.messages.map((message) => message.type);

    /** A player who creates an online room. */
    const createOnline = (name: string, open = false, more: Partial<RoomState["settings"]> = {}) => {
      const creator = member(name);
      const settings = { ...defaultSettings(), maxWind: 0, ...more };
      rooms.handle(creator, { type: "create", mode: "online", name, public: open, settings });
      return creator;
    };
    /** A player who joins an online room with its link. */
    const joinOnline = (host: Member, name: string) => {
      const player = member(name);
      rooms.handle(player, { type: "join", token: last(host, "token").token, name });
      return player;
    };

    it("makes the one who creates the room its first player and its host, and gives it the link", () => {
      const ann = createOnline("Ann");
      expect(types(ann)).toEqual(["joined", "room", "token"]);
      expect(last(ann, "joined").id).toBe(0);
      expect(state(ann)).toMatchObject({
        mode: "online",
        phase: "lobby",
        host: 0,
        public: false,
        screen: false,
        players: [{ id: 0, name: "Ann", connected: true }]
      });
      // The token of the link does not change, and is too long to guess
      const { token, expiresIn } = last(ann, "token");
      expect(token).toHaveLength(LINK_TOKEN_LENGTH);
      expect(expiresIn).toBe(0);
      vi.advanceTimersByTime(TOKEN_PERIOD * 3);
      expect(of(ann, "token")).toHaveLength(1);
      const bob = joinOnline(ann, "Bob");
      expect(last(bob, "joined").id).toBe(1);
      expect(last(bob, "token").token).toBe(token);
      expect(state(ann).players.map((player) => player.name)).toEqual(["Ann", "Bob"]);
    });

    it("lets only the host start the game and remove players", () => {
      const ann = createOnline("Ann");
      const bob = joinOnline(ann, "Bob");
      rooms.handle(bob, { type: "start" });
      rooms.handle(bob, { type: "kick", id: 0 });
      expect(errors(bob)).toEqual([
        { type: "error", code: "not-allowed", re: "start" },
        { type: "error", code: "not-allowed", re: "kick" }
      ]);

      // The host does not remove itself: it leaves as anyone does
      rooms.handle(ann, { type: "kick", id: 0 });
      expect(errors(ann)).toEqual([{ type: "error", code: "not-allowed", re: "kick" }]);
      const cid = joinOnline(ann, "Cid");
      rooms.handle(ann, { type: "kick", id: 2 });
      expect(errors(cid)).toEqual([{ type: "error", code: "no-session" }]);
      rooms.handle(ann, { type: "start" });
      expect(state(bob)).toMatchObject({ phase: "playing", round: 1 });
    });

    it("has the settings it was created with, which nobody can change: others chose the room by them", () => {
      const ann = createOnline("Ann", true, { rounds: 3, turns: "live", walls: "rubber", maxPlayers: 4 });
      const bob = joinOnline(ann, "Bob");
      expect(state(bob).settings).toMatchObject({ rounds: 3, turns: "live", walls: "rubber", maxPlayers: 4 });

      rooms.handle(ann, { type: "settings", settings: { ...state(ann).settings, rounds: 1 } });
      rooms.handle(bob, { type: "settings", settings: { ...state(bob).settings, rounds: 1 } });
      expect(errors(ann)).toEqual([{ type: "error", code: "not-allowed", re: "settings" }]);
      expect(errors(bob)).toEqual([{ type: "error", code: "not-allowed", re: "settings" }]);
      expect(state(bob).settings.rounds).toBe(3);

      // Not after the game either, back in the lobby
      rooms.handle(ann, { type: "start" });
      expect(state(bob)).toMatchObject({ phase: "playing", settings: { rounds: 3 } });
    });

    it("shows the field to every player, and tells each what happens on it", () => {
      const ann = createOnline("Ann", false, { turns: "live" });
      const bob = joinOnline(ann, "Bob");
      rooms.handle(ann, { type: "start" });
      for (const player of [ann, bob]) {
        expect(
          last(player, "field")
            .field.tanks.map((tank) => tank.id)
            .sort()
        ).toEqual([0, 1]);
        expect(last(player, "aim").id).toBe(last(player, "joined").id);
      }

      // The aim of a player goes to the others, not back to the one who set it
      const aims = of(ann, "aim").length;
      rooms.handle(ann, { type: "aim", angle: 90, power: 100 });
      expect(of(ann, "aim")).toHaveLength(aims);
      expect(last(bob, "aim")).toEqual({ type: "aim", id: 0, angle: 90, power: 100 });

      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(3000);
      for (const player of [ann, bob]) {
        expect(of(player, "shots").length).toBeGreaterThan(1);
        expect(last(player, "shots").shots).toEqual([]);
        expect(of(player, "explode")).toHaveLength(1);
        expect(last(player, "terrain").tanks).toHaveLength(2);
      }
      // What is said is shown to everyone, once
      rooms.handle(bob, { type: "say", text: "Missed me" });
      expect(of(ann, "say")).toEqual([{ type: "say", id: 1, text: "Missed me" }]);
      expect(of(bob, "say")).toHaveLength(1);
    });

    it("gives a player who returns the link, the field and what is its own", () => {
      const ann = createOnline("Ann", false, { turns: "live" });
      const bob = joinOnline(ann, "Bob");
      rooms.handle(ann, { type: "start" });
      rooms.disconnect(bob);
      expect(state(ann).players[1].connected).toBe(false);
      const again = member("Bob again");
      rooms.handle(again, { type: "resume", room: state(ann).room, playerKey: last(bob, "joined").playerKey });
      expect(types(again)).toEqual(["joined", "room", "token", "field", "aim", "reload", "energy", "weapons"]);
      expect(last(again, "field").field.tanks).toHaveLength(2);
    });

    it("passes the host on when the host leaves: to the one who has been in the room the longest", () => {
      const ann = createOnline("Ann");
      const bob = joinOnline(ann, "Bob");
      const cid = joinOnline(ann, "Cid");
      rooms.handle(ann, { type: "leave" });
      expect(state(bob)).toMatchObject({ host: 1, players: [{ name: "Bob" }, { name: "Cid" }] });
      rooms.handle(bob, { type: "kick", id: 2 });
      expect(errors(cid)).toEqual([{ type: "error", code: "no-session" }]);

      // The number of the one who left is free again, but the one who takes it is the newest in the room
      const dee = joinOnline(bob, "Dee");
      const eve = joinOnline(bob, "Eve");
      expect(last(dee, "joined").id).toBe(0);
      expect(last(eve, "joined").id).toBe(2);
      rooms.handle(bob, { type: "leave" });
      expect(state(eve).host).toBe(0);
    });

    it("waits ten seconds for a host that lost its connection, and then passes the host on", () => {
      const ann = createOnline("Ann");
      const bob = joinOnline(ann, "Bob");
      rooms.disconnect(ann);
      vi.advanceTimersByTime(9000);
      expect(state(bob).host).toBe(0);
      vi.advanceTimersByTime(1000);
      expect(state(bob).host).toBe(1);

      // The old host is a player still, and can come back as one
      const again = member("Ann again");
      rooms.handle(again, { type: "resume", room: state(bob).room, playerKey: last(ann, "joined").playerKey });
      expect(state(again)).toMatchObject({ host: 1, players: [{ name: "Ann", connected: true }, { name: "Bob" }] });
    });

    it("keeps the host that comes back in time, and has nobody to pass the host to when all are away", () => {
      const ann = createOnline("Ann");
      const bob = joinOnline(ann, "Bob");
      rooms.disconnect(ann);
      vi.advanceTimersByTime(5000);
      const again = member("Ann again");
      rooms.handle(again, { type: "resume", room: state(bob).room, playerKey: last(ann, "joined").playerKey });
      vi.advanceTimersByTime(20000);
      expect(state(bob).host).toBe(0);

      rooms.disconnect(bob);
      rooms.disconnect(again);
      vi.advanceTimersByTime(20000);
      const back = member("Bob again");
      rooms.handle(back, { type: "resume", room: state(bob).room, playerKey: last(bob, "joined").playerKey });
      expect(state(back).host).toBe(0);
    });

    it("goes on to the end with those who are left, and is gone when the last one leaves", () => {
      const ann = createOnline("Ann", false, { turns: "live", rounds: 2 });
      const bob = joinOnline(ann, "Bob");
      const cid = joinOnline(ann, "Cid");
      rooms.handle(ann, { type: "start" });
      rooms.handle(bob, { type: "leave" });
      expect(state(ann)).toMatchObject({ phase: "playing", round: 1 });
      expect(last(ann, "field").field.tanks).toHaveLength(2);

      // The round ends when the one who leaves was the last one in its way
      rooms.handle(cid, { type: "leave" });
      expect(last(ann, "roundOver")).toMatchObject({ round: 1, winner: 0 });
      vi.advanceTimersByTime(5000);
      expect(state(ann)).toMatchObject({ phase: "playing", round: 2, host: 0 });
      expect(rooms.size).toBe(1);
      rooms.handle(ann, { type: "leave" });
      expect(rooms.size).toBe(0);
    });

    it("keeps a room that everyone lost the connection to for a while, and then removes it", () => {
      const ann = createOnline("Ann");
      const bob = joinOnline(ann, "Bob");
      rooms.disconnect(ann);
      rooms.disconnect(bob);
      vi.advanceTimersByTime(ROOM_TIMEOUT - 1000);
      expect(rooms.size).toBe(1);
      const again = member("Bob again");
      rooms.handle(again, { type: "resume", room: state(bob).room, playerKey: last(bob, "joined").playerKey });
      vi.advanceTimersByTime(ROOM_TIMEOUT);
      expect(rooms.size).toBe(1);
      rooms.disconnect(again);
      vi.advanceTimersByTime(ROOM_TIMEOUT);
      expect(rooms.size).toBe(0);
    });

    it("lists the public rooms that can be joined: not private, started or full ones", () => {
      const ann = createOnline("Ann", true, { maxPlayers: 3 });
      createOnline("Bea", false);
      createRoom();
      const asker = member("asker");
      rooms.handle(asker, { type: "list" });
      expect(last(asker, "rooms").rooms).toEqual([
        {
          room: state(ann).room,
          token: last(ann, "token").token,
          host: "Ann",
          players: 1,
          settings: state(ann).settings,
          startsIn: 300000
        }
      ]);

      // Joined from the list, with its token
      const bob = member("Bob");
      rooms.handle(bob, { type: "join", token: last(asker, "rooms").rooms[0].token, name: "Bob" });
      expect(state(ann).players).toHaveLength(2);
      rooms.handle(asker, { type: "list" });
      expect(last(asker, "rooms").rooms[0].players).toBe(2);

      // Full: the game starts by itself, and the room is not in the list any more
      joinOnline(ann, "Cid");
      expect(state(ann).phase).toBe("playing");
      rooms.handle(asker, { type: "list" });
      expect(last(asker, "rooms").rooms).toEqual([]);
      const late = joinOnline(ann, "Dee");
      expect(late.messages).toEqual([{ type: "error", code: "wrong-phase", re: "join" }]);
    });

    it("lists the rooms with the most players first, and the older of two with as many", () => {
      const ann = createOnline("Ann", true);
      const bea = createOnline("Bea", true, { turns: "live" });
      const cid = createOnline("Cid", true);
      joinOnline(bea, "Dee");
      joinOnline(cid, "Eve");
      joinOnline(cid, "Fay");
      const asker = member("asker");
      rooms.handle(asker, { type: "list" });
      expect(last(asker, "rooms").rooms.map((room) => [room.host, room.players])).toEqual([
        ["Cid", 3],
        ["Bea", 2],
        ["Ann", 1]
      ]);
      // Each comes with its settings, to choose by
      expect(last(asker, "rooms").rooms[1].settings.turns).toBe("live");

      const gus = createOnline("Gus", true);
      rooms.handle(asker, { type: "list" });
      expect(last(asker, "rooms").rooms.map((room) => room.host)).toEqual(["Cid", "Bea", "Ann", "Gus"]);
      expect(state(gus).players).toHaveLength(1);
      expect(state(ann).players).toHaveLength(1);
    });

    it("has only so many online rooms, which does not stop hotseat rooms", () => {
      rooms.shutdown();
      rooms = createRooms({ maxOnlineRooms: 2 });
      createOnline("Ann");
      createOnline("Bea");
      const cid = createOnline("Cid");
      expect(cid.messages).toEqual([{ type: "error", code: "busy", re: "create" }]);
      const screen = createRoom();
      expect(last(screen, "created").room).toHaveLength(ROOM_ID_LENGTH);
    });

    it("starts the game by itself when the lobby has been open for five minutes, with those who are there", () => {
      const ann = createOnline("Ann", true);
      expect(state(ann).startsIn).toBe(300000);
      vi.advanceTimersByTime(120000);
      const bob = joinOnline(ann, "Bob");
      expect(state(bob)).toMatchObject({ phase: "lobby", startsIn: 180000 });
      const asker = member("asker");
      rooms.handle(asker, { type: "list" });
      expect(last(asker, "rooms").rooms[0].startsIn).toBe(180000);

      vi.advanceTimersByTime(179000);
      expect(state(bob).phase).toBe("lobby");
      vi.advanceTimersByTime(1000);
      expect(state(bob)).toMatchObject({ phase: "playing", round: 1, startsIn: null });
      expect(last(bob, "field").field.tanks).toHaveLength(2);
    });

    it("closes a room that nobody else came to in that time, and tells its player", () => {
      const ann = createOnline("Ann", true);
      vi.advanceTimersByTime(300000);
      expect(rooms.size).toBe(0);
      expect(errors(ann)).toEqual([{ type: "error", code: "no-room" }]);
      const asker = member("asker");
      rooms.handle(asker, { type: "list" });
      expect(last(asker, "rooms").rooms).toEqual([]);
    });

    it("does not wait for the time when the host starts the game, and opens the lobby anew after a game", () => {
      const ann = createOnline("Ann", false, { turns: "live", rounds: 1 });
      const bob = joinOnline(ann, "Bob");
      vi.advanceTimersByTime(60000);
      rooms.handle(ann, { type: "start" });
      expect(state(bob)).toMatchObject({ phase: "playing", startsIn: null });
      // The time of the lobby does nothing to a game that is going on
      vi.advanceTimersByTime(300000);
      expect(state(bob)).toMatchObject({ phase: "playing", round: 1 });

      rooms.handle(bob, { type: "leave" });
      vi.advanceTimersByTime(5000);
      expect(state(ann).phase).toBe("finished");
      rooms.handle(ann, { type: "lobby" });
      expect(state(ann)).toMatchObject({ phase: "lobby", startsIn: 300000 });
      // Alone in the new lobby: the room is closed when its time is out
      vi.advanceTimersByTime(300000);
      expect(rooms.size).toBe(0);
    });

    it("lets one address have one online room at a time", () => {
      rooms.shutdown();
      rooms = createRooms({ addressOf: (who) => who.name.split(" ")[0] });
      const create = (name: string) => {
        const creator = member(name);
        const settings = { ...defaultSettings(), maxWind: 0 };
        rooms.handle(creator, { type: "create", mode: "online", name: "Ann", public: true, settings });
        return creator;
      };
      const first = create("home laptop");
      const second = create("home phone");
      expect(second.messages).toEqual([{ type: "error", code: "busy", re: "create" }]);
      const other = create("office laptop");
      expect(last(other, "joined").id).toBe(0);

      // A hotseat room is another matter, and when the online room is gone there can be a new one
      rooms.handle(second, { type: "create", mode: "hotseat" });
      expect(last(second, "created").room).toHaveLength(ROOM_ID_LENGTH);
      rooms.handle(first, { type: "leave" });
      const third = create("home tablet");
      expect(last(third, "joined").id).toBe(0);
    });

    it("keeps hotseat rooms as they were: the screen is the host, and no player is", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      expect(state(screen)).toMatchObject({ mode: "hotseat", host: null, public: false });
      rooms.handle(ann, { type: "start" });
      expect(errors(ann)).toEqual([{ type: "error", code: "not-allowed", re: "start" }]);
    });
  });

  describe("the limits of rooms", () => {
    const create = (name: string) => {
      const screen = member(name);
      rooms.handle(screen, { type: "create", mode: "hotseat" });
      return screen;
    };

    it("has only so many rooms in all", () => {
      rooms.shutdown();
      rooms = createRooms({ maxRooms: 2 });
      create("first");
      const second = create("second");
      const third = create("third");
      expect(third.messages).toEqual([{ type: "error", code: "busy", re: "create" }]);
      expect(rooms.size).toBe(2);

      const online = member("online");
      rooms.handle(online, {
        type: "create",
        mode: "online",
        name: "Ann",
        public: true,
        settings: defaultSettings()
      });
      expect(online.messages).toEqual([{ type: "error", code: "busy", re: "create" }]);

      // When a room is gone, there is room for another
      rooms.disconnect(second);
      vi.advanceTimersByTime(ROOM_TIMEOUT);
      rooms.handle(third, { type: "create", mode: "hotseat" });
      expect(last(third, "created").room).toHaveLength(ROOM_ID_LENGTH);
    });

    it("has only so many rooms from one address, and does not count those of others", () => {
      rooms.shutdown();
      // The address of a member is the first word of its name
      rooms = createRooms({ maxRoomsPerAddress: 2, addressOf: (who) => who.name.split(" ")[0] });
      create("home tv");
      create("home laptop");
      const third = create("home tablet");
      expect(third.messages).toEqual([{ type: "error", code: "busy", re: "create" }]);
      const other = create("office tv");
      expect(last(other, "created").room).toHaveLength(ROOM_ID_LENGTH);

      // Joining is not creating: any number of players can come from the address of the room
      for (const name of ["Ann", "Bob", "Cid"]) {
        const phone = member(`home ${name}`);
        rooms.handle(phone, { type: "join", token: last(other, "token").token, name });
        expect(last(phone, "joined").room).toBe(last(other, "created").room);
      }
    });
  });
});
