import { TerrainChange } from "../protocol";
import { Random } from "./random";

/**
 * The dirt of the playing field, column by column from the left. A column is a list of pairs of
 * y coordinates, from the top down: dirt from the first (inclusive) to the second (exclusive) of
 * each pair. y grows downwards, and the bottom of the field is at its height.
 *
 * For now every column is plain ground, i.e. one pair. The format already has room for tunnels
 * and for dirt in the air.
 */
export type Terrain = number[][];

/**
 * The shape of the ground is a sum of waves: wide ones for the hills and the valleys, narrower ones
 * on top of them for the knolls and the dips. The distance between the points each wave is drawn
 * through, in pixels, and how high the wave is compared to the widest.
 */
const WAVES: [number, number][] = [
  [320, 1],
  [128, 0.5],
  [48, 0.12]
];
/**
 * The highest hill and the deepest valley of a terrain are somewhere between these, as parts of the
 * height of the field from the top: every terrain uses most of the height of the screen.
 */
const HIGHEST = [0.2, 0.34];
const LOWEST = [0.8, 0.93];
/** The size of the small bumps on top of the hills, in pixels. */
const BUMP_STEP = 12;
const BUMP_HEIGHT = 5;

/** A value between a and b, with a smooth start and end as t goes from 0 to 1. */
const smooth = (a: number, b: number, t: number) => a + (b - a) * t * t * (3 - 2 * t);

/** Random values a step apart, joined smoothly: the value at each x from 0 to width - 1. */
function curve(width: number, step: number, next: (previous: number | null) => number) {
  const points: number[] = [];
  for (let i = 0; i <= Math.ceil(width / step); i++) points.push(next(points[i - 1] ?? null));

  const values: number[] = [];
  for (let x = 0; x < width; x++) {
    const i = Math.floor(x / step);
    values.push(smooth(points[i], points[i + 1], (x % step) / step));
  }
  return values;
}

/**
 * A terrain of hills and valleys. The shape is drawn first and then stretched from its highest point
 * to its lowest over the part of the height that this terrain uses: so there are always both high
 * hills and deep valleys, and no plateau where the shape would have gone past a limit.
 */
export function generateTerrain(width: number, height: number, random: Random): Terrain {
  const waves = WAVES.map(([step, size]) => curve(width, step, () => (random() * 2 - 1) * size));
  const shape = Array.from({ length: width }, (_, x) => waves.reduce((sum, wave) => sum + wave[x], 0));
  const [high, low] = [Math.min(...shape), Math.max(...shape)];
  const top = (HIGHEST[0] + (HIGHEST[1] - HIGHEST[0]) * random()) * height;
  const bottom = (LOWEST[0] + (LOWEST[1] - LOWEST[0]) * random()) * height;
  const bumps = curve(width, BUMP_STEP, () => (random() * 2 - 1) * BUMP_HEIGHT);

  return shape.map((value, x) => {
    const y = top + ((value - high) / Math.max(low - high, 1e-9)) * (bottom - top);
    return [Math.round(y + bumps[x]), height];
  });
}

/** The y coordinate of the top of the highest dirt of a column: where something that falls from the sky lands. */
export function groundAt(terrain: Terrain, x: number, height: number) {
  const column = terrain[Math.min(terrain.length - 1, Math.max(0, Math.round(x)))];
  return column.length > 0 ? column[0] : height;
}

/**
 * The y coordinate of what a tank whose bottom is at y stands on or falls to in a column: the top of
 * the first dirt that goes on below it. Dirt that hangs above the tank is not it. A tank inside dirt
 * stays where it is.
 */
export function groundBelow(terrain: Terrain, x: number, y: number, height: number) {
  const column = terrain[Math.min(terrain.length - 1, Math.max(0, Math.round(x)))];
  for (let i = 0; i + 1 < column.length; i += 2) if (column[i + 1] > y) return Math.max(y, column[i]);
  return Math.max(y, height);
}

/** Makes the ground level from x - halfWidth to x + halfWidth, at the height it has at x. */
export function flatten(terrain: Terrain, x: number, halfWidth: number, height: number) {
  const top = groundAt(terrain, x, height);
  const from = Math.max(0, Math.round(x - halfWidth));
  const to = Math.min(terrain.length - 1, Math.round(x + halfWidth));
  for (let column = from; column <= to; column++) terrain[column] = [top, height];
}

/** Whether there is dirt at a point. Outside the field there is none. */
export function isDirt(terrain: Terrain, x: number, y: number) {
  const column = terrain[Math.floor(x)];
  if (!column) return false;
  for (let i = 0; i + 1 < column.length; i += 2) if (y >= column[i] && y < column[i + 1]) return true;
  return false;
}

/**
 * A change to the dirt. The server makes the changes and tells them to those who show the field,
 * who make the same changes to their own copy of the terrain: the result must be the same
 * everywhere, so the changes use only whole numbers.
 */
export type TerrainOp = TerrainChange;

/** Removes the dirt of a column from one y (inclusive) to another (exclusive). */
function cutColumn(column: number[], from: number, to: number) {
  const cut: number[] = [];
  for (let i = 0; i + 1 < column.length; i += 2) {
    const [top, bottom] = [column[i], column[i + 1]];
    if (top < from) cut.push(top, Math.min(bottom, from));
    if (bottom > to) cut.push(Math.max(top, to), bottom);
  }
  return cut;
}

