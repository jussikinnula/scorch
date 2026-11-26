import React, { useEffect, useRef, useState } from "react";

import { FieldState, PlayerInfo } from "../../shared/protocol";
import { TANK_HEIGHT, TANK_WIDTH, TURRET_LENGTH } from "../../shared/sim/field";
import { playerColor } from "../colors";
import { Bubbles } from "../hooks/useBubbles";

interface Props {
  field: FieldState;
  players: PlayerInfo[];
  /** The speech bubbles to show: the text by the id of the player. */
  bubbles?: Bubbles;
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

function drawTanks(context: CanvasRenderingContext2D, field: FieldState, players: PlayerInfo[]) {
  for (const tank of field.tanks) {
    const player = players.find((candidate) => candidate.id === tank.id);
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

/** The playing field: the terrain and the tanks, drawn on a canvas that covers the whole window. */
export default function Field({ field, players, bubbles }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const background = useRef<{ of: number[][]; width: number; height: number; picture: HTMLCanvasElement } | null>(null);
  const { width, height } = useWindowSize();

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const layout = layoutField(field, width, height);

    // The background is drawn again only when the terrain or the size of the window has changed
    const drawn = background.current;
    if (!drawn || drawn.of !== field.terrain || drawn.width !== width || drawn.height !== height) {
      background.current = { of: field.terrain, width, height, picture: drawBackground(field, width, height, layout) };
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(background.current!.picture, 0, 0);
    context.setTransform(layout.scale, 0, 0, layout.scale, layout.left, layout.top);
    drawTanks(context, field, players);
    if (bubbles) drawBubbles(context, field, bubbles);
  }, [field, players, bubbles, width, height]);

  return (
    <canvas ref={canvas} className="field" width={width} height={height} role="img" aria-label="The playing field" />
  );
}
