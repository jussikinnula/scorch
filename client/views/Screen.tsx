import React, { useEffect, useRef, useState } from "react";

import {
  FieldState,
  MAX_ARMS_LEVEL,
  MAX_CASH,
  MAX_INTEREST,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MAX_WIND,
  MIN_PLAYERS,
  MIN_ROUNDS,
  RoomState,
  WIND_STEP
} from "../../shared/protocol";
import Field, { noAction } from "../components/Field";
import PlayerList from "../components/PlayerList";
import QrCode from "../components/QrCode";
import Wind from "../components/Wind";
import { formatMoney } from "../money";
import Standings, { ranked } from "../components/Standings";
import TestPhoneButton from "../components/TestPhoneButton";
import { Api, useApiMessages } from "../hooks/useApiConnection";
import { applyTerrainOp } from "../../shared/sim/terrain";
import { useBubbles } from "../hooks/useBubbles";
import { useCountdown } from "../hooks/useCountdown";
import { toUrl } from "../routes";
import { loadHostKey, saveHostKey } from "../session";

/** The amounts of money the screen offers for the start of a game. */
const CASH_STEPS = [0, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];

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
  // The projectiles and the explosions move too fast to go through the state of the view
  const action = useRef(noAction());
  const [flying, setFlying] = useState(0);
  /** The result of the round that just ended, while it is shown. */
  const [result, setResult] = useState<{ round: number; winner: number | null } | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  // After a problem the screen does not ask for the room again, e.g. to not fight another tab over it
  const stopped = useRef(false);

  // The settings as they will be once what was just clicked has gone through the server: a click
  // changes these, so that several quick clicks are not all counted from the same old settings
  const wanted = useRef<RoomState["settings"] | null>(null);
  // Kept where the next message finds them, as the messages can come faster than the view is redrawn
  const tracesNow = useRef(false);
  const roundNow = useRef(0);
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
    if (message.type === "room" && message.state.room === room) {
      setState(message.state);
      tracesNow.current = message.state.settings.traces;
      // The traces are of one round: a new round starts with none
      if (message.state.round !== roundNow.current) action.current.traces.clear();
      roundNow.current = message.state.round;
      wanted.current = message.state.settings;
    } else if (message.type === "token") setToken(message.token);
    else if (message.type === "field") {
      setField(message.field);
      // A new field is a new round: the result of the old one has been seen
      setResult(null);
    } else if (message.type === "roundOver") setResult({ round: message.round, winner: message.winner });
    else if (message.type === "say") say(message.id, message.text);
    else if (message.type === "shots") {
      // A Tracer leaves a trace of its path, and with Trace Paths on everything does
      for (const shot of message.shots) {
        if (shot.weapon !== "tracer" && !tracesNow.current) continue;
        const trace = action.current.traces.get(shot.id) ?? { owner: shot.owner, points: [] };
        trace.points.push({ x: shot.x, y: shot.y });
        action.current.traces.set(shot.id, trace);
      }
      action.current.previous = action.current.shots;
      action.current.shots = message.shots;
      action.current.at = performance.now();
      setFlying(message.shots.length);
    } else if (message.type === "explode") {
      const { x, y, radius, weapon } = message;
      action.current.explosions.push({ x, y, radius, weapon, at: performance.now() });
    } else if (message.type === "terrain") {
      const { changes, tanks } = message;
      setField((current) => {
        if (!current) return current;
        // The same changes as on the server, to a copy: the old terrain is still being drawn
        const terrain = [...current.terrain];
        changes.forEach((change) => applyTerrainOp(terrain, change, current.height));
        return { ...current, terrain, tanks };
      });
    } else if (message.type === "aim") {
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
  const change = (changed: Partial<RoomState["settings"]>) => {
    wanted.current = { ...(wanted.current ?? settings), ...changed };
    api.send({ type: "settings", settings: wanted.current });
  };
  const setMaxPlayers = (by: number) => change({ maxPlayers: (wanted.current ?? settings).maxPlayers + by });
  const setRounds = (by: number) => change({ rounds: (wanted.current ?? settings).rounds + by });
  const setCash = (by: 1 | -1) => {
    const now = CASH_STEPS.indexOf((wanted.current ?? settings).cash);
    change({ cash: CASH_STEPS[Math.min(CASH_STEPS.length - 1, Math.max(0, now + by))] });
  };
  const setMaxWind = (by: number) => change({ maxWind: (wanted.current ?? settings).maxWind + by });

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
          <Field field={field} players={players} bubbles={bubbles} action={action.current} turn={state.turn?.player} />
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
          <div className="stepper">
            <span id="max-players">Players at most</span>
            <button
              className="button button--small"
              aria-label="Fewer players"
              onClick={() => setMaxPlayers(-1)}
              disabled={settings.maxPlayers <= Math.max(MIN_PLAYERS, players.length)}
            >
              −
            </button>
            <output aria-labelledby="max-players">{settings.maxPlayers}</output>
            <button
              className="button button--small"
              aria-label="More players"
              onClick={() => setMaxPlayers(1)}
              disabled={settings.maxPlayers >= MAX_PLAYERS}
            >
              +
            </button>
          </div>
          <div className="stepper" role="group" aria-label="Turns">
            <span>Turns</span>
            <button
              className={`button button--small${settings.turns === "classic" ? " button--chosen" : ""}`}
              aria-pressed={settings.turns === "classic"}
              onClick={() => change({ turns: "classic" })}
            >
              Classic
            </button>
            <button
              className={`button button--small${settings.turns === "live" ? " button--chosen" : ""}`}
              aria-pressed={settings.turns === "live"}
              onClick={() => change({ turns: "live" })}
            >
              Live
            </button>
          </div>
          <p className="note">
            {settings.turns === "classic"
              ? "Classic: one player at a time aims and fires."
              : "Live: everyone fires whenever their tank has reloaded."}
          </p>
          <div className="stepper">
            <span id="rounds">Rounds</span>
            <button
              className="button button--small"
              aria-label="Fewer rounds"
              onClick={() => setRounds(-1)}
              disabled={settings.rounds <= MIN_ROUNDS}
            >
              −
            </button>
            <output aria-labelledby="rounds">{settings.rounds}</output>
            <button
              className="button button--small"
              aria-label="More rounds"
              onClick={() => setRounds(1)}
              disabled={settings.rounds >= MAX_ROUNDS}
            >
              +
            </button>
          </div>
          <div className="stepper">
            <span id="max-wind">Wind at most</span>
            <button
              className="button button--small"
              aria-label="Less wind"
              onClick={() => setMaxWind(-WIND_STEP)}
              disabled={settings.maxWind <= 0}
            >
              −
            </button>
            <output aria-labelledby="max-wind">{settings.maxWind === 0 ? "None" : settings.maxWind}</output>
            <button
              className="button button--small"
              aria-label="More wind"
              onClick={() => setMaxWind(WIND_STEP)}
              disabled={settings.maxWind >= MAX_WIND}
            >
              +
            </button>
          </div>
          <div className="stepper">
            <span id="cash">Cash at start</span>
            <button
              className="button button--small"
              aria-label="Less cash"
              onClick={() => setCash(-1)}
              disabled={settings.cash <= 0}
            >
              −
            </button>
            <output aria-labelledby="cash">{formatMoney(settings.cash)}</output>
            <button
              className="button button--small"
              aria-label="More cash"
              onClick={() => setCash(1)}
              disabled={settings.cash >= MAX_CASH}
            >
              +
            </button>
          </div>
          <div className="stepper">
            <span id="interest">Interest</span>
            <button
              className="button button--small"
              aria-label="Less interest"
              onClick={() => change({ interest: (wanted.current ?? settings).interest - 1 })}
              disabled={settings.interest <= 0}
            >
              −
            </button>
            <output aria-labelledby="interest">{settings.interest} %</output>
            <button
              className="button button--small"
              aria-label="More interest"
              onClick={() => change({ interest: (wanted.current ?? settings).interest + 1 })}
              disabled={settings.interest >= MAX_INTEREST}
            >
              +
            </button>
          </div>
          <div className="stepper">
            <span id="arms-level">Arms level</span>
            <button
              className="button button--small"
              aria-label="Lower arms level"
              onClick={() => change({ armsLevel: (wanted.current ?? settings).armsLevel - 1 })}
              disabled={settings.armsLevel <= 0}
            >
              −
            </button>
            <output aria-labelledby="arms-level">{settings.armsLevel}</output>
            <button
              className="button button--small"
              aria-label="Higher arms level"
              onClick={() => change({ armsLevel: (wanted.current ?? settings).armsLevel + 1 })}
              disabled={settings.armsLevel >= MAX_ARMS_LEVEL}
            >
              +
            </button>
          </div>
          <div className="stepper" role="group" aria-label="Walls">
            <span>Walls</span>
            {(["none", "rubber", "wraparound"] as const).map((walls) => (
              <button
                key={walls}
                className={`button button--small${settings.walls === walls ? " button--chosen" : ""}`}
                aria-pressed={settings.walls === walls}
                onClick={() => change({ walls })}
              >
                {{ none: "None", rubber: "Rubber", wraparound: "Wraparound" }[walls]}
              </button>
            ))}
          </div>
          <div className="stepper" role="group" aria-label="Changing wind">
            <span>Changing wind</span>
            <button
              className={`button button--small${settings.changingWind ? "" : " button--chosen"}`}
              aria-pressed={!settings.changingWind}
              onClick={() => change({ changingWind: false })}
            >
              Off
            </button>
            <button
              className={`button button--small${settings.changingWind ? " button--chosen" : ""}`}
              aria-pressed={settings.changingWind}
              onClick={() => change({ changingWind: true })}
            >
              On
            </button>
          </div>
          <div className="stepper" role="group" aria-label="Trace paths">
            <span>Trace paths</span>
            <button
              className={`button button--small${settings.traces ? "" : " button--chosen"}`}
              aria-pressed={!settings.traces}
              onClick={() => change({ traces: false })}
            >
              Tracers only
            </button>
            <button
              className={`button button--small${settings.traces ? " button--chosen" : ""}`}
              aria-pressed={settings.traces}
              onClick={() => change({ traces: true })}
            >
              Every shot
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
