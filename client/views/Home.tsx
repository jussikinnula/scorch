import React, { useState } from "react";

import { Api, useApiMessages } from "../hooks/useApiConnection";
import { navigate, toHash } from "../routes";
import { loadLastHost, loadLastPlayer, saveHostKey } from "../session";

interface Props {
  api: Api;
}

/** The front page: the name of the game and the two ways to play it. */
export default function Home({ api }: Props) {
  const [creating, setCreating] = useState(false);
  // The games this device can return to, e.g. after its page was closed by accident
  const [player] = useState(loadLastPlayer);
  const [host] = useState(loadLastHost);
  const [problem, setProblem] = useState<string | null>(null);

  useApiMessages(api, (message) => {
    if (message.type === "created" && creating) {
      saveHostKey(message.room, message.hostKey);
      navigate({ view: "screen", room: message.room });
    } else if (message.type === "error" && message.re === "create") {
      setCreating(false);
      setProblem(
        message.code === "busy"
          ? "The server has as many games as it takes right now. Try again in a while."
          : "Starting a game did not work. Try again."
      );
    }
  });

  const create = () => setCreating(api.send({ type: "create", mode: "hotseat" }));

  return (
    <section className="view home">
      <p className="home__title">Scorch</p>
      {(player || host) && (
        <p className="home__return">
          {player && (
            <a className="button" href={toHash({ view: "controller", room: player.room })}>
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
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="home__ways">
        <div className="home__way">
          <button className="button button--primary" onClick={create} disabled={!api.connected || creating}>
            Start a hotseat game
          </button>
          <p>One big screen for everyone, with phones as the controllers.</p>
        </div>
        <div className="home__way">
          <a className="button button--primary" href={toHash({ view: "online" })}>
            Play online
          </a>
          <p>Everyone on a device of their own.</p>
        </div>
      </div>
      {!api.connected && (
        <p className="note" role="status">
          Connecting to the server… If it has been asleep, waking it up can take a minute.
        </p>
      )}
    </section>
  );
}
