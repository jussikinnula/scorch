import React, { useEffect, useRef, useState } from "react";

import { FieldState, MAX_PLAYERS, MIN_PLAYERS, RoomState } from "../../shared/protocol";
import Field from "../components/Field";
import PlayerList from "../components/PlayerList";
import QrCode from "../components/QrCode";
import TestPhoneButton from "../components/TestPhoneButton";
import { Api, useApiMessages } from "../hooks/useApiConnection";
import { useBubbles } from "../hooks/useBubbles";
import { toUrl } from "../routes";
import { loadHostKey, saveHostKey } from "../session";

interface Props {
  api: Api;
  room: string;
  /** Whether there is a button that opens test phones, for trying a game with many players in one browser. */
  playerTesting?: boolean;
}

/** Why this device cannot be the screen of the room. */
type Problem = "not-host" | "no-room" | "replaced";

const PROBLEMS: Record<Problem, string> = {
  "not-host": "This device is not the screen of this game.",
  "no-room": "This game has ended.",
  replaced: "This game is now shown on another screen or in another tab."
};

/** The big screen of a hotseat game: the lobby with the QR code, and later the playing field. */
export default function Screen({ api, room, playerTesting = false }: Props) {
  const [state, setState] = useState<RoomState | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [field, setField] = useState<FieldState | null>(null);
  const { bubbles, say } = useBubbles();
  const [problem, setProblem] = useState<Problem | null>(null);
  // After a problem the screen does not ask for the room again, e.g. to not fight another tab over it
  const stopped = useRef(false);

  const stop = (reason: Problem) => {
    stopped.current = true;
    setProblem(reason);
  };

  // Asks for the room whenever there is a connection: at first, and again after the connection was lost
  useEffect(() => {
    if (!api.connected || stopped.current) return;

    const hostKey = loadHostKey(room);
    if (hostKey) api.send({ type: "host", room, hostKey });
    else stop("not-host");
  }, [api, room]);

  useApiMessages(api, (message) => {
    if (message.type === "room" && message.state.room === room) setState(message.state);
    else if (message.type === "token") setToken(message.token);
    else if (message.type === "field") setField(message.field);
    else if (message.type === "say") say(message.id, message.text);
    else if (message.type === "aim") {
      const { id, angle, power } = message;
      setField(
        (current) =>
          current && {
            ...current,
            tanks: current.tanks.map((tank) => (tank.id === id ? { ...tank, angle, power } : tank))
          }
      );
    } else if (message.type === "error") {
      if (message.code === "replaced") stop("replaced");
      else if (message.re === "host" && message.code === "no-session") stop("not-host");
      else if (message.re === "host" && message.code === "no-room") {
        saveHostKey(room, null);
        stop("no-room");
      }
    }
  });

  if (problem) {
    return (
      <section className="view">
        <h2>{PROBLEMS[problem]}</h2>
        <p>
          <a href="#/">Start a new game</a>
        </p>
      </section>
    );
  }
  if (!state) {
    return (
      <section className="view">
        <p className="note" role="status">
          Connecting to the server…
        </p>
      </section>
    );
  }

  const { players, settings, phase } = state;
  const joinUrl = token && toUrl({ view: "join", token });
  const full = players.length >= settings.maxPlayers;
  const away = players.filter((player) => !player.connected).length;
  const setMaxPlayers = (maxPlayers: number) => api.send({ type: "settings", settings: { maxPlayers } });

  if (phase === "playing") {
    return (
      <section className="game">
        {field ? (
          <Field field={field} players={players} bubbles={bubbles} />
        ) : (
          <p className="note">Getting the playing field…</p>
        )}
        {/* The canvas is a picture: this tells the same to those who cannot see it */}
        <ul className="visually-hidden">
          {players.map((player) => {
            const tank = field?.tanks.find((candidate) => candidate.id === player.id);
            return (
              <li key={player.id}>
                {player.name}
                {!player.connected && " (disconnected)"}
                {bubbles[player.id] !== undefined && (
                  <span aria-label={`Speech bubble of ${player.name}`}>{bubbles[player.id]}</span>
                )}
                {tank && (
                  <span aria-label={`Aim of ${player.name}`}>
                    {tank.angle <= 90 ? tank.angle : 180 - tank.angle}°
                    {tank.angle === 90 ? "" : tank.angle < 90 ? " →" : " ←"} · {tank.power}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {!api.connected && (
          <p className="game__notice" role="status">
            Connection lost. Reconnecting…
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="view screen">
      <div className="screen__join">
        {joinUrl && !full ? (
          <>
            <QrCode value={joinUrl} label="QR code for joining the game" />
            <p className="screen__hint">Scan with the camera of your phone to join</p>
            {playerTesting && <TestPhoneButton joinUrl={joinUrl} />}
          </>
        ) : (
          <p className="screen__hint">{full ? "The game is full." : "Getting the QR code…"}</p>
        )}
      </div>

      <div className="screen__room">
        <h2>Waiting for players</h2>
        <p className="note">
          {players.length} of {settings.maxPlayers} players
          {away > 0 && `, ${away} disconnected`}
        </p>
        <PlayerList players={players} onKick={(player) => api.send({ type: "kick", id: player.id })} />

        <div className="screen__controls">
          <div className="stepper">
            <span id="max-players">Players at most</span>
            <button
              className="button button--small"
              aria-label="Fewer players"
              onClick={() => setMaxPlayers(settings.maxPlayers - 1)}
              disabled={settings.maxPlayers <= Math.max(MIN_PLAYERS, players.length)}
            >
              −
            </button>
            <output aria-labelledby="max-players">{settings.maxPlayers}</output>
            <button
              className="button button--small"
              aria-label="More players"
              onClick={() => setMaxPlayers(settings.maxPlayers + 1)}
              disabled={settings.maxPlayers >= MAX_PLAYERS}
            >
              +
            </button>
          </div>
          <button
            className="button button--primary"
            onClick={() => api.send({ type: "start" })}
            disabled={players.length < MIN_PLAYERS}
          >
            Start the game
          </button>
          <p className="note">The game starts by itself when the room is full.</p>
        </div>
      </div>
    </section>
  );
}
