import { IncomingMessage, Server } from "http";
import { WebSocket, WebSocketServer } from "ws";

import { isClientMessage, PROTOCOL_PARAMETER, PROTOCOL_VERSION, ServerMessage, SOCKET_PATH } from "../shared/protocol";
import Rooms, { RoomsOptions } from "./rooms";

/** The largest message a client can send, in bytes. The messages of the API are small. */
export const MAX_MESSAGE_SIZE = 1024;
/** How often it is checked that the clients are still there, in milliseconds. */
export const HEARTBEAT_INTERVAL = 30000;
/** How many messages a client can send in a second. The rest are dropped. */
export const MAX_MESSAGES_PER_SECOND = 40;

/**
 * How many connections one address can have at a time. A whole hotseat game is behind one address
 * (a screen and ten phones), and so are the pages its players have left open, so this is generous.
 */
export const MAX_CONNECTIONS_PER_ADDRESS = 60;

export interface SocketOptions {
  /** The origins that may connect, e.g. https://scorch.mobile. Any origin may connect if none are given. */
  allowedOrigins?: string[];
  heartbeatInterval?: number;
  /**
   * Whether the server is behind a proxy that tells the address of the client in the header
   * X-Forwarded-For, as it is in Render. Without it the header is not believed: anyone could write it.
   */
  trustProxy?: boolean;
  maxConnectionsPerAddress?: number;
  /** The timing and the limits of the rooms, see Rooms. */
  rooms?: RoomsOptions<WebSocket>;
}

/** The origins of a comma separated list, e.g. of the environment variable ALLOWED_ORIGINS. */
export function parseOrigins(list: string | undefined) {
  return (list ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]) {
  return allowedOrigins.length === 0 || (origin !== undefined && allowedOrigins.includes(origin));
}

/**
 * The address a client connected from. Behind a trusted proxy it is the first address of the header
 * X-Forwarded-For, which is the client as the outermost proxy saw it.
 *
 * A client can write that header itself, and whether a proxy overwrites what it wrote depends on
 * the proxy. So the limits by address stop accidents and casual misuse, not someone determined: one
 * who makes up addresses gets past them, but cannot use up the allowance of anyone else's real address.
 */
export function addressOf(request: IncomingMessage, trustProxy: boolean) {
  const forwarded = trustProxy ? String(request.headers["x-forwarded-for"] ?? "") : "";
  const first = forwarded.split(",")[0].trim();
  return first || request.socket.remoteAddress || "unknown";
}

/**
 * The WebSocket API. The messages are described in shared/protocol.ts and docs/PROTOCOL.md.
 *
 * The server greets a new client with "hello" and answers a "ping" with a "pong". The messages
 * about the rooms are handled by Rooms. What is refused is answered with an "error". A client that
 * speaks another version of the API than the server gets only the greeting and the pongs.
 */
export function createSocketServer(server: Server, options: SocketOptions = {}) {
  const {
    allowedOrigins = [],
    heartbeatInterval = HEARTBEAT_INTERVAL,
    trustProxy = false,
    maxConnectionsPerAddress = MAX_CONNECTIONS_PER_ADDRESS
  } = options;
  /** The address of each client, and how many clients each address has. */
  const addresses = new WeakMap<WebSocket, string>();
  const connections = new Map<string, number>();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_SIZE });
  const alive = new WeakSet<WebSocket>();
  const send = (client: WebSocket, message: ServerMessage) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  };
  const rooms = new Rooms<WebSocket>(send, (client) => client.close(), {
    addressOf: (client) => addresses.get(client),
    ...options.rooms
  });
  /** When a client started its current second of sending, and how many messages it has sent in it. */
  const rates = new WeakMap<WebSocket, { start: number; count: number }>();

  /** Whether a client has sent too many messages within a second. It is told so once. */
  const isFlooding = (client: WebSocket) => {
    const now = Date.now();
    let rate = rates.get(client);
    if (!rate || now - rate.start >= 1000) {
      rate = { start: now, count: 0 };
      rates.set(client, rate);
    }
    rate.count += 1;
    if (rate.count === MAX_MESSAGES_PER_SECOND + 1) send(client, { type: "error", code: "rate-limited" });
    return rate.count > MAX_MESSAGES_PER_SECOND;
  };

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    if (pathname !== SOCKET_PATH || !isAllowedOrigin(request.headers.origin, allowedOrigins)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if ((connections.get(addressOf(request, trustProxy)) ?? 0) >= maxConnectionsPerAddress) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request));
  });

  sockets.on("connection", (client: WebSocket, request: IncomingMessage) => {
    // A client tells the version of the API it speaks in the address. One that speaks another version
    // than the server, or does not tell, is greeted, so that it learns the version of the server,
    // but nothing it asks for is done.
    const { searchParams } = new URL(request.url ?? "/", "http://localhost");
    const sameVersion = searchParams.get(PROTOCOL_PARAMETER) === String(PROTOCOL_VERSION);

    const address = addressOf(request, trustProxy);
    addresses.set(client, address);
    connections.set(address, (connections.get(address) ?? 0) + 1);

    alive.add(client);
    client.on("pong", () => alive.add(client));
    client.on("error", () => client.terminate());
    client.on("close", () => {
      const left = (connections.get(address) ?? 1) - 1;
      if (left > 0) connections.set(address, left);
      else connections.delete(address);
      rooms.disconnect(client);
    });
    client.on("message", (data) => {
      if (isFlooding(client)) return;

      let message: unknown;
      try {
        message = JSON.parse(String(data));
      } catch {
        message = undefined;
      }
      if (!isClientMessage(message)) {
        send(client, { type: "error", code: "bad-message" });
        return;
      }

      if (message.type === "ping") send(client, { type: "pong" });
      else if (!sameVersion) send(client, { type: "error", code: "wrong-version", re: message.type });
      // The game is not made yet: what the rooms do not handle is refused
      else if (!rooms.handle(client, message)) send(client, { type: "error", code: "not-allowed", re: message.type });
    });
    send(client, { type: "hello", protocol: PROTOCOL_VERSION });
  });

  // A client that has gone without closing the connection is noticed when it does not answer a ping
  const heartbeat = setInterval(() => {
    sockets.clients.forEach((client) => {
      if (!alive.has(client)) {
        client.terminate();
        return;
      }
      alive.delete(client);
      client.ping();
    });
  }, heartbeatInterval);

  sockets.on("close", () => {
    clearInterval(heartbeat);
    rooms.shutdown();
  });
  server.on("close", () => sockets.close());

  return sockets;
}
