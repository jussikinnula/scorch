import React, { useEffect, useRef, useState } from "react";

import { MIN_PLAYERS, RoomState } from "../../shared/protocol";
import Field from "../components/Field";
import PlayerList from "../components/PlayerList";
import LobbySettings from "../components/LobbySettings";
import QrCode from "../components/QrCode";
import Wind from "../components/Wind";
import Standings, { ranked } from "../components/Standings";
import TestPhoneButton from "../components/TestPhoneButton";
import { Api, useApiMessages } from "../hooks/useApiConnection";
import { useCountdown } from "../hooks/useCountdown";
import { useFieldView } from "../hooks/useFieldView";
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
  const { state, field, bubbles, action, flying, result } = useFieldView(api, room);
  const [token, setToken] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  // After a problem the screen does not ask for the room again, e.g. to not fight another tab over it
  const stopped = useRef(false);

  // The settings as they will be once what was just clicked has gone through the server: a click
  // changes these, so that several quick clicks are not all counted from the same old settings
  const wanted = useRef<RoomState["settings"] | null>(null);
  const turnTime = useCountdown(state?.turn ? state.turn.time : null, state);
  const shopTime = useCountdown(state?.shop ? state.shop.time : null, state);

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
    if (message.type === "room" && message.state.room === room) wanted.current = message.state.settings;
    else if (message.type === "token") setToken(message.token);
    else if (message.type === "error") {
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
  const change = (changed: Partial<RoomState["settings"]>) => {
    wanted.current = { ...(wanted.current ?? settings), ...changed };
    api.send({ type: "settings", settings: wanted.current });
  };

  if (phase === "finished") {
    const [winner, second] = ranked(players);
    return (
      <section className="view results">
        <h2>{winner && winner.wins > (second?.wins ?? -1) ? `${winner.name} wins the game` : "The game is a draw"}</h2>
        <p className="note">
          {state.round} {state.round === 1 ? "round" : "rounds"} played
        </p>
        <Standings players={players} />
        <button className="button button--primary" onClick={() => api.send({ type: "lobby" })}>
          New game
        </button>
      </section>
    );
  }

  if (phase === "shop" && state.shop) {
    const ready = new Set(state.shop.ready);
    return (
      <section className="view results">
        <h2>The shop is open</h2>
        <p className="note" role="status">
          Round {state.round + 1} of {settings.rounds} starts when everyone is ready
          {shopTime !== null && shopTime > 0 && `, or in ${shopTime} s`}. {ready.size} of {players.length} ready.
        </p>
        <Standings players={players} />
      </section>
    );
  }

  if (phase === "playing") {
    return (
      <section className="game">
        {field ? (
          <Field field={field} players={players} bubbles={bubbles} action={action} turn={state.turn?.player} />
        ) : (
          <p className="note">Getting the playing field…</p>
        )}
        {/* The canvas is a picture: this tells the same to those who cannot see it */}
        <p className="visually-hidden" role="status">
          Projectiles in the air: {flying}
        </p>
        <ul className="visually-hidden">
          {players.map((player) => {
            const tank = field?.tanks.find((candidate) => candidate.id === player.id);
            return (
              <li key={player.id}>
                {player.name}
                {!player.connected && " (disconnected)"}
                {tank && <span aria-label={`Energy of ${player.name}`}>{tank.energy}</span>}
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
        <Wind wind={state.wind} className="game__wind" />
        {state.turn && !result && (
          <p className="game__turn" role="status" aria-label="Turn">
            {players.find((player) => player.id === state.turn?.player)?.name}
            {turnTime !== null && turnTime > 0 && <span>{turnTime}</span>}
          </p>
        )}
        {result && (
          <div className="game__result" role="alert">
            <span>
              Round {result.round} of {settings.rounds}
            </span>
            {result.winner === null
              ? "Nobody is left"
              : `${players.find((player) => player.id === result.winner)?.name ?? "?"} wins`}
            <Standings players={players} />
          </div>
        )}
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
          <LobbySettings
            settings={settings}
            players={players.length}
            current={() => wanted.current ?? settings}
            change={change}
          />
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
