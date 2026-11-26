import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

process.env.BASE_HREF ??= "/";
if (!process.env.BASE_HREF.endsWith("/")) {
  process.env.BASE_HREF += "/";
}

// https://vitejs.dev/config/
export default ({ mode }: { mode: string }) =>
  defineConfig({
    root: "client",
    base: process.env.BASE_HREF,
    plugins: [react({})],
    define: {
      // The address of the backend, e.g. https://scorch-api.onrender.com. In development the backend is the local one.
      __API_URL__: JSON.stringify(process.env.API_URL ?? (mode === "development" ? "http://localhost:4101" : "")),
      // The start of the hash of the commit the build was made of. It is given in the previews of pull requests.
      __COMMIT__: JSON.stringify((process.env.COMMIT_SHA ?? "").slice(0, 6))
    },
    build: {
      outDir: "../dist",
      emptyOutDir: true
    },
    server: {
      // The phones that are used as controllers must reach the development server
      host: true,
      port: 4100,
      strictPort: true,
      // ngrok sends its own Host header; Vite blocks unknown hosts by default.
      allowedHosts: [".ngrok-free.app", ".ngrok-free.dev", ".ngrok.app", ".ngrok.io"]
    },
    test: {
      globals: true,
      environment: "jsdom",
      // The root is the frontend; the tests of the backend and of the shared code are next to it
      include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)", "../server/**/*.test.ts", "../shared/**/*.test.ts"],
      setupFiles: fileURLToPath(new URL("./test/setup.ts", import.meta.url)),
      css: false
    }
  });
