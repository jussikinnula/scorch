import React, { useState } from "react";

import { MIN_PLAYERS } from "../../shared/protocol";
import Field from "../components/Field";
import SettingsSummary from "../components/SettingsSummary";
import { Api, useApiMessages } from "../hooks/useApiConnection";
import { useCountdown } from "../hooks/useCountdown";
import { useFieldView } from "../hooks/useFieldView";
import { toUrl } from "../routes";
import Controller from "./Controller";

interface Props {
  api: Api;
  room: string;
}

/**
 * A player of an online game: the playing field and the controls of the tank on the same page. The
 * controls and everything else a player has are those of a controller of a hotseat game; around
 * them are the field, the link to the game and its settings, which were chosen when the game was
 * created and cannot be changed, and for the host the button that starts the game.
 */
export default function Play({ api, room }: Props) {
  const { state, field, bubbles, action, flying } = useFieldView(api, room);
  const [self, setSelf] = useState<number | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The aim of this player as the controls have it: its own turret follows them at once, on anyone's turn.
  // The server does not send a player its own aim back.
  const [aim, setAim] = useState<{ angle: number; power: number } | null>(null);
  const shown =
    field && aim && self !== null
      ? {
          ...field,
          tanks: field.tanks.map((tank) => (tank.id === self && tank.energy > 0 ? { ...tank, ...aim } : tank))
        }
      : field;

  useApiMessages(api, (message) => {
    if (message.type === "joined" && message.room === room) setSelf(message.id);
    else if (message.type === "token") setToken(message.token);
  });

  // How long the lobby is still open, in seconds
  const startsIn = useCountdown(state?.startsIn ?? null, state);
  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const host = state !== null && self !== null && state.host === self;
  const link = token && toUrl({ view: "join", token });
  const copy = () => {
    if (!link) return;
    void navigator.clipboard?.writeText(link).then(() => setCopied(true));
  };

  return (
    <div className={`play${state?.phase === "playing" ? " play--playing" : ""}`}>
      <div className="play__side">
        <Controller
          api={api}
          room={room}
          online
          onAim={setAim}
          field={
            state?.phase === "playing" && shown ? (
              <div className="play__field">
                <Field
                  boxed
                  field={shown}
                  players={state.players}
                  bubbles={bubbles}
                  action={action}
                  turn={state.turn?.player}
                />
                {/* The canvas is a picture: this tells the same to those who cannot see it */}
                <p className="visually-hidden" role="status">
                  Projectiles in the air: {flying}
                </p>
              </div>
            ) : null
          }
        />
        {state?.phase === "lobby" && (
          <section className="view play__lobby">
            {link && (
              <div className="play__link">
                <label htmlFor="link">{state.public ? "The link to this game" : "Invite players with this link"}</label>
                <div>
                  <input id="link" readOnly value={link} onFocus={(event) => event.target.select()} />
                  <button className="button button--small" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="note">
                  {state.public
                    ? "This game is also in the list of public games on the front page."
                    : "This game is private: only those who have the link can join."}
                </p>
              </div>
            )}
            <SettingsSummary settings={state.settings} />
            {startsIn !== null && (
              <p className="note" role="timer" aria-label="Time left in the lobby">
                {state.players.length >= MIN_PLAYERS
                  ? `The game starts by itself in ${clock(startsIn)}.`
                  : `If nobody else joins, this game is closed in ${clock(startsIn)}.`}
              </p>
            )}
            {host ? (
              <div className="screen__controls">
                <button
                  className="button button--primary"
                  onClick={() => api.send({ type: "start" })}
                  disabled={state.players.length < MIN_PLAYERS}
                >
                  Start the game
                </button>
                <p className="note">The game starts by itself when the room is full.</p>
              </div>
            ) : (
              <p className="note" role="status">
                {state.players.find((player) => player.id === state.host)?.name ?? "The host"} starts the game.
              </p>
            )}
          </section>
        )}
        {state?.phase === "finished" && host && (
          <section className="view">
            <button className="button button--primary" onClick={() => api.send({ type: "lobby" })}>
              New game
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
