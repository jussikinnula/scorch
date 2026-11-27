import React from "react";

import {
  MAX_ARMS_LEVEL,
  MAX_CASH,
  MAX_INTEREST,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MAX_WIND,
  MIN_PLAYERS,
  MIN_ROUNDS,
  RoomSettings,
  WIND_STEP
} from "../../shared/protocol";
import { formatMoney } from "../money";

/** The amounts of money the screen offers for the start of a game. */
const CASH_STEPS = [0, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];

interface Props {
  /** The settings as they are shown: those the server last told. */
  settings: RoomSettings;
  /** How many players are in the room: the maximum cannot go below it. */
  players: number;
  /**
   * The settings as the host wants them: the latest that were asked for, also when the server has
   * not answered yet. A change is counted from these, so that quick clicks are counted one by one.
   */
  current: () => RoomSettings;
  change: (changed: Partial<RoomSettings>) => void;
}

/** The settings of a game, for its host to change in the lobby: on the screen of a hotseat game, and later in an online game. */
export default function LobbySettings({ settings, players, current, change }: Props) {
  const setMaxPlayers = (by: number) => change({ maxPlayers: current().maxPlayers + by });
  const setRounds = (by: number) => change({ rounds: current().rounds + by });
  const setCash = (by: 1 | -1) => {
    const now = CASH_STEPS.indexOf(current().cash);
    change({ cash: CASH_STEPS[Math.min(CASH_STEPS.length - 1, Math.max(0, now + by))] });
  };
  const setMaxWind = (by: number) => change({ maxWind: current().maxWind + by });

  return (
    <>
      <div className="stepper">
        <span id="max-players">Players at most</span>
        <button
          className="button button--small"
          aria-label="Fewer players"
          onClick={() => setMaxPlayers(-1)}
          disabled={settings.maxPlayers <= Math.max(MIN_PLAYERS, players)}
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
          onClick={() => change({ interest: current().interest - 1 })}
          disabled={settings.interest <= 0}
        >
          −
        </button>
        <output aria-labelledby="interest">{settings.interest} %</output>
        <button
          className="button button--small"
          aria-label="More interest"
          onClick={() => change({ interest: current().interest + 1 })}
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
          onClick={() => change({ armsLevel: current().armsLevel - 1 })}
          disabled={settings.armsLevel <= 0}
        >
          −
        </button>
        <output aria-labelledby="arms-level">{settings.armsLevel}</output>
        <button
          className="button button--small"
          aria-label="Higher arms level"
          onClick={() => change({ armsLevel: current().armsLevel + 1 })}
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
    </>
  );
}
