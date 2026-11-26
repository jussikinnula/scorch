import React, { useState } from "react";

import { Api, useApiMessages } from "../hooks/useApiConnection";
import { navigate, toHash } from "../routes";
import { loadLastHost, loadLastPlayer, saveHostKey } from "../session";

interface Props {
  api: Api;
}

/** The front page: starts a hotseat game on this screen. */
export default function Home({ api }: Props) {
  const [creating, setCreating] = useState(false);
  // The games this device can return to, e.g. after its page was closed by accident
  const [player] = useState(loadLastPlayer);
  const [host] = useState(loadLastHost);

  useApiMessages(api, (message) => {
    if (message.type === "created" && creating) {
      saveHostKey(message.room, message.hostKey);
      navigate({ view: "screen", room: message.room });
    }
  });

  const create = () => setCreating(api.send({ type: "create", mode: "hotseat" }));

  return (
    <section className="view home">
      {(player || host) && (
        <p className="home__return">
          {player && (
            <a className="button button--primary" href={toHash({ view: "controller", room: player.room })}>
              Return to your game
            </a>
          )}
          {host && (
            <a className="button" href={toHash({ view: "screen", room: host.room })}>
              Return to the game on this screen
            </a>
          )}
        </p>
      )}
      <h2>Hotseat</h2>
      <p>
        Play on this screen, with phones as the controllers. Open this page on a TV or a laptop that everyone can see,
        and start a game: the players join by scanning a QR code.
      </p>
      <button className="button button--primary" onClick={create} disabled={!api.connected || creating}>
        Start a hotseat game
      </button>
      {!api.connected && (
        <p className="note" role="status">
          Connecting to the server… If it has been asleep, waking it up can take a minute.
        </p>
      )}
    </section>
  );
}