/** Destroys the dirt inside a circle. What was above it is left hanging until the terrain is settled. */
export function carve(terrain: Terrain, x: number, y: number, r: number) {
  for (let dx = -r; dx <= r; dx++) {
    const column = terrain[x + dx];
    if (!column) continue;
    const half = Math.floor(Math.sqrt(r * r - dx * dx));
    terrain[x + dx] = cutColumn(column, y - half, y + half + 1);
  }
}

/** Adds dirt to a column from one y (inclusive) to another (exclusive), joining it with what it touches. */
function fillColumn(column: number[], from: number, to: number) {
  const filled: number[] = [];
  let [top, bottom] = [from, to];
  let placed = false;
  for (let i = 0; i + 1 < column.length; i += 2) {
    const [runTop, runBottom] = [column[i], column[i + 1]];
    if (runBottom < top) filled.push(runTop, runBottom);
    else if (runTop > bottom) {
      if (!placed) filled.push(top, bottom);
      placed = true;
      filled.push(runTop, runBottom);
    } else {
      top = Math.min(top, runTop);
      bottom = Math.max(bottom, runBottom);
    }
  }
  if (!placed) filled.push(top, bottom);
  return filled;
}

/** Makes a ball of dirt. It hangs where it was made until the terrain is settled. */
export function fill(terrain: Terrain, x: number, y: number, r: number, height: number) {
  for (let dx = -r; dx <= r; dx++) {
    const column = terrain[x + dx];
    if (!column) continue;
    const half = Math.floor(Math.sqrt(r * r - dx * dx));
    const [from, to] = [Math.max(0, y - half), Math.min(height, y + half + 1)];
    if (from < to) terrain[x + dx] = fillColumn(column, from, to);
  }
}

/** Over how many columns liquid dirt rises by a pixel when it has set: how runny it is. Our own value. */
export const POUR_REACH = 8;

/**
 * Lets something liquid flow over a surface. It is poured a pixel at a time at a column: each pixel
 * flows downhill for as long as the surface goes down somewhere within the reach, and stays where it
 * does not. So the liquid fills the holes it finds and lies nearly level, rising by a pixel over as
 * many columns as the reach. What flows past a side of the surface is gone.
 *
 * Only whole numbers are used, so that the result is the same everywhere.
 *
 * @param tops The y of the top of the surface at each column; y grows downwards. They are changed: what is poured lies on top.
 * @param reach How runny the liquid is: the more, the thinner and the wider it lies.
 * @param sticks For a liquid that sticks to what it flows over: the surface under it, and how thick a
 *   film of it stays on each column it passes, in pixels. Such a liquid coats a slope on its way down.
 */
export function flow(
  tops: number[],
  x: number,
  amount: number,
  reach: number,
  sticks?: { under: number[]; film: number }
) {
  const start = Math.min(tops.length - 1, Math.max(0, Math.round(x)));
  // Whether the surface goes down that way within the reach, with nothing higher than this column before that
  const down = (from: number, way: number) => {
    for (let k = 1; k <= reach; k++) {
      const next = from + way * k;
      if (next < 0 || next >= tops.length) return true;
      if (tops[next] < tops[from]) return false;
      if (tops[next] > tops[from]) return true;
    }
    return false;
  };
  for (let pixel = 0; pixel < amount; pixel++) {
    let at = start;
    // The first way is the one that goes down; when both do, every other pixel goes each way
    let way = pixel % 2 === 0 ? 1 : -1;
    let gone = false;
    for (let steps = 0; steps < 2 * tops.length; steps++) {
      // What sticks stays where there is not yet a film of it
      if (sticks && sticks.under[at] - tops[at] < sticks.film) break;
      if (!down(at, way)) {
        if (!down(at, -way)) break;
        way = -way;
      }
      at += way;
      if (at < 0 || at >= tops.length) {
        gone = true;
        break;
      }
    }
    if (!gone && tops[at] > 0) tops[at] -= 1;
  }
}

/** Pours liquid dirt on the ground at a column: it flows, fills holes and becomes dirt where it stays. */
export function pour(terrain: Terrain, x: number, amount: number, height: number) {
  const before = terrain.map((column) => (column.length > 0 ? column[0] : height));
  const tops = [...before];
  flow(tops, x, amount, POUR_REACH);
  tops.forEach((top, column) => {
    if (top < before[column]) terrain[column] = fillColumn(terrain[column], top, before[column]);
  });
}

/** Lets the dirt fall: after it each column is one pile on the bottom of the field, of all its dirt. */
export function settle(terrain: Terrain, height: number) {
  terrain.forEach((column, x) => {
    if (column.length <= 2 && (column.length === 0 || column[1] === height)) return;
    let dirt = 0;
    for (let i = 0; i + 1 < column.length; i += 2) dirt += column[i + 1] - column[i];
    terrain[x] = dirt > 0 ? [height - dirt, height] : [];
  });
}

/** Makes a change to the terrain. */
export function applyTerrainOp(terrain: Terrain, op: TerrainOp, height: number) {
  if (op.op === "carve") carve(terrain, op.x, op.y, op.r);
  else if (op.op === "fill") fill(terrain, op.x, op.y, op.r, height);
  else if (op.op === "pour") pour(terrain, op.x, op.amount, height);
  else settle(terrain, height);
}
