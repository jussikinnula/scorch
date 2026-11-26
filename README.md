# SCORCH

An artillery game for people only, after the original Scorched Earth: played from a shared big screen with phones as controllers ("hotseat"), or over the network ("online").

There is no game yet. What works: a screen creates a hotseat room, phones join it by scanning a QR code, and when the game is started the screen shows a terrain with a tank for each player, whose turret and power the player sets on the phone. A player can fire: the shot flies, explodes, leaves a crater and damages the tanks near it. When one tank is left the round ends and a new one starts. A player can also write a short text, which is shown in a speech bubble above the tank. The plan is in [docs/PLAN.md](docs/PLAN.md), the messages between the frontend and the backend are in [docs/PROTOCOL.md](docs/PROTOCOL.md), and what the original game can do is in [docs/ORIGINAL.md](docs/ORIGINAL.md).

## Usage

- `npm run dev` = starts the backend and the Vite development server (frontend) -> [http://localhost:4100](http://localhost:4100) (frontend) & [http://localhost:4101](http://localhost:4101) (backend)
- `npm run dev:client` = starts the Vite development server (frontend). It reads `.env`, if there is one (see `.env.example`)
- `npm run dev:server` = starts the development server (backend)
- `npm run start` = starts the backend
- `npm run start:app` = frontend production build + starts the backend so that it also serves the frontend -> [http://localhost:4101](http://localhost:4101)
- `npm run build` = build (frontend, production build)
- `npm run typecheck` = type check (frontend and backend)
- `npm run lint` / `npm run lint:fix` = lint (ESLint)
- `npm run format` / `npm run format:fix` = check format (Prettier)
- `npm run test` / `npm run test:watch` = run tests (Vitest)

## Structure

| Folder   | What                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- |
| `client` | The frontend: React, built with Vite into a static site                                           |
| `server` | The backend: Express and a WebSocket API (`ws`) at `/ws`, a health check at `/health`             |
| `shared` | What both use: the messages of the WebSocket API, the data of the game and, later, the simulation |
| `test`   | Helpers of the tests, e.g. `startBackend`, which runs the real backend for a test                 |
| `docs`   | The plan and the notes about the original game                                                    |
| `tools`  | Scripts that are not part of the game: measuring the original game                                |

The frontend is a static site in GitHub Pages, which cannot serve the same page for every path. That is why the view is in the hash of the address (`client/routes.ts`): `#/screen/<room>`, `#/join/<token>`, `#/controller/<room>` and `#/play/<room>`.

## Trying it with phones

A hotseat game needs a screen and phones that reach the same frontend and backend.

- With `npm run dev`, open the frontend on the computer by its address in the local network, e.g. `http://192.168.1.20:4100`, not `localhost`: the QR code has the address the page was opened with. In development the frontend uses the backend on the same machine (port 4101), so the phones find it too.
- In the player testing mode (`PLAYER_TESTING_MODE`, on by default in development) there is a button "Open a test phone" under the QR code. It opens the address of the QR code in a bare window the size of a phone. Each such window is a player of its own, so a game with many players can be tried in one browser, together with real phones.
- Phones allow some features (keeping the screen awake, vibration) only on HTTPS pages. For those, use a tunnel such as ngrok, or a preview of a pull request.
- The previews of pull requests use the production backend. A change in the protocol works in a preview only after the backend has been deployed from `main`.

## Frontend and backend

The frontend and the backend are deployed separately: the frontend is a static site in GitHub Pages ([scorch.mobile](https://scorch.mobile)) and the backend is a web service in [Render.com](https://render.com). The frontend keeps a connection to the WebSocket API open, and the light in the top right corner tells whether there is one.

| Variable              | Used by  | Meaning                                                                                                                                                                                                          |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_URL`             | frontend | The address of the backend, e.g. `https://api.scorch.mobile`. It is given when the frontend is built. Without it the frontend uses, in development, port 4101 of the machine the page came from.                 |
| `PLAYER_TESTING_MODE` | frontend | `true` puts the button "Open a test phone" under the QR code of a hotseat game, `false` leaves it out. It is given when the frontend is built. Without it the button is there in development and not in a build. |
| `BASE_HREF`           | frontend | The path the site is served at, `/` by default. The previews of pull requests set it.                                                                                                                            |
| `COMMIT_SHA`          | frontend | The hash of the commit of the build, shown beside the light of the connection. It is given in the previews of pull requests.                                                                                     |
| `PORT`                | backend  | The port of the server, `4101` by default. Render.com sets it.                                                                                                                                                   |
| `ALLOWED_ORIGINS`     | backend  | The addresses that are allowed to use the API, separated with commas. Everything is allowed if it is not set.                                                                                                    |
| `SERVE_FRONTEND`      | backend  | `true` makes the backend also serve the built frontend from `dist`.                                                                                                                                              |

### Deploys

- `.github/workflows/ci.yml` runs lint, format, typecheck and the tests.
- `.github/workflows/deploy-frontend.yml` builds the frontend and deploys it to GitHub Pages (the branch `gh-pages`): production from `main` and a preview for each pull request.
- `.github/workflows/deploy-api.yml` deploys the backend to Render.com from `main`, when the backend has changed (`server`, `shared`, the dependencies, `render.yaml` or the workflow itself).

To set them up:

1. In Render.com, create a new Blueprint from this repository (`render.yaml`). It creates the web service `scorch-api`, with automatic deploys off.
2. In the settings of the GitHub repository (Secrets and variables -> Actions), add
   - the secret `RENDER_API_KEY`: an API key from the account settings of Render.com
   - the variable `RENDER_SERVICE_ID`: the id of the service (`srv-...`)
   - the variable `API_URL`: the address of the service, e.g. `https://scorch-api.onrender.com`
   - the variable `PLAYER_TESTING_MODE`: `true` to have the test phones in production
3. In the settings of the GitHub repository (Pages), choose the branch `gh-pages` as the source, after the first deploy has created it.
4. Run the Deploy frontend workflow from the Actions tab (or push to `main`).

The frontend is deployed with the domain `scorch.mobile` (the `CNAME` file is written by the workflow). The same address is in `ALLOWED_ORIGINS` in `render.yaml`.
