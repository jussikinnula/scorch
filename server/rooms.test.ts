// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MAX_PLAYERS, MAX_NAME_LENGTH, RoomState, ServerMessage } from "../shared/protocol";
import Rooms, { JOIN_TOKEN_LENGTH, ROOM_ID_LENGTH } from "./rooms";

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

  beforeEach(() => {
    vi.useFakeTimers();
    rooms = new Rooms<Member>(
      (to, message) => to.messages.push(message),
      (who) => (who.closed = true),
      { tokenPeriod: TOKEN_PERIOD, roomTimeout: ROOM_TIMEOUT, seed: 1 }
    );
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
        settings: { maxPlayers: DEFAULT_MAX_PLAYERS },
        players: [],
        screen: true
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
        { id: 0, name: "Ann", connected: true },
        { id: 1, name: "Bob", connected: true }
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
      rooms.handle(screen, { type: "settings", settings: { maxPlayers: 2 } });
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
      rooms.handle(screen, { type: "settings", settings: { maxPlayers: 3 } });
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
      rooms.handle(screen, { type: "settings", settings: { maxPlayers: 2 } });
      expect(state(screen).phase).toBe("playing");
    });

    it("lets the screen change the maximum number of players, but not below those in the room", () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      joinRoom(screen, "Cat");

      rooms.handle(screen, { type: "settings", settings: { maxPlayers: 5 } });
      expect(state(ann).settings).toEqual({ maxPlayers: 5 });

      rooms.handle(screen, { type: "settings", settings: { maxPlayers: 2 } });
      expect(errors(screen)).toEqual([{ type: "error", code: "not-allowed", re: "settings" }]);
      expect(state(ann).settings).toEqual({ maxPlayers: 5 });
    });

    it("does not let the settings be changed after the game has started", () => {
      const screen = createRoom();
      joinRoom(screen, "Ann");
      joinRoom(screen, "Bob");
      rooms.handle(screen, { type: "start" });
      rooms.handle(screen, { type: "settings", settings: { maxPlayers: 5 } });
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
        rooms.handle(who, { type: "settings", settings: { maxPlayers: 2 } });
        expect(errors(who)).toEqual([
          { type: "error", code: "not-allowed", re: "start" },
          { type: "error", code: "not-allowed", re: "kick" },
          { type: "error", code: "not-allowed", re: "settings" }
        ]);
      }
      expect(state(screen)).toMatchObject({ phase: "lobby", settings: { maxPlayers: DEFAULT_MAX_PLAYERS } });
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
      expect(state(screen).players).toEqual([{ id: 0, name: "Ann", connected: false }]);

      const again = member("Ann again");
      rooms.handle(again, { type: "resume", room, playerKey });
      expect(last(again, "joined")).toEqual({ type: "joined", room, id: 0, playerKey });
      expect(state(screen).players).toEqual([{ id: 0, name: "Ann", connected: true }]);
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
      expect(state(screen).players).toEqual([{ id: 0, name: "Ann", connected: true }]);
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
        { id: 0, name: "Ann", connected: true },
        { id: 1, name: "Bob", connected: true }
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
      expect(state(first).players).toEqual([{ id: 0, name: "Ann", connected: false }]);
      expect(state(second).players).toEqual([{ id: 0, name: "Ann", connected: true }]);
    });
  });

  describe("the playing field", () => {
    /** A room with a game going on between Ann and Bob. */
    const startGame = () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const bob = joinRoom(screen, "Bob");
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
      rooms.handle(screen, { type: "settings", settings: { maxPlayers: 2 } });
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
      expect(types(again)).toEqual(["joined", "room", "aim", "reload"]);
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
      rooms.handle(screen, { type: "start" });
      return { screen, ann, bob };
    };
    const of = <Type extends ServerMessage["type"]>(member: Member, type: Type) =>
      member.messages.filter((message) => message.type === type) as Extract<ServerMessage, { type: Type }>[];

    it("sends a projectile into the air, which the screen is told about until it is gone", () => {
      const { screen, ann, bob } = startGame();
      const tank = last(screen, "field").field.tanks[0];
      rooms.handle(ann, { type: "fire" });

      vi.advanceTimersByTime(50);
      const [first] = of(screen, "shots");
      expect(first.shots).toEqual([{ id: 1, owner: 0, x: expect.any(Number), y: expect.any(Number) }]);
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
      // Straight up at low power: the projectile comes down on the tank
      rooms.handle(ann, { type: "aim", angle: 90, power: 100 });
      rooms.handle(ann, { type: "fire" });
      vi.advanceTimersByTime(60000);

      const [explosion] = of(screen, "explode");
      const [terrain] = of(screen, "terrain");
      const tank = terrain.tanks[0];
      expect(Math.abs(explosion.x - tank.x)).toBeLessThanOrEqual(1);
      expect(terrain.changes).toEqual([
        { op: "carve", x: explosion.x, y: explosion.y, r: explosion.radius },
        { op: "settle" }
      ]);
      // The tank came down with the ground, the other one did not move
      const before = last(screen, "field").field.tanks;
      expect(terrain.tanks.map((moved) => moved.id)).toEqual([0, 1]);
      expect(terrain.tanks[1]).toEqual(before[1]);
    });

    it("gives a screen that returns the terrain as it is after the explosions", () => {
      const { screen, ann } = startGame();
      rooms.handle(ann, { type: "aim", angle: 90, power: 100 });
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
      rooms.handle(ann, { type: "aim", angle: 90, power: 100 });
      rooms.handle(ann, { type: "fire" });
      const { room, hostKey } = last(screen, "created");
      const { y } = last(screen, "field").field.tanks[0];
      rooms.disconnect(screen);
      vi.advanceTimersByTime(60000);

      const again = member("screen again");
      rooms.handle(again, { type: "host", room, hostKey });
      // The shot has landed on the tank meanwhile: the tank is lower than it was
      expect(last(again, "field").field.tanks[0].y).toBeGreaterThan(y);
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

  describe("the speech bubbles", () => {
    const startGame = () => {
      const screen = createRoom();
      const ann = joinRoom(screen, "Ann");
      const bob = joinRoom(screen, "Bob");
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
});
