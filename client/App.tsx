import React from "react";

import { useApiConnection } from "./hooks/useApiConnection";
import { useRoute } from "./hooks/useRoute";
import Home from "./views/Home";
import Placeholder from "./views/Placeholder";

interface Props {
  /** The address of the backend. The default is the one given in the build. */
  apiUrl?: string;
}

export default function App({ apiUrl = __API_URL__ }: Props) {
  const route = useRoute();
  const { connected } = useApiConnection(apiUrl);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">
          <a href="#/">Scorch</a>
        </h1>
        <div
          className="connection"
          role="status"
          aria-label={connected ? "Connected to the server" : "No connection to the server"}
        >
          {__COMMIT__ && <span>{__COMMIT__}</span>}
          <span className={`connection__light${connected ? " connection__light--on" : ""}`} />
        </div>
      </header>
      <main>
        {route.view === "home" && <Home />}
        {route.view === "screen" && <Placeholder title="Game screen" id={route.room} />}
        {route.view === "join" && <Placeholder title="Controller" id={route.token} />}
        {route.view === "play" && <Placeholder title="Online game" id={route.room} />}
      </main>
    </div>
  );
}
