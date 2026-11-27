import React, { useEffect, useRef, useState } from "react";

import { FieldState, PlayerInfo, ShotState, SHOTS_INTERVAL, TankState } from "../../shared/protocol";
import { FIELD_WIDTH, TANK_HEIGHT, TANK_WIDTH, TURRET_LENGTH } from "../../shared/sim/field";
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
  explosions: { x: number; y: number; radius: number; weapon: string; at: number }[];
  /**
   * The traces of this round: the places the server told of each projectile that leaves a trace, by
   * the id of the projectile, with the id of the player who fired it. They stay until the next round.
   */
  traces: Map<number, { owner: number; points: { x: number; y: number }[] }>;
}

export const noAction = (): Action => ({ shots: [], previous: [], at: 0, explosions: [], traces: new Map() });

interface Props {
  field: FieldState;
  players: PlayerInfo[];
  /** The speech bubbles to show: the text by the id of the player. */
  bubbles?: Bubbles;
  action?: Action;
  /** The id of the player whose turn it is, in the classic mode: the tank is pointed out. */
  turn?: number | null;
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

  const dirt = context.createLinearGradient(0, 0, 0, height);
  dirt.addColorStop(0, "#8a6a3c");
  dirt.addColorStop(1, "#3a2a18");
  const { scale, left, top } = layout;
  const surface = Math.max(1, Math.round(2 * scale));

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
      context.fillStyle = dirt;
      context.fillRect(x, y, columnWidth, Math.round(top + column[i + 1] * scale) - y);
      // The surface of the dirt is lighter
      context.fillStyle = "#c9a05a";
      context.fillRect(x, y, columnWidth, surface);
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
        context.font = "600 14px system-ui, sans-serif";
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

    // The body: a dome on top of a base
    context.fillStyle = color;
    context.beginPath();
    context.arc(tank.x, pivot.y + 2, TANK_WIDTH / 4, Math.PI, 0);
    context.fill();
    context.fillRect(tank.x - TANK_WIDTH / 2, tank.y - TANK_HEIGHT + 2, TANK_WIDTH, TANK_HEIGHT - 2);
    context.fillStyle = "rgba(0, 0, 0, 0.35)";
    context.fillRect(tank.x - TANK_WIDTH / 2, tank.y - 4, TANK_WIDTH, 4);

    if (player) {
      context.font = "600 14px system-ui, sans-serif";
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
  context.font = "500 14px system-ui, sans-serif";
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

/** How long an explosion is shown, in milliseconds: the bigger it is, the longer. */
const explosionTime = (radius: number) => 400 + radius * 5;
/** The colours of what a weapon does when it goes off, from the middle outwards. */
const EXPLOSION_COLORS: Record<WeaponKind, [string, string, string]> = {
  blast: ["#fff", "#ffe066", "#f0562a"],
  mirv: ["#fff", "#ffe066", "#f0562a"],
  roller: ["#fff", "#ffe066", "#f0562a"],
  dirt: ["#b98a52", "#a3743f", "#8a5f31"],
  riot: ["#fff", "#bfe6ff", "#5aa9e6"],
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

function drawAction(
  context: CanvasRenderingContext2D,
  action: Action,
  tails: Map<number, { x: number; y: number }[]>,
  now: number
) {
  // A trace is a row of dots in the colour of the one who fired, as in the original
  for (const trace of action.traces.values()) {
    context.fillStyle = playerColor(trace.owner);
    for (const point of trace.points) context.fillRect(point.x - 1, point.y - 1, 2, 2);
  }

  const shots = placeShots(action, now);
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
    context.arc(shot.x, shot.y, shot.weapon === "tracer" ? 1.5 : 3, 0, 2 * Math.PI);
    context.fill();
  }

  action.explosions = action.explosions.filter((explosion) => now - explosion.at < explosionTime(explosion.radius));
  for (const explosion of action.explosions) {
    // The ball of fire grows fast to its full size and then fades
    const age = (now - explosion.at) / explosionTime(explosion.radius);
    const radius = Math.max(1, explosion.radius * Math.min(1, age * 4));
    const colors = EXPLOSION_COLORS[findWeapon(explosion.weapon)?.kind ?? "blast"];
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

/** The size of the window in pixels of the device, kept up to date. */
function useWindowSize() {
  const measure = () => {
    const ratio = window.devicePixelRatio || 1;
    return { width: Math.round(window.innerWidth * ratio), height: Math.round(window.innerHeight * ratio) };
  };
  const [size, setSize] = useState(measure);

  useEffect(() => {
    const onResize = () => setSize(measure());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
}

/** The playing field: the terrain, the tanks and what flies, drawn on a canvas that covers the whole window. */
export default function Field({ field, players, bubbles, action, turn }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const background = useRef<{ of: number[][]; width: number; height: number; picture: HTMLCanvasElement } | null>(null);
  const tails = useRef(new Map<number, { x: number; y: number }[]>());
  const shown = useRef(new Map<number, { x: number; y: number; speed: number }>());
  const drawnAt = useRef(performance.now());
  const { width, height } = useWindowSize();
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
      if (action) drawAction(context, action, tails.current, now);
      if (bubbles) drawBubbles(context, seen, bubbles);
      frame = window.requestAnimationFrame(draw);
    };
    draw();
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas ref={canvas} className="field" width={width} height={height} role="img" aria-label="The playing field" />
  );
}
