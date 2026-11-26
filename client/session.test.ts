import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadHostKey,
  loadLastHost,
  loadLastPlayer,
  loadName,
  loadPlayerKey,
  nextTestDevice,
  saveHostKey,
  saveName,
  savePlayerKey,
  testDevice
} from "./session";

describe("what the device remembers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("keeps the keys by room", () => {
    saveHostKey("abc", "host-key");
    savePlayerKey("abc", "player-key");
    expect(loadHostKey("abc")).toBe("host-key");
    expect(loadPlayerKey("abc")).toBe("player-key");
    expect(loadHostKey("other")).toBeNull();
    expect(loadPlayerKey("other")).toBeNull();
  });

  it("forgets a key", () => {
    savePlayerKey("abc", "player-key");
    savePlayerKey("abc", null);
    expect(loadPlayerKey("abc")).toBeNull();
  });

  it("remembers the latest room of each kind, until its key is forgotten", () => {
    expect(loadLastPlayer()).toBeNull();
    savePlayerKey("abc", "key-1");
    savePlayerKey("def", "key-2");
    saveHostKey("ghi", "key-3");
    expect(loadLastPlayer()).toEqual({ room: "def", key: "key-2" });
    expect(loadLastHost()).toEqual({ room: "ghi", key: "key-3" });

    // Forgetting an older one does not change the latest
    savePlayerKey("abc", null);
    expect(loadLastPlayer()).toEqual({ room: "def", key: "key-2" });
    savePlayerKey("def", null);
    expect(loadLastPlayer()).toBeNull();
    saveHostKey("ghi", null);
    expect(loadLastHost()).toBeNull();
  });

  it("keeps the name", () => {
    expect(loadName()).toBe("");
    saveName("Sprig");
    expect(loadName()).toBe("Sprig");
  });

  it("works without a storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("no storage");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("no storage");
    });
    saveName("Sprig");
    expect(loadName()).toBe("");
    expect(loadHostKey("abc")).toBeNull();
  });

  describe("in a test phone", () => {
    it("is kept apart from the other windows of the browser", () => {
      savePlayerKey("abc", "key-of-the-browser");
      saveName("Sprig");

      window.history.replaceState(null, "", "/?device=2#/join/xyz");
      expect(testDevice()).toBe("2");
      expect(loadPlayerKey("abc")).toBeNull();
      expect(loadName()).toBe("Phone 2");
      savePlayerKey("abc", "key-of-phone-2");
      saveName("Ann");

      window.history.replaceState(null, "", "/?device=3");
      expect(loadPlayerKey("abc")).toBeNull();
      expect(loadName()).toBe("Phone 3");

      window.history.replaceState(null, "", "/?device=2");
      expect(loadPlayerKey("abc")).toBe("key-of-phone-2");
      expect(loadName()).toBe("Ann");

      window.history.replaceState(null, "", "/");
      expect(testDevice()).toBeNull();
      expect(loadPlayerKey("abc")).toBe("key-of-the-browser");
      expect(loadName()).toBe("Sprig");
    });

    it("ignores a device that is not a plain name", () => {
      window.history.replaceState(null, "", "/?device=a.b");
      expect(testDevice()).toBeNull();
    });

    it("numbers the test phones", () => {
      expect(nextTestDevice()).toBe(1);
      expect(nextTestDevice()).toBe(2);
    });
  });
});
