import React from "react";

import { useApiConnection } from "./hooks/useApiConnection";
import { useRoute } from "./hooks/useRoute";
import Controller from "./views/Controller";
import Home from "./views/Home";
import Join from "./views/Join";
import Play from "./views/Play";
import Screen from "./views/Screen";

interface Props {
  /** The address of the backend. The default is the one given in the build. */
  apiUrl?: string;
  /** Whether the screen of a hotseat game has the button that opens test phones. The default is that of the build. */
  playerTesting?: boolean;
}

/**
 * The address of the backend when the build was not given one: in development the backend on the
 * machine the page came from, so that a phone in the same network finds it too.
 */
function defaultApiUrl() {
  if (__API_URL__) return __API_URL__;
  return import.meta.env.DEV ? `http://${window.location.hostname}:4101` : "";
}

export default function App({ apiUrl = defaultApiUrl(), playerTesting = __PLAYER_TESTING_MODE__ }: Props) {
  const route = useRoute();
  const api = useApiConnection(apiUrl);

  return (
    <div className={`app app--${route.view}`}>
      <header className="app__header">
        <h1 className="app__title">
          <a href="#/">Scorch</a>
        </h1>
        <div
          className="connection"
          role="status"
          aria-label={api.connected ? "Connected to the server" : "No connection to the server"}
        >
          {__COMMIT__ && <span>{__COMMIT__}</span>}
          <span className={`connection__light${api.connected ? " connection__light--on" : ""}`} />
        </div>
      </header>
      {api.mismatch === "backend-older" && (
        <p className="app__mismatch" role="alert">
          The server is being updated. The game continues by itself in a moment.
        </p>
      )}
      {api.mismatch === "backend-newer" && (
        <p className="app__mismatch" role="alert">
          The game has been updated. Reload the page to continue.{" "}
          <button className="button button--small" onClick={() => window.location.reload()}>
            Reload
          </button>
        </p>
      )}
      <main>
        {route.view === "home" && <Home api={api} />}
        {route.view === "screen" && (
          <Screen key={route.room} api={api} room={route.room} playerTesting={playerTesting} />
        )}
        {route.view === "join" && <Join key={route.token} api={api} token={route.token} />}
        {route.view === "controller" && <Controller key={route.room} api={api} room={route.room} />}
        {route.view === "play" && <Play key={route.room} api={api} room={route.room} />}
      </main>
    </div>
  );
}
