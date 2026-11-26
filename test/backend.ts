import { AddressInfo } from "node:net";

import WebSocket from "ws";

import { AppOptions, createApp } from "../server/app";
import { ClientMessage, ServerMessage, socketPath } from "../shared/protocol";

export interface Backend {
  /** The address of the backend, as it is given to the frontend in API_URL. */
  url: string;
  port: number;
  /** How many clients are connected to the WebSocket API. */
  connections: () => number;
  /** Stops the backend and cuts the connections to it, like a server that goes down. */
  stop: () => Promise<void>;
}

/**
 * Starts the real backend for a test, on a free port of this machine unless a port is given.
 * The tests of the frontend use it instead of a mock, so that they also test that the two fit together.
 */
export async function startBackend(options: AppOptions & { port?: number } = {}): Promise<Backend> {
  const { port = 0, ...appOptions } = options;
  const { server, sockets } = createApp(appOptions);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const listening = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${listening}`,
    port: listening,
    connections: () => sockets.clients.size,
    stop: () =>
      new Promise<void>((resolve) => {
        sockets.clients.forEach((client) => client.terminate());
        server.close(() => resolve());
        server.closeAllConnections();
      })
  };
}

/**
 * The WebSocket of a browser for the tests that connect to the real backend. The one of the test
 * environment (jsdom) does not work under Vitest, so this is the one of the ws library, which has the
 * same interface. Like a browser, it tells the backend the address of the page as the origin.
 */
export class BrowserWebSocket extends WebSocket {
  constructor(url: string | URL) {
    super(url, { origin: window.location.origin });
  }
}

export interface TestClient {
  /** The messages the backend has sent to the client, the greeting excluded. */
  messages: ServerMessage[];
  send: (message: ClientMessage) => void;
  /** The next message of a type that the client has not been asked for yet. Waits for it if needed. */
  next: <Type extends ServerMessage["type"]>(type: Type) => Promise<Extract<ServerMessage, { type: Type }>>;
  close: () => void;
}

/**
 * A bare client of the WebSocket API. A test of the frontend uses it as the other end: as the screen
 * of a room when the frontend is a controller, and the other way round.
 */
export function openClient(backend: Backend, origin = "http://localhost"): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${backend.url.replace("http", "ws")}${socketPath()}`, { origin });
    const taken = new Set<ServerMessage>();
    let wake: (() => void)[] = [];

    const client: TestClient = {
      messages: [],
      send: (message) => socket.send(JSON.stringify(message)),
      next: async (type) => {
        for (;;) {
          const message = client.messages.find((candidate) => candidate.type === type && !taken.has(candidate));
          if (message) {
            taken.add(message);
            return message as never;
          }
          await new Promise<void>((resume) => wake.push(resume));
        }
      },
      close: () => socket.close()
    };
    socket.on("error", reject);
    socket.on("message", (data) => {
      const message: ServerMessage = JSON.parse(String(data));
      if (message.type === "hello") {
        resolve(client);
        return;
      }
      client.messages.push(message);
      const waiting = wake;
      wake = [];
      waiting.forEach((resume) => resume());
    });
  });
}

/** A bare client that is the screen of a new room. */
export async function openScreen(backend: Backend) {
  const screen = await openClient(backend);
  screen.send({ type: "create", mode: "hotseat" });
  const { room } = await screen.next("created");
  return { screen, room };
}

/** A bare client that joins a room as a controller, with the token a screen got. */
export async function openController(backend: Backend, token: string, name: string) {
  const controller = await openClient(backend);
  controller.send({ type: "join", token, name });
  await controller.next("joined");
  return controller;
}
