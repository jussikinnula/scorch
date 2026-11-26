// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { PROTOCOL_VERSION, socketPath } from "../shared/protocol";
import { Backend, startBackend } from "../test/backend";
import { isAllowedOrigin, MAX_MESSAGES_PER_SECOND, parseOrigins } from "./socket";

describe("parseOrigins", () => {
  it("splits a comma separated list", () => {
    expect(parseOrigins("https://example.org/, http://localhost:4100")).toEqual([
      "https://example.org",
      "http://localhost:4100"
    ]);
  });

  it("is empty when nothing is given", () => {
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins(" ")).toEqual([]);
  });
});

describe("isAllowedOrigin", () => {
  it("allows everything when no origins are listed", () => {
    expect(isAllowedOrigin("https://anything.example", [])).toBe(true);
    expect(isAllowedOrigin(undefined, [])).toBe(true);
  });

  it("allows only the listed origins", () => {
    expect(isAllowedOrigin("https://example.org", ["https://example.org"])).toBe(true);
    expect(isAllowedOrigin("https://evil.example", ["https://example.org"])).toBe(false);
    expect(isAllowedOrigin(undefined, ["https://example.org"])).toBe(false);
  });
});

describe("the WebSocket API", () => {
  const ORIGIN = "https://example.org";
  let backend: Backend | null = null;

  afterEach(async () => {
    await backend?.stop();
    backend = null;
  });

  /** Connects, sends the given messages after the greeting and collects the given number of answers. */
  const talk = (path: string, origin: string, answers: number, send: string[] = []) =>
    new Promise<unknown[]>((resolve, reject) => {
      const received: unknown[] = [];
      const socket = new WebSocket(`${backend!.url.replace("http", "ws")}${path}`, { origin });
      socket.on("error", reject);
      socket.on("message", (data) => {
        received.push(JSON.parse(String(data)));
        if (received.length === 1) send.forEach((message) => socket.send(message));
        if (received.length === answers) {
          socket.close();
          resolve(received);
        }
      });
    });

  it("answers the health check", async () => {
    backend = await startBackend();
    const response = await fetch(`${backend.url}/health`);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("greets a client and answers a ping", async () => {
    backend = await startBackend({ allowedOrigins: [ORIGIN] });
    expect(await talk(socketPath(), ORIGIN, 2, ['{"type":"ping"}'])).toEqual([
      { type: "hello", protocol: PROTOCOL_VERSION },
      { type: "pong" }
    ]);
  });

  it("refuses what is not a message of the API", async () => {
    backend = await startBackend();
    const messages = await talk(socketPath(), ORIGIN, 4, ["not json", "null", '{"type":"nonsense"}']);
    expect(messages.slice(1)).toEqual(Array(3).fill({ type: "error", code: "bad-message" }));
  });

  it("refuses the messages of the game from a client that is not in one", async () => {
    backend = await startBackend();
    const messages = await talk(socketPath(), ORIGIN, 3, [
      '{"type":"aim","angle":45}',
      '{"type":"say","text":"Hello"}'
    ]);
    expect(messages.slice(1)).toEqual([
      { type: "error", code: "not-allowed", re: "aim" },
      { type: "error", code: "not-allowed", re: "say" }
    ]);
  });

  it("creates a room for a screen and lets a controller join it", async () => {
    backend = await startBackend();
    const screen = await talk(socketPath(), ORIGIN, 4, ['{"type":"create","mode":"hotseat"}']);
    expect(screen.map((message) => (message as { type: string }).type)).toEqual(["hello", "created", "room", "token"]);

    // The screen has gone, but its room and the token are still there
    const { token } = screen[3] as { token: string };
    const controller = await talk(socketPath(), ORIGIN, 3, [JSON.stringify({ type: "join", token, name: "Ann" })]);
    expect(controller[1]).toMatchObject({ type: "joined", id: 0 });
    expect(controller[2]).toMatchObject({
      type: "room",
      state: { phase: "lobby", screen: false, players: [{ id: 0, name: "Ann", connected: true }] }
    });
  });

  it("drops the messages of a client that sends too many", async () => {
    backend = await startBackend();
    const pings = Array(MAX_MESSAGES_PER_SECOND + 20).fill('{"type":"ping"}');
    const messages = await talk(socketPath(), ORIGIN, MAX_MESSAGES_PER_SECOND + 2, pings);
    expect(messages.filter((message) => (message as { type: string }).type === "pong").length).toBeLessThanOrEqual(
      MAX_MESSAGES_PER_SECOND
    );
    expect(messages).toContainEqual({ type: "error", code: "rate-limited" });
  });

  it("does nothing a client of another version asks for, but tells its own version", async () => {
    backend = await startBackend();
    const create = '{"type":"create","mode":"hotseat"}';
    for (const path of ["/ws", "/ws?protocol=0", `/ws?protocol=${PROTOCOL_VERSION + 1}`, "/ws?protocol=x"]) {
      expect(await talk(path, ORIGIN, 3, [create, '{"type":"ping"}']), path).toEqual([
        { type: "hello", protocol: PROTOCOL_VERSION },
        { type: "error", code: "wrong-version", re: "create" },
        { type: "pong" }
      ]);
    }
  });

  it("refuses other origins and other paths", async () => {
    backend = await startBackend({ allowedOrigins: [ORIGIN] });
    await expect(talk(socketPath(), "https://evil.example", 1)).rejects.toThrow("403");
    await expect(talk("/other", ORIGIN, 1)).rejects.toThrow("403");
  });
});
