import React, { useEffect, useRef, useState } from "react";

import { FieldState, PlayerInfo, ShotState, SHOTS_INTERVAL, TankState } from "../../shared/protocol";
import { FIELD_WIDTH, TANK_HEIGHT, TANK_WIDTH, TURRET_LENGTH } from "../../shared/sim/field";
import { groundAt, Terrain } from "../../shared/sim/terrain";
import { findWeapon, WeaponKind } from "../../shared/weapons";
import { playerColor } from "../colors";
import { Bubbles } from "../hooks/useBubbles";

/**
 * What moves on the field faster than the rest of it is redrawn: the projectiles and the explosions.
 * The screen writes them here as the server tells them, and the field reads them on every frame.
 */
export interface Action {
  /** The projectiles as the server last told them, and as it told them the time before. */
  shots: ShotState[];
  previous: ShotState[];
  /** When the latest ones were told, on the clock of performance.now(). */
  at: number;
  explosions: { x: number; y: number; radius: number; weapon: string; part?: number; at: number }[];
  /**
   * What burns on the ground, by its id: how deep it lies on each column from x to the right, and
   * when it was last told: it burns on for a while after that.
   */
  burns: { id: number; x: number; depths: number[]; weapon: string; at: number }[];
  /**
   * The traces of this round: the places the server told of each projectile that leaves a trace, by
   * the id of the projectile, with the id of the player who fired it. They stay until the next round,
   * but for those of the bombs that a weapon threw (part), which fade soon after the bomb has gone off.
   */
  traces: Map<number, Trace>;
}

export interface Trace {
  owner: number;
  /** The thick trace of a Smoke Tracer. */
  smoke?: boolean;
  /** Which of the bombs that a weapon threw this is the trace of, if it is of one. */
  part?: number;
  /** When its projectile was first seen to be gone, on the clock of performance.now(). */
  gone?: number;
  points: { x: number; y: number }[];
}

export const noAction = (): Action => ({
  shots: [],
  previous: [],
  at: 0,
  explosions: [],
  burns: [],
  traces: new Map()
});

interface Props {
  field: FieldState;
  players: PlayerInfo[];
  /** The speech bubbles to show: the text by the id of the player. */
  bubbles?: Bubbles;
  action?: Action;
  /** The id of the player whose turn it is, in the classic mode: the tank is pointed out. */
  turn?: number | null;
  /**
   * Whether the field is a part of the page, as wide as the place it is in, instead of covering the
   * whole window: so it is in an online game, where the controls are on the same page.
   */
  boxed?: boolean;
}

/** Where the playing field is on a canvas: how large a pixel of the field is, and where its top left corner is. */
export interface Layout {
  scale: number;
  left: number;
  top: number;
}

/**
 * Fits the whole playing field on a canvas of any shape, as large as it goes: in the middle
 * sideways and against the bottom. What is left over of the canvas, at the sides or above, is
 * filled with more sky and ground, so there are no empty edges and nothing of the field is cut off.
 */
export function layoutField(field: { width: number; height: number }, width: number, height: number): Layout {
  const scale = Math.min(width / field.width, height / field.height);
  return { scale, left: (width - field.width * scale) / 2, top: height - field.height * scale };
}

/** The colour of the dirt. The themes of the original, with their own colours of land and sky, come later. */
const DIRT_COLOR = "#7a5c33";

/** Draws the sky and the terrain, which change rarely, to a canvas of their own to be copied on each redraw. */
function drawBackground(field: FieldState, width: number, height: number, layout: Layout) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#1b1d4a");
  sky.addColorStop(0.55, "#6a3d8f");
  sky.addColorStop(1, "#f0705a");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const { scale, left, top } = layout;

  /**
   * Draws the dirt of a column of the terrain over the canvas from one x to another. The edges are
   * at whole pixels of the canvas: an edge between two pixels would be drawn half see-through, which
   * shows as stripes between the columns.
   */
  const drawColumn = (column: number[], from: number, to: number) => {
    const x = Math.floor(from);
    const columnWidth = Math.ceil(to) - x;
    for (let i = 0; i + 1 < column.length; i += 2) {
      const y = Math.round(top + column[i] * scale);
      // The dirt is of one colour all through, as in the original
      context.fillStyle = DIRT_COLOR;
      context.fillRect(x, y, columnWidth, Math.round(top + column[i + 1] * scale) - y);
    }
  };

  // Beside the field the ground goes on at the height it has at the edge
  if (left > 0) {
    drawColumn(field.terrain[0], 0, left);
    drawColumn(field.terrain[field.terrain.length - 1], left + field.width * scale, width);
  }
  field.terrain.forEach((column, x) => drawColumn(column, left + x * scale, left + (x + 1) * scale));
  return canvas;
}

