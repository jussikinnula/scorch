import path from "path";

import { SOCKET_PATH } from "../shared/protocol";
import { createApp } from "./app";
import { parseOrigins } from "./socket";

const port = process.env.PORT || 4101;
// The frontend is deployed separately. The server can still serve a build of it, e.g. to try the whole app locally.
const frontend = process.env.SERVE_FRONTEND === "true" ? path.resolve("./dist") : undefined;

export const { server } = createApp({ allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS), frontend });

// Start listening
server.listen(port, () => {
  console.info(`[server] Server is running at http://localhost:${port}`);
  console.info(`[server] WebSocket API is at ws://localhost:${port}${SOCKET_PATH}`);
  if (frontend) console.info(`[server] Serving the frontend from ${frontend}`);
});
