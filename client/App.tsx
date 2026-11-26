import React, { useState } from "react";

import { PROTOCOL_VERSION } from "../shared/protocol";

import { useApiConnection, useApiMessages } from "./hooks/useApiConnection";
import { useRoute } from "./hooks/useRoute";
import Controller from "./views/Controller";
import Home from "./views/Home";
import Join from "./views/Join";
import Placeholder from "./views/Placeholder";
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
  // The frontend and the backend are deployed separately, so for a moment one can be newer than the other
  const [mismatch, setMismatch] = useState(false);
  useApiMessages(api, (message) => {
    if (message.type === "hello") setMismatch(message.protocol !== PROTOCOL_VERSION);
  });

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
      {mismatch && (
        <p className="app__mismatch" role="alert">
          The game is being updated. Reload the page in a moment.{" "}
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
        {route.view === "play" && <Placeholder title="Online game" id={route.room} />}
      </main>
    </div>
  );
}
