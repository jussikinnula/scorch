import { AddressInfo } from "node:net";

import WebSocket from "ws";

import { AppOptions, createApp } from "../server/app";

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
