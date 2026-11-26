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

/** The distance between the points the shape of the ground is drawn through, in pixels. */
const HILL_STEP = 80;
/** How much the ground can rise or fall between two such points, as a part of the height of the field. */
const HILL_SLOPE = 0.16;
/** The ground stays between these, as parts of the height of the field from the top. */
const HIGHEST = 0.3;
const LOWEST = 0.88;
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

/** A terrain of hills and valleys. */
export function generateTerrain(width: number, height: number, random: Random): Terrain {
  const clamp = (y: number) => Math.min(LOWEST * height, Math.max(HIGHEST * height, y));
  const hills = curve(width, HILL_STEP, (previous) =>
    previous === null ? (0.45 + 0.3 * random()) * height : clamp(previous + (random() * 2 - 1) * HILL_SLOPE * height)
  );
  const bumps = curve(width, BUMP_STEP, () => (random() * 2 - 1) * BUMP_HEIGHT);

  return hills.map((y, x) => [Math.round(clamp(y + bumps[x])), height]);
}

/** The y coordinate of the top of the highest dirt of a column: where something that falls from the sky lands. */
export function groundAt(terrain: Terrain, x: number, height: number) {
  const column = terrain[Math.min(terrain.length - 1, Math.max(0, Math.round(x)))];
  return column.length > 0 ? column[0] : height;
}

/** Makes the ground level from x - halfWidth to x + halfWidth, at the height it has at x. */
export function flatten(terrain: Terrain, x: number, halfWidth: number, height: number) {
  const top = groundAt(terrain, x, height);
  const from = Math.max(0, Math.round(x - halfWidth));
  const to = Math.min(terrain.length - 1, Math.round(x + halfWidth));
  for (let column = from; column <= to; column++) terrain[column] = [top, height];
}
