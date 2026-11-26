# SCORCH

An artillery game for people only, after the original Scorched Earth: played from a shared big screen with phones as controllers ("hotseat"), or over the network ("online").

There is no game yet. This is the skeleton: a frontend, a backend and the connection between them. The plan is in [docs/PLAN.md](docs/PLAN.md), and what the original game can do is in [docs/ORIGINAL.md](docs/ORIGINAL.md).

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

The frontend is a static site in GitHub Pages, which cannot serve the same page for every path. That is why the view is in the hash of the address (`client/routes.ts`): `#/screen/<room>`, `#/join/<token>` and `#/play/<room>`.

## Frontend and backend

The frontend and the backend are deployed separately: the frontend is a static site in GitHub Pages ([scorch.mobile](https://scorch.mobile)) and the backend is a web service in [Render.com](https://render.com). The frontend keeps a connection to the WebSocket API open, and the light in the top right corner tells whether there is one.

| Variable          | Used by  | Meaning                                                                                                                                                            |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `API_URL`         | frontend | The address of the backend, e.g. `https://scorch-api.onrender.com`. It is given when the frontend is built. The default is `http://localhost:4101` in development. |
| `BASE_HREF`       | frontend | The path the site is served at, `/` by default. The previews of pull requests set it.                                                                              |
| `COMMIT_SHA`      | frontend | The hash of the commit of the build, shown beside the light of the connection. It is given in the previews of pull requests.                                       |
| `PORT`            | backend  | The port of the server, `4101` by default. Render.com sets it.                                                                                                     |
| `ALLOWED_ORIGINS` | backend  | The addresses that are allowed to use the API, separated with commas. Everything is allowed if it is not set.                                                      |
| `SERVE_FRONTEND`  | backend  | `true` makes the backend also serve the built frontend from `dist`.                                                                                                |

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
3. In the settings of the GitHub repository (Pages), choose the branch `gh-pages` as the source, after the first deploy has created it.
4. Run the Deploy frontend workflow from the Actions tab (or push to `main`).

The frontend is deployed with the domain `scorch.mobile` (the `CNAME` file is written by the workflow). The same address is in `ALLOWED_ORIGINS` in `render.yaml`.
