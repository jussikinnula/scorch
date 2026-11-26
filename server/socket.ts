import { IncomingMessage, Server } from "http";
import { WebSocket, WebSocketServer } from "ws";

import { isClientMessage, PROTOCOL_VERSION, ServerMessage, SOCKET_PATH } from "../shared/protocol";

/** The largest message a client can send, in bytes. The messages of the API are small. */
export const MAX_MESSAGE_SIZE = 1024;
/** How often it is checked that the clients are still there, in milliseconds. */
export const HEARTBEAT_INTERVAL = 30000;

export interface SocketOptions {
  /** The origins that may connect, e.g. https://scorch.mobile. Any origin may connect if none are given. */
  allowedOrigins?: string[];
  heartbeatInterval?: number;
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
 * The WebSocket API. The messages are described in shared/protocol.ts.
 *
 * For now the server only greets a new client with "hello" and answers a "ping" with a "pong".
 * The rooms and the game come on top of this.
 */
export function createSocketServer(server: Server, options: SocketOptions = {}) {
  const { allowedOrigins = [], heartbeatInterval = HEARTBEAT_INTERVAL } = options;
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_SIZE });
  const alive = new WeakSet<WebSocket>();
  const send = (client: WebSocket, message: ServerMessage) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  };

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    if (pathname !== SOCKET_PATH || !isAllowedOrigin(request.headers.origin, allowedOrigins)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request));
  });

  sockets.on("connection", (client: WebSocket) => {
    alive.add(client);
    client.on("pong", () => alive.add(client));
    client.on("error", () => client.terminate());
    client.on("message", (data) => {
      let message: unknown;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!isClientMessage(message)) return;

      if (message.type === "ping") send(client, { type: "pong" });
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

  sockets.on("close", () => clearInterval(heartbeat));
  server.on("close", () => sockets.close());

  return sockets;
}
