import React, { FormEvent, useEffect, useRef, useState } from "react";

import { defaultSettings, MAX_NAME_LENGTH, PublicRoom, RoomSettings, TurnMode } from "../../shared/protocol";
import LobbySettings from "../components/LobbySettings";
import { describeSettings } from "../components/SettingsSummary";

import { Api, useApiMessages } from "../hooks/useApiConnection";
import { navigate, toHash } from "../routes";
import { loadLastHost, loadLastPlayer, loadName, saveHostKey, saveName, savePlayerKey } from "../session";

interface Props {
  api: Api;
}

/** How often the list of public games is asked for again while the front page is shown, in milliseconds. */
const LIST_INTERVAL = 5000;

/** The front page: starts a hotseat game on this screen, or an online game, or joins a public one. */
export default function Home({ api }: Props) {
  const [creating, setCreating] = useState(false);
  // The games this device can return to, e.g. after its page was closed by accident
  const [player] = useState(loadLastPlayer);
  const [host] = useState(loadLastHost);

  const [name, setName] = useState(loadName);
  const [open, setOpen] = useState(false);
  const [creatingOnline, setCreatingOnline] = useState(false);
  const [games, setGames] = useState<PublicRoom[]>([]);
  // The settings of the online game that is being set up: they are fixed when the game is created
  const [settings, setSettings] = useState<RoomSettings>(defaultSettings);
  const wanted = useRef(settings);
  const change = (changed: Partial<RoomSettings>) => {
    wanted.current = { ...wanted.current, ...changed };
    setSettings(wanted.current);
  };
  /** Which of the public games are shown: those of one way of taking turns, or all. */
  const [turns, setTurns] = useState<TurnMode | null>(null);
  const shown = games.filter((game) => turns === null || game.settings.turns === turns);
  const [problem, setProblem] = useState<string | null>(null);

  useApiMessages(api, (message) => {
    if (message.type === "created" && creating) {
      saveHostKey(message.room, message.hostKey);
      navigate({ view: "screen", room: message.room });
    } else if (message.type === "joined" && creatingOnline) {
      savePlayerKey(message.room, message.playerKey);
      saveName(name.trim());
      navigate({ view: "play", room: message.room });
    } else if (message.type === "rooms") setGames(message.rooms);
    else if (message.type === "error" && message.re === "create") {
      setCreating(false);
      setCreatingOnline(false);
      setProblem(
        message.code === "busy"
          ? "The server has as many games as it takes right now. Try again in a while."
          : "Starting a game did not work. Try again."
      );
    }
  });

  // The public games that can be joined, kept fresh while the page is shown
  useEffect(() => {
    if (!api.connected) return;
    api.send({ type: "list" });
    const timer = window.setInterval(() => api.send({ type: "list" }), LIST_INTERVAL);
    return () => window.clearInterval(timer);
  }, [api]);

  const createOnline = (event: FormEvent) => {
    event.preventDefault();
    setCreatingOnline(api.send({ type: "create", mode: "online", name: name.trim(), public: open, settings }));
  };

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
      {problem && (
        <p className="error" role="alert">
          {problem}
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

      <h2>Online</h2>
      <p>Everyone plays on a device of their own, which shows both the playing field and the controls.</p>
      <form className="home__online" onSubmit={createOnline}>
        <label htmlFor="online-name">Your name</label>
        <input
          id="online-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          autoCapitalize="words"
        />
        <div className="stepper" role="group" aria-label="Who can join">
          <span>Who can join</span>
          <button
            type="button"
            className={`button button--small${open ? "" : " button--chosen"}`}
            aria-pressed={!open}
            onClick={() => setOpen(false)}
          >
            Those with the link
          </button>
          <button
            type="button"
            className={`button button--small${open ? " button--chosen" : ""}`}
            aria-pressed={open}
            onClick={() => setOpen(true)}
          >
            Anyone
          </button>
        </div>
        <details className="home__settings">
          <summary>Settings: {describeSettings(settings).slice(0, 3).join(" · ")}</summary>
          <p className="note">
            The settings of an online game are chosen here and cannot be changed after the game has been created: the
            others choose the game by them.
          </p>
          <div className="screen__controls">
            <LobbySettings settings={settings} players={1} current={() => wanted.current} change={change} />
          </div>
        </details>
        <button className="button button--primary" disabled={!api.connected || creatingOnline || name.trim() === ""}>
          Start an online game
        </button>
      </form>

      <h3>Public games</h3>
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
            ? "There are no public games to join right now."
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
    </section>
  );
}
