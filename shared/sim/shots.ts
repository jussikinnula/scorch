import { FieldState, TankState } from "../protocol";
import { TANK_HEIGHT, TANK_WIDTH, TURRET_LENGTH } from "./field";
import { groundAt, isDirt, TerrainOp, applyTerrainOp } from "./terrain";

/**
 * The flight of the projectiles.
 *
 * The numbers come from the original game (docs/ORIGINAL.md, "Ballistics"): at 640x480 a projectile
 * leaves at 0.02 pixels a step for each unit of power, and gravity is 0.2 pixels a step squared.
 * This field is twice as wide as that screen, so a pixel of the original is two of ours. How long a
 * step of the original takes is ours to choose: with this, a shot across the whole field at 45
 * degrees is in the air for three seconds.
 */
const ORIGINAL_SCALE = 2;
const ORIGINAL_STEP = 0.0375;

/** How many times a second the simulation moves the projectiles. */
export const STEPS_PER_SECOND = 60;
/** The pull of gravity, in pixels a second squared. */
export const GRAVITY = (0.2 * ORIGINAL_SCALE) / (ORIGINAL_STEP * ORIGINAL_STEP);
/** The speed of a projectile for each unit of power, in pixels a second. */
export const SPEED_PER_POWER = (0.02 * ORIGINAL_SCALE) / ORIGINAL_STEP;
/** How far past the sides of the field a projectile is followed before it counts as a miss (Borders Extend). */
export const BORDER = 75 * ORIGINAL_SCALE;
/** The radius of the explosion of the only weapon so far, the Baby Missile. */
export const BABY_MISSILE_RADIUS = 10 * ORIGINAL_SCALE;

/** A projectile in the air. */
export interface Shot {
  id: number;
  /** The id of the player who fired it. */
  owner: number;
  x: number;
  y: number;
  /** The speed in pixels a second. y grows downwards. */
  vx: number;
  vy: number;
}

/** Something that happened during a step of the simulation. */
export type ShotEvent =
  /** A projectile exploded. */
  | { event: "explode"; x: number; y: number; radius: number }
  /** The terrain changed. */
  | { event: "terrain"; ops: TerrainOp[] };

/** The tip of the turret of a tank: where its projectiles start. */
export function turretTip(tank: TankState) {
  const angle = (tank.angle * Math.PI) / 180;
  return {
    x: tank.x + Math.cos(angle) * TURRET_LENGTH,
    y: tank.y - TANK_HEIGHT - Math.sin(angle) * TURRET_LENGTH
  };
}

/** A projectile that a tank fires with its aim. */
export function launch(tank: TankState, id: number): Shot {
  const angle = (tank.angle * Math.PI) / 180;
  const speed = tank.power * SPEED_PER_POWER;
  return { id, owner: tank.id, ...turretTip(tank), vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed };
}

/** Whether a point is inside the body of a tank. */
const hitsTank = (tank: TankState, x: number, y: number) =>
  Math.abs(x - tank.x) <= TANK_WIDTH / 2 && y <= tank.y && y >= tank.y - TANK_HEIGHT;

/**
 * Moves the projectiles one step of the simulation forward, and makes what follows happen to the
 * field: an explosion destroys the dirt around it, the dirt above falls, and the tanks come down
 * with the ground.
 *
 * @returns The projectiles that are still in the air, and what happened.
 */
export function stepShots(field: FieldState, shots: Shot[]): { shots: Shot[]; events: ShotEvent[] } {
  const dt = 1 / STEPS_PER_SECOND;
  const flying: Shot[] = [];
  const events: ShotEvent[] = [];

  for (const shot of shots) {
    const vy = shot.vy + GRAVITY * dt;
    const to = { x: shot.x + shot.vx * dt, y: shot.y + vy * dt };

    // The way from the old place to the new one is walked a pixel at a time, so that a fast
    // projectile does not jump over a thin wall or a tank
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - shot.x, to.y - shot.y)));
    let hit: { x: number; y: number } | null = null;
    for (let i = 1; i <= steps && !hit; i++) {
      const x = shot.x + ((to.x - shot.x) * i) / steps;
      const y = shot.y + ((to.y - shot.y) * i) / steps;
      if (isDirt(field.terrain, x, y) || field.tanks.some((tank) => hitsTank(tank, x, y))) hit = { x, y };
    }

    if (hit) {
      const at = { x: Math.round(hit.x), y: Math.round(hit.y) };
      const ops: TerrainOp[] = [{ op: "carve", ...at, r: BABY_MISSILE_RADIUS }, { op: "settle" }];
      ops.forEach((op) => applyTerrainOp(field.terrain, op, field.height));
      for (const tank of field.tanks) tank.y = groundAt(field.terrain, tank.x, field.height);
      events.push({ event: "explode", ...at, radius: BABY_MISSILE_RADIUS }, { event: "terrain", ops });
    } else if (to.x >= -BORDER && to.x <= field.width + BORDER && to.y < field.height) {
      // Above the field a projectile flies on: it comes back down. Past the sides or the bottom it is gone.
      flying.push({ ...shot, ...to, vy });
    }
  }
  return { shots: flying, events };
}
