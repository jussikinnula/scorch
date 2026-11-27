import React, { useEffect, useRef } from "react";

import { MAX_ANGLE, MIN_ANGLE, MIN_POWER } from "../../shared/protocol";

interface Props {
  /** The angle of the turret in degrees: 0 points right, 90 up and 180 left. */
  angle: number;
  power: number;
  /** The most power the tank can fire with now: ten times its energy. */
  maxPower: number;
  onChange: (change: { angle?: number; power?: number }) => void;
}

/** How much a press changes the power, and how much when the button has been held for a while. */
export const POWER_STEP = 5;
export const POWER_STEP_HELD = 25;
/** How long a button is held before it starts to repeat, and how often it then repeats, in milliseconds. */
const HOLD_DELAY = 350;
const HOLD_INTERVAL = 60;
/** After this many repeats a held button goes in bigger steps. */
const HOLD_FAST = 12;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A button that does its thing once when pressed, and again and again while it is held. */
function HoldButton({ label, onStep, children }: { label: string; onStep: (held: number) => void; children: string }) {
  const timers = useRef<{ delay?: number; repeat?: number }>({});
  // The latest of what the button does: it changes with every step, while the timer stays the same
  const step = useRef(onStep);
  step.current = onStep;

  const stop = () => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.repeat);
    timers.current = {};
  };
  useEffect(() => stop, []);

  const start = () => {
    stop();
    let held = 0;
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => step.current(++held), HOLD_INTERVAL);
    }, HOLD_DELAY);
  };

  return (
    <button
      className="button bar__step"
      aria-label={label}
      // A click is the one step of a press, also from the keyboard; holding adds the rest
      onClick={() => step.current(0)}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}

/**
 * The aim of a tank as a part of a narrow bar, as in the status bar of the original: the angle and
 * the power as numbers, with buttons to change them. It takes little room, so that the playing
 * field has the rest. Holding a button repeats it.
 */
export default function AimBar({ angle, power, maxPower, onChange }: Props) {
  const turn = (by: number) => onChange({ angle: clamp(angle + by, MIN_ANGLE, MAX_ANGLE) });
  const push = (by: number) => onChange({ power: clamp(power + by, MIN_POWER, maxPower) });
  const powerStep = (held: number) => (held > HOLD_FAST ? POWER_STEP_HELD : POWER_STEP);
  // What the player sees is the angle from the horizon, as in the original: 0-90 to either side
  const elevation = angle <= 90 ? angle : 180 - angle;

  return (
    <>
      <div className="bar__group" role="group" aria-label="Turret">
        <HoldButton label="Turn the turret left" onStep={() => turn(1)}>
          ↺
        </HoldButton>
        <span className="bar__value">
          <small>Angle</small>
          <output aria-label="Angle">
            {elevation}°{angle === 90 ? "" : angle < 90 ? " →" : " ←"}
          </output>
        </span>
        <HoldButton label="Turn the turret right" onStep={() => turn(-1)}>
          ↻
        </HoldButton>
      </div>
      <div className="bar__group" role="group" aria-label="Power">
        <HoldButton label="Less power" onStep={(held) => push(-powerStep(held))}>
          −
        </HoldButton>
        <span className="bar__value">
          <small>Power</small>
          <output aria-label="Power value">{power}</output>
        </span>
        <HoldButton label="More power" onStep={(held) => push(powerStep(held))}>
          +
        </HoldButton>
      </div>
    </>
  );
}
