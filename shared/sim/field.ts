import { FieldState, MAX_ENERGY, MAX_POWER, TankState } from "../protocol";
import { Random } from "./random";
import { flatten, generateTerrain, groundAt } from "./terrain";

/** The size of the playing field in pixels. The screens scale it to their size. */
export const FIELD_WIDTH = 1280;
export const FIELD_HEIGHT = 720;

/** The size of a tank in pixels of the playing field. */
export const TANK_WIDTH = 28;
export const TANK_HEIGHT = 12;
export const TURRET_LENGTH = 18;

/** How far from the edges of the field the tanks are at least, in pixels. */
const EDGE = 40;
/** The aim of a new tank: up and towards the middle of the field, at half power. */
const START_ANGLE = 60;
const START_POWER = MAX_POWER / 2;

/** Puts a tank on the ground at x, on a level spot made for it. */
function placeTank(field: FieldState, id: number, x: number): TankState {
  flatten(field.terrain, x, TANK_WIDTH / 2 + 2, field.height);
  const tank: TankState = {
    id,
    x,
    y: groundAt(field.terrain, x, field.height),
    angle: x < field.width / 2 ? START_ANGLE : 180 - START_ANGLE,
    power: START_POWER,
    energy: MAX_ENERGY
  };
  field.tanks.push(tank);
  field.tanks.sort((a, b) => a.id - b.id);
  return tank;
}

/**
 * A new playing field: a terrain, and the tanks of the players spread more or less evenly across
 * it, in a random order.
 */
export function createField(players: number[], random: Random): FieldState {
  const field: FieldState = {
    width: FIELD_WIDTH,
    height: FIELD_HEIGHT,
    terrain: generateTerrain(FIELD_WIDTH, FIELD_HEIGHT, random),
    tanks: []
  };

  // The order of the tanks from the left is shuffled
  const order = [...players];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  // Each tank is somewhere around the middle of its own slice of the field
  const slot = (FIELD_WIDTH - 2 * EDGE) / Math.max(1, order.length);
  order.forEach((id, index) => {
    const x = EDGE + slot * (index + 0.5) + (random() - 0.5) * slot * 0.4;
    placeTank(field, id, Math.round(x));
  });
  return field;
}

/** Adds a tank for a player who joined in the middle of a game: in the widest gap between the others. */
export function addTank(field: FieldState, id: number): TankState {
  const taken = [EDGE, ...field.tanks.map((tank) => tank.x).sort((a, b) => a - b), FIELD_WIDTH - EDGE];
  let x = FIELD_WIDTH / 2;
  let widest = -1;
  for (let i = 1; i < taken.length; i++) {
    if (taken[i] - taken[i - 1] > widest) {
      widest = taken[i] - taken[i - 1];
      x = (taken[i] + taken[i - 1]) / 2;
    }
  }
  return placeTank(field, id, Math.round(x));
}

/** Takes the tank of a player off the field. */
export function removeTank(field: FieldState, id: number) {
  field.tanks = field.tanks.filter((tank) => tank.id !== id);
}
