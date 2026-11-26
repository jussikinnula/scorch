/**
 * The WebSocket API between the clients (the big screen, the controllers, the online players) and
 * the server. The messages are JSON objects with a type. This file is the single place where they
 * are described: both the server and the frontend import it.
 *
 * For now there is only the greeting and the ping. The messages of the rooms and of the game come
 * with the phases of docs/PLAN.md.
 */

/** The path of the WebSocket API on the server. */
export const SOCKET_PATH = "/ws";

/** The version of the API. A frontend that is older than the server can tell the user to reload. */
export const PROTOCOL_VERSION = 0;

/** What a client sends to the server. */
export type ClientMessage = { type: "ping" };

/** What the server sends to a client. */
export type ServerMessage = { type: "hello"; protocol: number } | { type: "pong" };

/** Whether something received from a client is a message of the API. Nothing a client sends is trusted. */
export function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== "object" || value === null) return false;
  const { type } = value as { type?: unknown };
  return type === "ping";
}
