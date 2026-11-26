// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isClientMessage, isRoomSettings, MAX_NAME_LENGTH, MAX_SAY_LENGTH } from "./protocol";

describe("isClientMessage", () => {
  it("accepts the messages of the API", () => {
    const messages = [
      { type: "ping" },
      { type: "create", mode: "hotseat" },
      { type: "host", room: "k3v9x2ab", hostKey: "Zm9v_YmFy-0" },
      { type: "join", token: "a1b2c3d4e5", name: "Sprig" },
      { type: "join", token: "a1b2c3d4e5", name: "Äiti 🙂" },
      { type: "resume", room: "k3v9x2ab", playerKey: "Zm9v_YmFy-0" },
      { type: "rejoin", token: "a1b2c3d4e5", playerKey: "Zm9v_YmFy-0" },
      { type: "leave" },
      { type: "settings", settings: { maxPlayers: 8 } },
      { type: "kick", id: 0 },
      { type: "start" },
      { type: "aim", angle: 0 },
      { type: "aim", power: 1000 },
      { type: "aim", angle: 180, power: 0 },
      { type: "say", text: "Eat this!" }
    ];
    for (const message of messages) expect(isClientMessage(message), JSON.stringify(message)).toBe(true);
  });

  it("refuses what is not a message", () => {
    for (const value of [null, undefined, "ping", 1, [], {}, { type: "nonsense" }, { type: 1 }]) {
      expect(isClientMessage(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("refuses messages with missing or wrong fields", () => {
    const messages = [
      { type: "create" },
      { type: "create", mode: "online" },
      { type: "host", room: "k3v9x2ab" },
      { type: "host", room: "../etc", hostKey: "abc" },
      { type: "join", token: "a1b2c3d4e5" },
      { type: "join", token: "", name: "Sprig" },
      { type: "resume", room: "k3v9x2ab", playerKey: 1 },
      { type: "rejoin", token: "a1b2c3d4e5" },
      { type: "rejoin", playerKey: "Zm9v_YmFy-0" },
      { type: "settings" },
      { type: "settings", settings: { maxPlayers: 1 } },
      { type: "settings", settings: { maxPlayers: 11 } },
      { type: "kick" },
      { type: "kick", id: -1 },
      { type: "kick", id: 10 },
      { type: "kick", id: 1.5 }
    ];
    for (const message of messages) expect(isClientMessage(message), JSON.stringify(message)).toBe(false);
  });

  it("refuses names and texts that are empty, too long or have control characters", () => {
    for (const name of ["", "   ", "a".repeat(MAX_NAME_LENGTH + 1), "two\nlines", "bell\u0007"]) {
      expect(isClientMessage({ type: "join", token: "abc", name }), JSON.stringify(name)).toBe(false);
    }
    expect(isClientMessage({ type: "join", token: "abc", name: "a".repeat(MAX_NAME_LENGTH) })).toBe(true);
    expect(isClientMessage({ type: "say", text: "a".repeat(MAX_SAY_LENGTH) })).toBe(true);
    expect(isClientMessage({ type: "say", text: "a".repeat(MAX_SAY_LENGTH + 1) })).toBe(false);
    expect(isClientMessage({ type: "say", text: " " })).toBe(false);
  });

  it("counts the length of a text in characters, not in code units", () => {
    expect(isClientMessage({ type: "join", token: "abc", name: "🙂".repeat(MAX_NAME_LENGTH) })).toBe(true);
  });

  it("refuses an aim that is empty or out of range", () => {
    const aims = [{}, { angle: -1 }, { angle: 181 }, { angle: 45.5 }, { angle: "45" }, { power: -1 }, { power: 1001 }];
    for (const aim of aims) expect(isClientMessage({ type: "aim", ...aim }), JSON.stringify(aim)).toBe(false);
    expect(isClientMessage({ type: "aim", angle: 45, power: 1001 })).toBe(false);
  });
});

describe("isRoomSettings", () => {
  it("accepts a maximum number of players of 2-10", () => {
    expect(isRoomSettings({ maxPlayers: 2 })).toBe(true);
    expect(isRoomSettings({ maxPlayers: 10 })).toBe(true);
    expect(isRoomSettings({ maxPlayers: 8.5 })).toBe(false);
    expect(isRoomSettings({})).toBe(false);
    expect(isRoomSettings(null)).toBe(false);
  });
});
