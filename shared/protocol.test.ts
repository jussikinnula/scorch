// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isClientMessage, isRoomSettings, MAX_NAME_LENGTH, MAX_SAY_LENGTH, PROTOCOL_VERSION } from "./protocol";

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
      {
        type: "settings",
        settings: { maxPlayers: 8, rounds: 10, turns: "live", maxWind: 0, cash: 0, interest: 5, armsLevel: 4 }
      },
      { type: "lobby" },
      { type: "kick", id: 0 },
      { type: "start" },
      { type: "fire" },
      { type: "aim", angle: 0 },
      { type: "aim", power: 1000 },
      { type: "aim", angle: 180, power: 0 },
      { type: "say", text: "Eat this!" }
    ];
    expect(isClientMessage({ type: "weapon", weapon: "baby-nuke" })).toBe(true);
    expect(isClientMessage({ type: "buy", weapon: "missile" })).toBe(true);
    expect(isClientMessage({ type: "ready" })).toBe(true);
    expect(isClientMessage({ type: "buy" })).toBe(false);
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
      {
        type: "settings",
        settings: { maxPlayers: 1, rounds: 10, turns: "live", maxWind: 0, cash: 0, interest: 5, armsLevel: 4 }
      },
      {
        type: "settings",
        settings: { maxPlayers: 11, rounds: 10, turns: "live", maxWind: 0, cash: 0, interest: 5, armsLevel: 4 }
      },
      { type: "settings", settings: { maxPlayers: 8 } },
      { type: "settings", settings: { maxPlayers: 8, rounds: 10 } },
      {
        type: "settings",
        settings: { maxPlayers: 8, rounds: 10, turns: "fast", maxWind: 0, cash: 0, interest: 5, armsLevel: 4 }
      },
      {
        type: "settings",
        settings: { maxPlayers: 8, rounds: 0, turns: "live", maxWind: 0, cash: 0, interest: 5, armsLevel: 4 }
      },
      {
        type: "settings",
        settings: { maxPlayers: 8, rounds: 1001, turns: "live", maxWind: 0, cash: 0, interest: 5, armsLevel: 4 }
      },
      { type: "kick" },
      { type: "kick", id: -1 },
      { type: "kick", id: 10 },
      { type: "kick", id: 1.5 }
    ];
    for (const weapon of [undefined, 5, "", "two words"])
      expect(isClientMessage({ type: "weapon", weapon })).toBe(false);
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
  it("accepts 2-10 players and 1-1000 rounds", () => {
    expect(
      isRoomSettings({ maxPlayers: 2, rounds: 1, turns: "live", maxWind: 0, cash: 0, interest: 5, armsLevel: 4 })
    ).toBe(true);
    expect(
      isRoomSettings({ maxPlayers: 2, rounds: 1, turns: "classic", maxWind: 0, cash: 0, interest: 5, armsLevel: 4 })
    ).toBe(true);
    expect(isRoomSettings({ maxPlayers: 2, rounds: 1 })).toBe(false);
    expect(
      isRoomSettings({ maxPlayers: 10, rounds: 1000, turns: "live", maxWind: 0, cash: 0, interest: 5, armsLevel: 4 })
    ).toBe(true);
    expect(
      isRoomSettings({ maxPlayers: 8, rounds: 10, turns: "live", maxWind: 500, cash: 0, interest: 5, armsLevel: 4 })
    ).toBe(true);
    for (const maxWind of [undefined, -1, 501, 0.5, "200"]) {
      expect(isRoomSettings({ maxPlayers: 8, rounds: 10, turns: "live", maxWind })).toBe(false);
    }
    for (const cash of [undefined, -5000, 1000001, 0.5]) {
      expect(isRoomSettings({ maxPlayers: 8, rounds: 10, turns: "live", maxWind: 0, cash })).toBe(false);
    }
    expect(
      isRoomSettings({ maxPlayers: 8, rounds: 10, turns: "live", maxWind: 0, cash: 1000000, interest: 5, armsLevel: 4 })
    ).toBe(true);
    expect(
      isRoomSettings({ maxPlayers: 8.5, rounds: 10, turns: "live", maxWind: 0, cash: 0, interest: 5, armsLevel: 4 })
    ).toBe(false);
    expect(isRoomSettings({ maxPlayers: 8, rounds: 2.5 })).toBe(false);
    expect(isRoomSettings({})).toBe(false);
    expect(isRoomSettings(null)).toBe(false);
  });
});

describe("the settings of the economy", () => {
  const settings = { maxPlayers: 8, rounds: 10, turns: "live", maxWind: 0, cash: 0, interest: 5, armsLevel: 4 };

  it("have an interest of 0 to 30 per cent and an arms level of 0 to 4", () => {
    expect(isRoomSettings(settings)).toBe(true);
    expect(isRoomSettings({ ...settings, interest: 30, armsLevel: 0 })).toBe(true);
    for (const interest of [undefined, -1, 31, 2.5]) expect(isRoomSettings({ ...settings, interest })).toBe(false);
    for (const armsLevel of [undefined, -1, 5, 1.5]) expect(isRoomSettings({ ...settings, armsLevel })).toBe(false);
  });
});

describe("the version of the protocol", () => {
  /**
   * The fingerprint of the protocol of each version: of everything in protocol.ts from the limits
   * on, without the comments and the spaces.
   *
   * When this test fails, the protocol has changed. Raise PROTOCOL_VERSION by one and add the new
   * fingerprint, which the failure tells, here under the new version. Do not change the fingerprint
   * of a version that has been deployed: a client and a server of the same version must agree.
   */
  const FINGERPRINTS: Record<number, string> = {
    2: "6fd94d4f0804eed9",
    3: "33e986dc878d9fea",
    4: "d252a3503257c8fd",
    5: "81ea370a0695494a",
    6: "a1beab696b9687ab",
    7: "fa52dd71ac102570",
    8: "1c3dc1ab37d3fe99",
    9: "d842a2c0ed112fef",
    10: "95a0e636ae33ac22"
  };

  it("is raised when the protocol changes", () => {
    const source = readFileSync(fileURLToPath(new URL("./protocol.ts", import.meta.url)), "utf8");
    const start = source.indexOf("// Limits.");
    expect(start).toBeGreaterThan(0);
    const code = source
      .slice(start)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\s+/g, "");
    const fingerprint = createHash("sha256").update(code).digest("hex").slice(0, 16);

    expect(
      FINGERPRINTS[PROTOCOL_VERSION],
      `The protocol is not the one of version ${PROTOCOL_VERSION}: raise PROTOCOL_VERSION and add "${fingerprint}" for the new version`
    ).toBe(fingerprint);
  });
});