function drawTanks(
  context: CanvasRenderingContext2D,
  field: FieldState,
  players: PlayerInfo[],
  turn: number | null | undefined,
  now: number
) {
  for (const tank of field.tanks) {
    const player = players.find((candidate) => candidate.id === tank.id);
    if (tank.energy <= 0) {
      // A destroyed tank is a wreck: a dark heap with no turret
      context.fillStyle = "#2a2a30";
      context.beginPath();
      context.moveTo(tank.x - TANK_WIDTH / 2, tank.y);
      context.lineTo(tank.x - TANK_WIDTH / 3, tank.y - TANK_HEIGHT / 2);
      context.lineTo(tank.x - 2, tank.y - TANK_HEIGHT / 3);
      context.lineTo(tank.x + TANK_WIDTH / 4, tank.y - TANK_HEIGHT * 0.7);
      context.lineTo(tank.x + TANK_WIDTH / 2, tank.y);
      context.fill();
      if (player) {
        context.font = '16px "IBM VGA", ui-monospace, monospace';
        context.textAlign = "center";
        context.fillStyle = "rgba(255, 255, 255, 0.45)";
        context.fillText(player.name, tank.x, tank.y - TANK_HEIGHT - 6);
      }
      continue;
    }
    const color = playerColor(tank.id);
    // The tank of a player whose device is not connected is faded
    context.globalAlpha = player?.connected === false ? 0.4 : 1;

    // The turret turns around the top of the body: 0 degrees points right and 180 left
    const pivot = { x: tank.x, y: tank.y - TANK_HEIGHT };
    const angle = (tank.angle * Math.PI) / 180;
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(pivot.x, pivot.y);
    context.lineTo(pivot.x + Math.cos(angle) * TURRET_LENGTH, pivot.y - Math.sin(angle) * TURRET_LENGTH);
    context.stroke();

    if (tank.shield > 0) {
      // A shield is a ring around the tank: white when whole, and the darker a grey the less of it is left, as in the original
      const shade = shieldShade(tank.shield, tank.shieldMax);
      context.strokeStyle = `rgb(${shade}, ${shade}, ${shade})`;
      context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.12)`;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(tank.x, tank.y - TANK_HEIGHT / 2, TANK_WIDTH * 0.9, 0, 2 * Math.PI);
      context.fill();
      context.stroke();
    }

    // The body: a dome on top of a base
    context.fillStyle = color;
    context.beginPath();
    context.arc(tank.x, pivot.y + 2, TANK_WIDTH / 4, Math.PI, 0);
    context.fill();
    context.fillRect(tank.x - TANK_WIDTH / 2, tank.y - TANK_HEIGHT + 2, TANK_WIDTH, TANK_HEIGHT - 2);
    context.fillStyle = "rgba(0, 0, 0, 0.35)";
    context.fillRect(tank.x - TANK_WIDTH / 2, tank.y - 4, TANK_WIDTH, 4);

    if (player) {
      context.font = '16px "IBM VGA", ui-monospace, monospace';
      context.textAlign = "center";
      context.lineWidth = 3;
      context.strokeStyle = "rgba(0, 0, 0, 0.6)";
      context.strokeText(player.name, tank.x, tank.y - TANK_HEIGHT - TURRET_LENGTH - 10);
      context.fillStyle = "#fff";
      context.fillText(player.name, tank.x, tank.y - TANK_HEIGHT - TURRET_LENGTH - 10);
    }
    if (tank.id === turn) {
      // An arrow that bobs above the tank whose turn it is
      const top = tank.y - TANK_HEIGHT - TURRET_LENGTH - 44 + Math.sin(now / 200) * 3;
      context.fillStyle = "#fff";
      context.beginPath();
      context.moveTo(tank.x - 8, top);
      context.lineTo(tank.x + 8, top);
      context.lineTo(tank.x, top + 12);
      context.fill();
    }
    // The energy of the tank, as a bar under its name
    const bar = { x: tank.x - 16, y: tank.y - TANK_HEIGHT - TURRET_LENGTH - 6, width: 32, height: 3 };
    context.fillStyle = "rgba(0, 0, 0, 0.5)";
    context.fillRect(bar.x, bar.y, bar.width, bar.height);
    context.fillStyle = tank.energy > 50 ? "#3ddc84" : tank.energy > 25 ? "#ffd23f" : "#ff5a5a";
    context.fillRect(bar.x, bar.y, (bar.width * tank.energy) / 100, bar.height);
    context.globalAlpha = 1;
  }
}

/** The widest a line of a speech bubble can be, in pixels of the playing field. */
const BUBBLE_WIDTH = 200;
const BUBBLE_LINE = 18;
const BUBBLE_PADDING = 8;

/** Splits a text into lines that fit in a width. A word that does not fit on a line alone is cut. */
export function wrapText(text: string, fits: (line: string) => boolean) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line !== "" && fits(`${line} ${word}`)) {
      line += ` ${word}`;
      continue;
    }
    if (line !== "") lines.push(line);
    line = "";
    // A word that is too long is spread over lines of its own, a character at a time
    for (const character of word) {
      if (line !== "" && !fits(line + character)) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

function drawBubbles(context: CanvasRenderingContext2D, field: FieldState, bubbles: Bubbles) {
  context.font = '16px "IBM VGA", ui-monospace, monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const tank of field.tanks) {
    const text = bubbles[tank.id];
    if (text === undefined) continue;

    const lines = wrapText(text, (line) => context.measureText(line).width <= BUBBLE_WIDTH);
    const width = Math.max(...lines.map((line) => context.measureText(line).width)) + 2 * BUBBLE_PADDING;
    const height = lines.length * BUBBLE_LINE + 2 * BUBBLE_PADDING;
    // The bubble is above the name of the tank, and stays inside the field
    const tip = { x: tank.x, y: tank.y - TANK_HEIGHT - TURRET_LENGTH - 26 };
    const left = Math.min(field.width - width - 4, Math.max(4, tank.x - width / 2));
    const top = Math.max(4, tip.y - 8 - height);

    context.fillStyle = "#fff";
    context.beginPath();
    context.roundRect(left, top, width, height, 8);
    context.fill();
    // The tail points at the tank
    context.beginPath();
    context.moveTo(tip.x - 6, top + height - 1);
    context.lineTo(tip.x, tip.y);
    context.lineTo(tip.x + 6, top + height - 1);
    context.fill();

    context.fillStyle = "#101018";
    lines.forEach((line, index) => {
      context.fillText(line, left + width / 2, top + BUBBLE_PADDING + BUBBLE_LINE * (index + 0.5));
    });
  }
  context.textBaseline = "alphabetic";
}

/**
 * How light the grey of a shield is, from 0 to 255: white when it is whole, nearly black when it is
 * about to go. The darkest is not quite black, so that it still shows against a dark sky.
 */
export function shieldShade(shield: number, shieldMax: number) {
  const left = shieldMax > 0 ? Math.min(1, Math.max(0, shield / shieldMax)) : 1;
  return Math.round(50 + 205 * left);
}

/** How long an explosion is shown, in milliseconds: the bigger it is, the longer. */
const explosionTime = (radius: number) => 400 + radius * 5;
/** The colours of what a weapon does when it goes off, from the middle outwards. */
const EXPLOSION_COLORS: Record<WeaponKind, [string, string, string]> = {
  blast: ["#fff", "#ffe066", "#f0562a"],
  mirv: ["#fff", "#ffe066", "#f0562a"],
  leapfrog: ["#fff", "#c8f76a", "#3fae4a"],
  funky: ["#fff", "#7cf5ff", "#d94cff"],
  roller: ["#fff", "#ffe066", "#f0562a"],
  dirt: ["#b98a52", "#a3743f", "#8a5f31"],
  riot: ["#fff", "#bfe6ff", "#5aa9e6"],
  charge: ["#fff", "#bfe6ff", "#5aa9e6"],
  digger: ["#fff", "#e0c080", "#8a5f31"],
  disrupter: ["#fff", "#e0c080", "#8a5f31"],
  liquid: ["#b98a52", "#a3743f", "#8a5f31"],
  napalm: ["#fff", "#ffb347", "#e0401f"],
  sandhog: ["#fff", "#ffe066", "#f0562a"],
  tracer: ["#fff", "#fff", "#fff"]
};
/** How many of the latest places of a projectile make its tail. */
const TAIL_LENGTH = 14;

/**
 * Where on the edge of the field a projectile that is outside it is shown: straight below one that
 * is above the field, and level with one that is past a side. Null for one that is on the field.
 */
export function atEdge(shot: { x: number; y: number }) {
  if (shot.x >= 0 && shot.x <= FIELD_WIDTH && shot.y >= 0) return null;
  return { x: Math.min(FIELD_WIDTH - 2, Math.max(2, shot.x)), y: Math.max(2, shot.y) };
}

/**
 * Where the projectiles are right now. The server tells their places a few times a second; between
 * two tellings a projectile is drawn on the way from the earlier place to the later one.
 */
export function placeShots(action: Pick<Action, "shots" | "previous" | "at">, now: number) {
  const progress = Math.min(1, Math.max(0, (now - action.at) / SHOTS_INTERVAL));
  return action.shots.map((shot) => {
    const from = action.previous.find((candidate) => candidate.id === shot.id) ?? shot;
    return { ...shot, x: from.x + (shot.x - from.x) * progress, y: from.y + (shot.y - from.y) * progress };
  });
}

/** The colours of the bombs that a Funky Bomb throws, of their traces and of their explosions. */
export const PART_COLORS = ["#ff4d4d", "#ffd23f", "#4dff88", "#4dd2ff", "#b266ff", "#ff7ad9"];
const partColor = (part: number) => PART_COLORS[part % PART_COLORS.length];
/** How long the trace of a thrown bomb is still shown after the bomb has gone off, in milliseconds. */
const PART_TRACE_TIME = 700;

/**
 * The points a trace is drawn through. The server tells where a projectile is a little before it is
 * drawn there: while it flies, its trace ends where the projectile is drawn, not ahead of it.
 */
export function tracePoints(trace: Pick<Trace, "points">, flying: { x: number; y: number } | undefined) {
  return flying ? [...trace.points.slice(0, -1), { x: flying.x, y: flying.y }] : trace.points;
}

/** How long what was spilled burns on the ground, in milliseconds. */
export const BURN_TIME = 2500;

/** A number from 0 up to 1 that looks like chance but is always the same for the same number. */
const chance = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/**
 * How much of a tongue of flame there is over a column right now, from 0 to 1. The fire is a row of
 * tongues of a given width side by side; each of them rises and falls at a pace and a moment of its
 * own, with a quick flicker on top, so that no two move together.
 */
function tongueAt(column: number, now: number, width: number, shift: number) {
  const place = (column + shift) / width;
  const tongue = Math.floor(place);
  const shape = Math.sin(Math.PI * (place - tongue)) ** 2;
  const pace = 0.004 + 0.011 * chance(tongue * 7.3 + width);
  const moment = 2 * Math.PI * chance(tongue * 3.1 + width * 2);
  const flicker = 0.12 * Math.sin(now * (0.025 + 0.02 * chance(tongue + width * 5)) + moment * 3);
  return shape * Math.min(1, Math.max(0, 0.5 + 0.5 * Math.sin(now * pace + moment) + flicker));
}

/**
 * How high the flame of something that burns stands on a column, in pixels: by how deep it lies
 * there, dying down towards the end. The height changes smoothly from a column to the next and from
 * a moment to the next, but each tongue of the fire moves in its own time.
 *
 * @param age How much of its time it has burned, from 0 to 1.
 */
export function flameHeight(depth: number, column: number, now: number, age: number) {
  if (depth <= 0 || age >= 1) return 0;
  // Narrow tongues in front of wider ones that are out of step with them
  const tongue = Math.max(tongueAt(column, now, 13, 0), 0.8 * tongueAt(column, now, 21, 7));
  return (7 + depth * 2.6) * (0.4 + 1.1 * tongue) * Math.min(1, (1 - age) * 3);
}

/** A wisp of smoke rises from every this many columns of a fire. */
const SMOKE_EVERY = 26;
/** How many times a wisp of smoke is drawn along its way. */
const SMOKE_TRAIL = 6;
/** How high a wisp of smoke rises before it is gone, in pixels. */
const SMOKE_RISE = 70;

/**
 * The wisps of smoke over a fire right now: where each is, how large and how thick. A wisp rises
 * from the fire, curls and thins out, and then a new one starts from the same place: each at a pace
 * of its own. Nothing is remembered from one moment to the next: it all follows from the time.
 */
export function smokeWisps(from: number, columns: number, now: number) {
  const wisps: { x: number; rise: number; radius: number; thickness: number }[] = [];
  for (let wisp = Math.floor(from / SMOKE_EVERY); wisp * SMOKE_EVERY < from + columns; wisp++) {
    const start = wisp * SMOKE_EVERY + chance(wisp * 1.7) * SMOKE_EVERY;
    if (start < from || start >= from + columns) continue;
    const time = 1300 + 1400 * chance(wisp * 5.9);
    const life = ((now + time * chance(wisp * 9.1)) % time) / time;
    const curl = Math.sin(life * (4 + 4 * chance(wisp * 2.3)) + wisp) * (4 + 10 * life);
    wisps.push({ x: start + curl, rise: life * SMOKE_RISE, radius: 2.5 + 6 * life, thickness: 0.3 * (1 - life) });
  }
  return wisps;
}

/**
 * How a fire looks: its layers from the outside in (how high each stands as a part of the flame, and
 * its colour), the colour of its glow and how far that reaches, and how high it stands as a multiple
 * of an ordinary fire.
 */
interface Fire {
  layers: [number, string][];
  glow: string;
  blur: number;
  tall: number;
}
const FIRE: Fire = {
  layers: [
    [1, "#e0401f"],
    [0.62, "#ff9a3c"],
    [0.3, "#ffe9a0"]
  ],
  glow: "#ff6a1f",
  blur: 14,
  tall: 1
};
/** What burns hotter is whiter, brighter and taller: yellow where an ordinary fire is red, with a white heart. */
const HOT_FIRE: Fire = {
  layers: [
    [1, "#ff8a1f"],
    [0.7, "#ffe24a"],
    [0.42, "#ffffff"]
  ],
  glow: "#ffd98a",
  blur: 26,
  tall: 1.4
};
const fireOf = (weapon: string) => (weapon === "hot-napalm" ? HOT_FIRE : FIRE);
/** Over how many columns to each side the depth of what burns is evened out, so that the fire has no steps. */
const FLAME_SMOOTH = 4;

function drawBurns(context: CanvasRenderingContext2D, action: Action, terrain: Terrain, height: number, now: number) {
  action.burns = action.burns.filter((burn) => now - burn.at < BURN_TIME);
  for (const burn of action.burns) {
    const age = (now - burn.at) / BURN_TIME;
    // The top of the fire over each column, and the ground under it
    const flames = burn.depths.map((_, index) => {
      let sum = 0;
      for (let k = -FLAME_SMOOTH; k <= FLAME_SMOOTH; k++) sum += burn.depths[index + k] ?? 0;
      const x = burn.x + index;
      return { x, ground: groundAt(terrain, x, height), flame: flameHeight(sum / (2 * FLAME_SMOOTH + 1), x, now, age) };
    });
    if (flames.length === 0) continue;
    const fire = fireOf(burn.weapon);
    // One shape for each layer: red outside with a glow, yellow inside
    fire.layers.forEach(([part, color], layer) => {
      context.fillStyle = color;
      context.shadowColor = fire.glow;
      context.shadowBlur = layer === 0 ? fire.blur : 0;
      context.globalAlpha = 0.92;
      context.beginPath();
      context.moveTo(flames[0].x, flames[0].ground + 1);
      for (const { x, ground, flame } of flames) context.lineTo(x + 0.5, ground - flame * part * fire.tall);
      for (let index = flames.length - 1; index >= 0; index--)
        context.lineTo(flames[index].x + 1, flames[index].ground + 1);
      context.closePath();
      context.fill();
    });
    context.shadowBlur = 0;
    // Smoke rises from the tops of the flames, and goes with the fire
    context.fillStyle = "#b9b2ad";
    // Each wisp is drawn where it is and where it was a moment ago, a few times over: a curl, not a ball
    for (let trail = 0; trail < SMOKE_TRAIL; trail++) {
      const wisps = smokeWisps(burn.x, burn.depths.length, now - trail * 90);
      const heads = trail === 0 ? wisps : smokeWisps(burn.x, burn.depths.length, now);
      wisps.forEach((wisp, index) => {
        const under = flames[Math.min(flames.length - 1, Math.max(0, Math.round(wisp.x) - burn.x))];
        // Not what is left of the wisp before this one, which has just gone
        if (under.flame <= 0 || wisp.rise > heads[index].rise) return;
        context.globalAlpha = wisp.thickness * Math.min(1, (1 - age) * 3);
        context.beginPath();
        context.arc(wisp.x, under.ground - under.flame * fire.tall - wisp.rise, wisp.radius, 0, 2 * Math.PI);
        context.fill();
      });
    }
    context.globalAlpha = 1;
  }
}

function drawAction(
  context: CanvasRenderingContext2D,
  action: Action,
  tails: Map<number, { x: number; y: number }[]>,
  now: number
) {
  const shots = placeShots(action, now);
  for (const [id, trace] of action.traces) {
    const flying = shots.find((shot) => shot.id === id);
    const points = tracePoints(trace, flying);
    if (trace.part !== undefined && !flying) {
      // The trace of a thrown bomb fades after the bomb has gone off
      trace.gone ??= now;
      if (now - trace.gone > PART_TRACE_TIME) {
        action.traces.delete(id);
        continue;
      }
      context.globalAlpha = 1 - (now - trace.gone) / PART_TRACE_TIME;
    }
    if (trace.smoke || trace.part !== undefined) {
      // Smoke is one even line, thick and thin at once: easy to see, and what is behind it shows through.
      // The trace of a thrown bomb is a thin line in the colour of the bomb.
      if (trace.smoke) context.globalAlpha = 0.55;
      context.strokeStyle = trace.part === undefined ? playerColor(trace.owner) : partColor(trace.part);
      context.lineWidth = trace.smoke ? 5 : 2;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      points.forEach((point, index) =>
        index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)
      );
      context.stroke();
    } else {
      // A trace is a row of dots in the colour of the one who fired, as in the original
      context.fillStyle = playerColor(trace.owner);
      for (const point of points) context.fillRect(point.x - 1, point.y - 1, 2, 2);
    }
    context.globalAlpha = 1;
  }

  for (const id of tails.keys()) if (!shots.some((shot) => shot.id === id)) tails.delete(id);

  for (const shot of shots) {
    const edge = atEdge(shot);
    if (edge) {
      // Outside the field, above it or past a side: a white dot on the edge shows where it is going, as in the original
      tails.delete(shot.id);
      context.fillStyle = "#fff";
      context.fillRect(edge.x - 2, edge.y - 2, 4, 4);
      continue;
    }
    const tail = tails.get(shot.id) ?? [];
    tail.push({ x: shot.x, y: shot.y });
    if (tail.length > TAIL_LENGTH) tail.shift();
    tails.set(shot.id, tail);

    const color = playerColor(shot.owner);
    tail.forEach((point, index) => {
      context.globalAlpha = (0.5 * (index + 1)) / tail.length;
      context.fillStyle = color;
      context.beginPath();
      context.arc(point.x, point.y, 2, 0, 2 * Math.PI);
      context.fill();
    });
    context.globalAlpha = 1;
    context.fillStyle = "#fff";
    context.beginPath();
    // A tracer is only a light: smaller than what does harm
    context.arc(shot.x, shot.y, findWeapon(shot.weapon)?.kind === "tracer" ? 1.5 : 3, 0, 2 * Math.PI);
    context.fill();
  }

  action.explosions = action.explosions.filter((explosion) => now - explosion.at < explosionTime(explosion.radius));
  for (const explosion of action.explosions) {
    // The ball of fire grows fast to its full size and then fades
    const age = (now - explosion.at) / explosionTime(explosion.radius);
    const radius = Math.max(1, explosion.radius * Math.min(1, age * 4));
    const colors =
      explosion.part === undefined
        ? EXPLOSION_COLORS[findWeapon(explosion.weapon)?.kind ?? "blast"]
        : ["#fff", partColor(explosion.part), partColor(explosion.part)];
    const fire = context.createRadialGradient(explosion.x, explosion.y, 0, explosion.x, explosion.y, radius);
    fire.addColorStop(0, colors[0]);
    fire.addColorStop(0.4, colors[1]);
    fire.addColorStop(1, colors[2]);
    context.globalAlpha = 1 - age * age;
    context.fillStyle = fire;
    context.beginPath();
    context.arc(explosion.x, explosion.y, radius, 0, 2 * Math.PI);
    context.fill();
    context.globalAlpha = 1;
  }
}

/** How fast a tank is drawn to fall when the ground has gone from under it, in pixels a second squared. */
const FALL_GRAVITY = 900;

/**
 * Where the tanks are drawn. The server moves a tank whose ground went straight to where it lands;
 * here it is shown falling there. A tank that is anywhere else than above its place (a new round)
 * is drawn where it is.
 *
 * @param shown Where each tank was drawn the last time, by its id. It is brought up to date.
 * @param seconds The time since the last drawing.
 */
export function fallTanks(
  tanks: TankState[],
  shown: Map<number, { x: number; y: number; speed: number }>,
  seconds: number
): TankState[] {
  return tanks.map((tank) => {
    const was = shown.get(tank.id);
    if (!was || was.x !== tank.x || was.y >= tank.y) {
      shown.set(tank.id, { x: tank.x, y: tank.y, speed: 0 });
      return tank;
    }
    const speed = was.speed + FALL_GRAVITY * seconds;
    const y = Math.min(tank.y, was.y + speed * seconds);
    shown.set(tank.id, { x: tank.x, y, speed: y === tank.y ? 0 : speed });
    return { ...tank, y };
  });
}

/**
 * The size of what the field is drawn on in pixels of the device, kept up to date: the window, or
 * the place of the canvas on the page when the field is a part of the page.
 */
function useCanvasSize(canvas: React.RefObject<HTMLCanvasElement | null>, boxed: boolean) {
  const measure = () => {
    const ratio = window.devicePixelRatio || 1;
    const box = boxed ? canvas.current : null;
    // Before the canvas has a place on the page, the shape of the field itself
    const width = box ? box.clientWidth || 640 : window.innerWidth;
    const height = box ? box.clientHeight || 360 : window.innerHeight;
    return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
  };
  const [size, setSize] = useState(measure);

  useEffect(() => {
    const onResize = () =>
      setSize((current) => {
        const next = measure();
        return next.width === current.width && next.height === current.height ? current : next;
      });
    onResize();
    window.addEventListener("resize", onResize);
    // The place of the canvas can change without the window changing, e.g. when the phone is turned
    const observer = boxed && typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    if (observer && canvas.current) observer.observe(canvas.current);
    return () => {
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, [boxed]);

  return size;
}

/** The playing field: the terrain, the tanks and what flies, drawn on a canvas that covers the whole window. */
export default function Field({ field, players, bubbles, action, turn, boxed = false }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const background = useRef<{ of: number[][]; width: number; height: number; picture: HTMLCanvasElement } | null>(null);
  const tails = useRef(new Map<number, { x: number; y: number }[]>());
  const shown = useRef(new Map<number, { x: number; y: number; speed: number }>());
  const drawnAt = useRef(performance.now());
  const { width, height } = useCanvasSize(canvas, boxed);
  // What to draw is kept where the drawing of each frame finds the latest of it
  const scene = useRef({ field, players, bubbles, action, turn, width, height });
  scene.current = { field, players, bubbles, action, turn, width, height };

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;

    let frame = 0;
    const draw = () => {
      const { field, players, bubbles, action, turn, width, height } = scene.current;
      const layout = layoutField(field, width, height);

      // The background is drawn again only when the terrain or the size of the window has changed
      const drawn = background.current;
      if (!drawn || drawn.of !== field.terrain || drawn.width !== width || drawn.height !== height) {
        background.current = {
          of: field.terrain,
          width,
          height,
          picture: drawBackground(field, width, height, layout)
        };
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(background.current!.picture, 0, 0);
      context.setTransform(layout.scale, 0, 0, layout.scale, layout.left, layout.top);
      const now = performance.now();
      // The tanks as they are shown: one whose ground went is on its way down
      const seconds = Math.min(0.1, (now - drawnAt.current) / 1000);
      drawnAt.current = now;
      const seen = { ...field, tanks: fallTanks(field.tanks, shown.current, seconds) };
      drawTanks(context, seen, players, turn, now);
      if (action) {
        drawBurns(context, action, field.terrain, field.height, now);
        drawAction(context, action, tails.current, now);
      }
      if (bubbles) drawBubbles(context, seen, bubbles);
      frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas
      ref={canvas}
      className={boxed ? "field field--boxed" : "field"}
      width={width}
      height={height}
      role="img"
      aria-label="The playing field"
    />
  );
}
