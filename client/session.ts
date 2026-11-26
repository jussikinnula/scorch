/**
 * What the device remembers between visits: the keys with which it returns to a room as its screen
 * or as a player (see docs/PROTOCOL.md), and the name the player used last.
 *
 * The storage of a browser can be missing or full, e.g. in private browsing. Then nothing is
 * remembered, and the game still works until the page is reloaded.
 */
const PREFIX = "scorch.";

/**
 * The name of the test phone this window is, or null if it is an ordinary one. A test phone is a
 * window opened from the screen in development, with ?device=... in its address. Each has a storage
 * of its own, so that many of them can be different players in the same browser.
 */
export function testDevice() {
  const device = new URLSearchParams(window.location.search).get("device");
  return device !== null && /^[A-Za-z0-9]{1,16}$/.test(device) ? device : null;
}

function prefix() {
  const device = testDevice();
  return device === null ? PREFIX : `${PREFIX}device.${device}.`;
}

function read(key: string) {
  try {
    return window.localStorage.getItem(prefix() + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(prefix() + key);
    else window.localStorage.setItem(prefix() + key, value);
  } catch {
    // Nothing is remembered
  }
}

/** A room this device has a key to, and the key. */
export interface Stored {
  room: string;
  key: string;
}

/** Keeps a key by room, and remembers which room was the latest. Null as the key forgets it. */
function saveKey(kind: "host" | "player", room: string, key: string | null) {
  write(`${kind}.${room}`, key);
  if (key !== null) write(`${kind}.last`, room);
  else if (read(`${kind}.last`) === room) write(`${kind}.last`, null);
}

/** The latest room this device has a key of a kind to, if any. */
function loadLast(kind: "host" | "player"): Stored | null {
  const room = read(`${kind}.last`);
  const key = room === null ? null : read(`${kind}.${room}`);
  return room !== null && key !== null ? { room, key } : null;
}

export const loadHostKey = (room: string) => read(`host.${room}`);
export const saveHostKey = (room: string, key: string | null) => saveKey("host", room, key);
/** The room this device was last the screen of. */
export const loadLastHost = () => loadLast("host");

export const loadPlayerKey = (room: string) => read(`player.${room}`);
export const savePlayerKey = (room: string, key: string | null) => saveKey("player", room, key);
/** The room this device was last a player of. The key is how the server knows the device. */
export const loadLastPlayer = () => loadLast("player");

/** The name the player used last. A test phone that has not been named yet has a name by its number. */
export function loadName() {
  const device = testDevice();
  return read("name") ?? (device === null ? "" : `Phone ${device}`);
}
export const saveName = (name: string) => write("name", name);

/** The number of the next test phone of this browser, from 1. */
export function nextTestDevice() {
  let next = 1;
  try {
    next = (Number(window.localStorage.getItem(`${PREFIX}testDevices`)) || 0) + 1;
    window.localStorage.setItem(`${PREFIX}testDevices`, String(next));
  } catch {
    // Without a storage every test phone is the first one
  }
  return next;
}
