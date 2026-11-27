import path from "path";

import { SOCKET_PATH } from "../shared/protocol";
import { createApp } from "./app";
import { parseOrigins } from "./socket";

const port = process.env.PORT || 4101;
// The frontend is deployed separately. The server can still serve a build of it, e.g. to try the whole app locally.
const frontend = process.env.SERVE_FRONTEND === "true" ? path.resolve("./dist") : undefined;

/** A whole number of an environment variable, or nothing when it is not set or not a number of at least one. */
const limit = (name: string) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 1 ? value : undefined;
};

export const { server } = createApp({
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  // Behind the proxy of a host like Render, the address of a client is in a header the proxy writes
  trustProxy: process.env.TRUST_PROXY === "true",
  // The limits of the server have defaults (see rooms.ts and socket.ts), which the environment can change
  maxConnectionsPerAddress: limit("MAX_CONNECTIONS_PER_ADDRESS"),
  rooms: {
    maxRooms: limit("MAX_ROOMS"),
    maxOnlineRooms: limit("MAX_ONLINE_ROOMS"),
    maxRoomsPerAddress: limit("MAX_ROOMS_PER_ADDRESS"),
    maxOnlineRoomsPerAddress: limit("MAX_ONLINE_ROOMS_PER_ADDRESS"),
    // In seconds
    lobbyTime: limit("ONLINE_LOBBY_TIME") && limit("ONLINE_LOBBY_TIME")! * 1000
  },
  frontend
});

// Start listening
server.listen(port, () => {
  console.info(`[server] Server is running at http://localhost:${port}`);
  console.info(`[server] WebSocket API is at ws://localhost:${port}${SOCKET_PATH}`);
  if (frontend) console.info(`[server] Serving the frontend from ${frontend}`);
});
