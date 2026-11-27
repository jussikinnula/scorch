import React, { FormEvent, useRef, useState } from "react";

import { defaultSettings, MAX_NAME_LENGTH, RoomSettings } from "../../shared/protocol";
import LobbySettings from "../components/LobbySettings";
import { Api, useApiMessages } from "../hooks/useApiConnection";
import { navigate, toHash } from "../routes";
import { loadName, saveName, savePlayerKey } from "../session";

interface Props {
  api: Api;
}

/** Setting up a new online game: who starts it, who can join it, and its settings. */
export default function NewGame({ api }: Props) {
  const [name, setName] = useState(loadName);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // The settings of the game that is being set up: they are fixed when the game is created
  const [settings, setSettings] = useState<RoomSettings>(defaultSettings);
  const wanted = useRef(settings);
  const change = (changed: Partial<RoomSettings>) => {
    wanted.current = { ...wanted.current, ...changed };
    setSettings(wanted.current);
  };
  const [problem, setProblem] = useState<string | null>(null);

  useApiMessages(api, (message) => {
    if (message.type === "joined" && creating) {
      savePlayerKey(message.room, message.playerKey);
      saveName(name.trim());
      navigate({ view: "play", room: message.room });
    } else if (message.type === "error" && message.re === "create") {
      setCreating(false);
      setProblem(
        message.code === "busy"
          ? "The server has as many games as it takes right now. Try again in a while."
          : "Starting a game did not work. Try again."
      );
    }
  });

  const create = (event: FormEvent) => {
    event.preventDefault();
    setCreating(api.send({ type: "create", mode: "online", name: name.trim(), public: open, settings }));
  };

  return (
    <section className="view lobby">
      <h2>New online game</h2>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <form className="home__online" onSubmit={create}>
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
        <div className="screen__controls">
          <LobbySettings settings={settings} players={1} current={() => wanted.current} change={change} />
        </div>
        <p className="note">
          The settings cannot be changed after the game has been created: the others choose it by them.
        </p>
        <button className="button button--primary" disabled={!api.connected || creating || name.trim() === ""}>
          Start an online game
        </button>
      </form>
      <p>
        <a href={toHash({ view: "online" })}>Back to the games</a>
      </p>
    </section>
  );
}
