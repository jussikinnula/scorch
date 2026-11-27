import React, { useEffect, useState } from "react";

import { PublicRoom, TurnMode } from "../../shared/protocol";
import { describeSettings } from "../components/SettingsSummary";
import { Api, useApiMessages } from "../hooks/useApiConnection";
import { takeNotice } from "../notice";
import { toHash } from "../routes";

interface Props {
  api: Api;
}

/** How often the list of public games is asked for again while the lobby is shown, in milliseconds. */
const LIST_INTERVAL = 5000;

/** The lobby of the online games: the public games that wait for players, and the way to a new game. */
export default function Online({ api }: Props) {
  const [games, setGames] = useState<PublicRoom[]>([]);
  // What the page that sent the user here had to tell, e.g. that the game it showed has ended
  const [notice] = useState(takeNotice);
  /** Which of the public games are shown: those of one way of taking turns, or all. */
  const [turns, setTurns] = useState<TurnMode | null>(null);
  const shown = games.filter((game) => turns === null || game.settings.turns === turns);

  useApiMessages(api, (message) => {
    if (message.type === "rooms") setGames(message.rooms);
  });

  // The public games that can be joined, kept fresh while the page is shown
  useEffect(() => {
    if (!api.connected) return;
    api.send({ type: "list" });
    const timer = window.setInterval(() => api.send({ type: "list" }), LIST_INTERVAL);
    return () => window.clearInterval(timer);
  }, [api]);

  return (
    <section className="view lobby">
      <div className="lobby__top">
        <h2>Online games</h2>
        <a className="button button--primary" href={toHash({ view: "new" })}>
          Create a game
        </a>
      </div>
      {notice && (
        <p className="lobby__notice" role="status">
          {notice}
        </p>
      )}
      <div className="stepper" role="group" aria-label="Show games">
        <span>Show</span>
        {([null, "classic", "live"] as const).map((choice) => (
          <button
            key={choice ?? "all"}
            className={`button button--small${turns === choice ? " button--chosen" : ""}`}
            aria-pressed={turns === choice}
            onClick={() => setTurns(choice)}
          >
            {choice === null ? "All games" : choice === "classic" ? "Classic games" : "Live games"}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="note">
          {games.length === 0
            ? "There are no public games to join right now. Create one, and others can join it from here."
            : "There are no public games of this kind to join right now."}
        </p>
      ) : (
        <ul className="home__games">
          {shown.map((game) => (
            <li key={game.room}>
              <span>
                {game.host}
                <strong>
                  {game.players} of {game.settings.maxPlayers} players
                </strong>
                <small>
                  Starts in {Math.max(1, Math.ceil(game.startsIn / 60000))} min at the latest ·{" "}
                  {describeSettings(game.settings).join(" · ")}
                </small>
              </span>
              <a
                className="button button--small"
                aria-label={`Join the game of ${game.host}`}
                href={toHash({ view: "join", token: game.token })}
              >
                Join
              </a>
            </li>
          ))}
        </ul>
      )}
      {!api.connected && (
        <p className="note" role="status">
          Connecting to the server… If it has been asleep, waking it up can take a minute.
        </p>
      )}
      <p>
        <a href={toHash({ view: "home" })}>Back to the front page</a>
      </p>
    </section>
  );
}
