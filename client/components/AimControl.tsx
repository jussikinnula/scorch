import React, { PointerEvent, useRef } from "react";

import { MAX_ANGLE, MIN_ANGLE, MIN_POWER } from "../../shared/protocol";

interface Props {
  /** The angle of the turret in degrees: 0 points right, 90 up and 180 left. */
  angle: number;
  power: number;
  /** The most power the tank can fire with: ten times its energy. */
  maxPower: number;
  /** The colour of the tank of the player. */
  color: string;
  onChange: (aim: { angle?: number; power?: number }) => void;
}

/** The size of the dial in its own units. The turret turns around the middle of its bottom edge. */
const RADIUS = 100;
const WIDTH = 2 * RADIUS + 20;
const HEIGHT = RADIUS + 24;
const CENTER = { x: WIDTH / 2, y: RADIUS + 10 };
/** How much a press of a power button changes the power. */
const POWER_STEP = 5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The point of the dial at an angle and a distance from its centre. */
const point = (angle: number, distance: number) => ({
  x: CENTER.x + Math.cos((angle * Math.PI) / 180) * distance,
  y: CENTER.y - Math.sin((angle * Math.PI) / 180) * distance
});

/**
 * The controls of the aim of a tank: a dial that is dragged to turn the turret, a slider for the
 * power, and buttons for fine adjustment of both.
 */
export default function AimControl({ angle, power, maxPower, color, onChange }: Props) {
  const dial = useRef<SVGSVGElement>(null);

  const setAngle = (value: number) => onChange({ angle: clamp(Math.round(value), MIN_ANGLE, MAX_ANGLE) });
  const setPower = (value: number) => onChange({ power: clamp(Math.round(value), MIN_POWER, maxPower) });

  /** Turns the turret to point at where the dial is touched. */
  const pointAt = (event: PointerEvent) => {
    const box = dial.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const x = ((event.clientX - box.left) / box.width) * WIDTH - CENTER.x;
    const y = CENTER.y - ((event.clientY - box.top) / box.height) * HEIGHT;
    // Below the horizon the turret stays at the end of its side
    setAngle(y <= 0 ? (x >= 0 ? MIN_ANGLE : MAX_ANGLE) : (Math.atan2(y, x) * 180) / Math.PI);
  };

  const tip = point(angle, RADIUS - 8);
  const ticks = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];
  // What the player sees is the angle from the horizon, as in the original: 0-90 to either side
  const elevation = angle <= 90 ? angle : 180 - angle;

  return (
    <div className="aim">
      <svg
        ref={dial}
        className="aim__dial"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Turret dial: drag to turn the turret"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          pointAt(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 0 || event.pointerType === "touch") pointAt(event);
        }}
      >
        <path
          d={`M${CENTER.x - RADIUS},${CENTER.y} A${RADIUS},${RADIUS} 0 0 1 ${CENTER.x + RADIUS},${CENTER.y} Z`}
          className="aim__face"
        />
        {ticks.map((tick) => {
          const from = point(tick, RADIUS - (tick % 45 === 0 ? 14 : 8));
          const to = point(tick, RADIUS);
          return <line key={tick} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="aim__tick" />;
        })}
        <line x1={CENTER.x} y1={CENTER.y} x2={tip.x} y2={tip.y} stroke={color} className="aim__turret" />
        <circle cx={CENTER.x} cy={CENTER.y} r={12} fill={color} />
      </svg>

      <div className="aim__row">
        <button className="button aim__step" aria-label="Turn the turret left" onClick={() => setAngle(angle + 1)}>
          ↺
        </button>
        <output className="aim__value" aria-label="Angle">
          {elevation}°{angle === 90 ? "" : angle < 90 ? " →" : " ←"}
        </output>
        <button className="button aim__step" aria-label="Turn the turret right" onClick={() => setAngle(angle - 1)}>
          ↻
        </button>
      </div>

      <label className="aim__label" htmlFor="power">
        Power
      </label>
      <input
        id="power"
        className="aim__power"
        type="range"
        min={MIN_POWER}
        max={maxPower}
        value={power}
        onChange={(event) => setPower(Number(event.target.value))}
      />
      <div className="aim__row">
        <button className="button aim__step" aria-label="Less power" onClick={() => setPower(power - POWER_STEP)}>
          −
        </button>
        <output className="aim__value" aria-label="Power value">
          {power}
        </output>
        <button className="button aim__step" aria-label="More power" onClick={() => setPower(power + POWER_STEP)}>
          +
        </button>
      </div>
    </div>
  );
}
