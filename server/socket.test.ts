// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { PROTOCOL_VERSION } from "../shared/protocol";
import { Backend, startBackend } from "../test/backend";
import { isAllowedOrigin, parseOrigins } from "./socket";

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
    expect(await talk("/ws", ORIGIN, 2, ['{"type":"ping"}'])).toEqual([
      { type: "hello", protocol: PROTOCOL_VERSION },
      { type: "pong" }
    ]);
  });

  it("ignores what is not a message of the API", async () => {
    backend = await startBackend();
    const messages = await talk("/ws", ORIGIN, 2, ["not json", "null", '{"type":"nonsense"}', '{"type":"ping"}']);
    expect(messages[1]).toEqual({ type: "pong" });
  });

  it("refuses other origins and other paths", async () => {
    backend = await startBackend({ allowedOrigins: [ORIGIN] });
    await expect(talk("/ws", "https://evil.example", 1)).rejects.toThrow("403");
    await expect(talk("/other", ORIGIN, 1)).rejects.toThrow("403");
  });
});
