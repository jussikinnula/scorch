import { FieldState, TankState } from "../protocol";
import { TANK_HEIGHT, TANK_WIDTH, TURRET_LENGTH } from "./field";
import { DEFAULT_WEAPON, findWeapon, MIRV_WARHEADS, Weapon, WEAPONS } from "../weapons";
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
/**
 * How much a unit of wind pushes a projectile sideways, in pixels a second squared. Measured from
 * the original (docs/ORIGINAL.md, "Wind"): 0.0005 pixels a step squared at 640x480, so that a wind
 * of 400 pushes sideways as hard as gravity pulls down.
 */
export const WIND_PER_UNIT = (0.0005 * ORIGINAL_SCALE) / (ORIGINAL_STEP * ORIGINAL_STEP);
/** The speed of a projectile for each unit of power, in pixels a second. */
export const SPEED_PER_POWER = (0.02 * ORIGINAL_SCALE) / ORIGINAL_STEP;
/** How far past the sides of the field a projectile is followed before it counts as a miss (Borders Extend). */
export const BORDER = 75 * ORIGINAL_SCALE;
/** The radius of the explosion of a weapon in pixels of this field. */
export const blastRadius = (weapon: Weapon) => weapon.radius * ORIGINAL_SCALE;
/** The radius of the explosion of the weapon everyone has, the Baby Missile. */
export const BABY_MISSILE_RADIUS = blastRadius(WEAPONS[0]);
/**
 * How much faster or slower each warhead of a MIRV goes sideways than the one next to it, in pixels
 * a second. Our own value: the spread of the original is not measured yet.
 */
export const MIRV_SPREAD = 40;
/** The fastest a roller starts to roll at, whatever speed it landed with, in pixels a second. */
export const ROLLER_START_SPEED = 200;
/** The fastest a roller rolls, in pixels a second. */
export const ROLLER_MAX_SPEED = 300;
/** The speed a roller sets off with when it turns back down a slope it could not climb, in pixels a second. */
export const ROLLER_TURN_SPEED = 40;
/** How much the ground slows a roller, as a part of gravity. Our own value, as the rest of the rolling: the original is not measured yet. */
export const ROLLER_FRICTION = 0.25;
/**
 * A roller feels the slope of the ground over this many pixels ahead, not the step from a pixel to
 * the next: the ground is made of whole pixels, and a gentle slope is a staircase of them.
 */
const ROLLER_REACH = 6;
/** A step up in the ground higher than this, in pixels, is a wall to a roller. */
const ROLLER_WALL = 6;
/** How long a roller rolls at most before it explodes, in seconds. */
export const ROLLER_TIME = 6;
/** How high above the ground a rolling projectile is shown, in pixels. */
const ROLLER_HEIGHT = 3;

/**
 * The energy a tank loses for each pixel it falls when the ground goes from under it, in pixels of
 * the original. Our own value: the original has the damage (Tanks Fall), but it is not measured.
 */
export const FALL_DAMAGE = 1;

/** A projectile in the air, or one that rolls along the ground. */
export interface Shot {
  id: number;
  /** The id of the player who fired it. */
  owner: number;
  /** The id of the weapon. */
  weapon: string;
  /** A warhead of a MIRV that has split: it does not split again. */
  warhead?: boolean;
  /**
   * A roller that has landed and rolls along the ground: which way (-1 is left), its speed squared
   * in pixels a second, how far into the next pixel it is, and for how long it has rolled in seconds.
   */
  roll?: { direction: 1 | -1; speed2: number; progress: number; time: number };
  x: number;
  y: number;
  /** The speed in pixels a second. y grows downwards. */
  vx: number;
  vy: number;
}

/** Something that happened during a step of the simulation. */
export type ShotEvent =
  /** A projectile exploded. */
  | { event: "explode"; x: number; y: number; radius: number; weapon: string }
  /** The terrain changed. */
  | { event: "terrain"; ops: TerrainOp[] }
  /**
   * A tank was damaged, by an explosion or by falling when the ground went from under it. Its energy
   * is what is left; 0 means it was destroyed. The amount is how much it lost, and "by" the id of
   * the player whose shot did it.
   */
  | { event: "damage"; id: number; energy: number; amount: number; by: number };

/** The tip of the turret of a tank: where its projectiles start. */
export function turretTip(tank: TankState) {
  const angle = (tank.angle * Math.PI) / 180;
  return {
    x: tank.x + Math.cos(angle) * TURRET_LENGTH,
    y: tank.y - TANK_HEIGHT - Math.sin(angle) * TURRET_LENGTH
  };
}

/** A projectile that a tank fires with its aim. */
export function launch(tank: TankState, id: number, weapon: string = DEFAULT_WEAPON): Shot {
  const angle = (tank.angle * Math.PI) / 180;
  const speed = tank.power * SPEED_PER_POWER;
  const velocity = { vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed };
  return { id, owner: tank.id, weapon, ...turretTip(tank), ...velocity };
}

/** Whether a point is inside the body of a tank. A wreck does not stop a projectile. */
const hitsTank = (tank: TankState, x: number, y: number) =>
  tank.energy > 0 && Math.abs(x - tank.x) <= TANK_WIDTH / 2 && y <= tank.y && y >= tank.y - TANK_HEIGHT;

/**
 * The energy an explosion takes from a tank: the most at the middle of the tank, less in proportion
 * to the distance from it, and none a blast radius away or further.
 *
 * The one clean measurement from the original fits this: a Baby Missile whose crater was 7 pixels
 * from the middle of a tank took 37 of its energy (docs/ORIGINAL.md, "Damage"). How much a weapon
 * takes at the most is its own number (shared/weapons.ts).
 *
 * @param most What the explosion takes at the middle of the tank.
 */
export function damageTo(tank: TankState, x: number, y: number, radius: number, most = 100) {
  const distance = Math.hypot(x - tank.x, y - (tank.y - TANK_HEIGHT / 2));
  return distance >= radius ? 0 : Math.round(most * (1 - distance / radius));
}

/**
 * A weapon goes off at a point of the field.
 *
 * - A blast destroys the dirt around it and damages the tanks it reaches.
 * - A riot bomb destroys the dirt but leaves the tanks alone.
 * - A dirt weapon makes a ball of dirt. A tank under it is buried: it has to shoot its way out,
 *   and its own explosion right at the turret hurts it.
 * - A tracer does nothing.
 *
 * After any of them the dirt that has nothing under it falls, and the tanks come down with the
 * ground: a fall takes energy from a tank too, by its height.
 */
function detonate(field: FieldState, weapon: Weapon, at: { x: number; y: number }, by: number, events: ShotEvent[]) {
  if (weapon.kind === "tracer") return;
  const r = blastRadius(weapon);
  const ops: TerrainOp[] = [{ op: weapon.kind === "dirt" ? "fill" : "carve", ...at, r }, { op: "settle" }];
  ops.forEach((op) => applyTerrainOp(field.terrain, op, field.height));
  events.push({ event: "explode", ...at, radius: r, weapon: weapon.id });
  for (const tank of field.tanks) {
    let amount = 0;
    if (weapon.damage > 0 && tank.energy > 0) {
      // The damage is by where the tank was when the explosion happened, before it came down
      amount = damageTo(tank, at.x, at.y, r, weapon.damage);
    }
    // A tank falls with the ground under it, and the fall hurts it. Dirt that lands on it does not lift it.
    const fall = Math.max(0, groundAt(field.terrain, tank.x, field.height) - tank.y);
    tank.y += fall;
    amount = Math.min(tank.energy, amount + Math.floor((fall / ORIGINAL_SCALE) * FALL_DAMAGE));
    if (amount > 0) {
      tank.energy -= amount;
      // A tank cannot fire harder than its energy allows
      tank.power = Math.min(tank.power, tank.energy * 10);
      events.push({ event: "damage", id: tank.id, energy: tank.energy, amount, by });
    }
  }
  events.push({ event: "terrain", ops });
}

/**
 * Moves a roller that is on the ground one step of the simulation forward. It rolls like a ball:
 * going down speeds it up, going up and the ground itself slow it down. Where it cannot go on it
 * turns back if the ground falls behind it, and explodes if it does not: it is in a valley. It also
 * explodes when it reaches a tank, and when it has rolled for too long.
 *
 * @returns The roller after the step, or null when it has exploded or rolled off the field.
 */
function rollShot(field: FieldState, shot: Shot, weapon: Weapon, events: ShotEvent[]): Shot | null {
  const roll = { ...shot.roll! };
  const ground = (x: number) => groundAt(field.terrain, x, field.height);
  const explode = (x: number) => {
    detonate(field, weapon, { x, y: ground(x) }, shot.owner, events);
    return null;
  };
  const atTank = (x: number) =>
    field.tanks.some(
      (tank) => tank.energy > 0 && Math.abs(x - tank.x) <= TANK_WIDTH / 2 && Math.abs(ground(x) - tank.y) <= TANK_HEIGHT
    );

  let x = Math.round(shot.x);
  roll.time += 1 / STEPS_PER_SECOND;
  if (roll.time > ROLLER_TIME || atTank(x)) return explode(x);

  roll.progress += Math.max(ROLLER_TURN_SPEED, Math.sqrt(roll.speed2)) / STEPS_PER_SECOND;
  for (; roll.progress >= 1; roll.progress -= 1) {
    let next = x + roll.direction;
    if (next < 0 || next >= field.width) {
      // At the edge of the field a roller does what the walls say: rolls out, turns back or comes in from the other side
      if (field.walls === "none") return null;
      if (field.walls === "rubber") {
        roll.direction = roll.direction === 1 ? -1 : 1;
        continue;
      }
      next = next < 0 ? field.width - 1 : 0;
      x = next;
      continue;
    }
    // y grows downwards: a positive drop is downhill
    const drop = (ground(x + roll.direction * ROLLER_REACH) - ground(x)) / ROLLER_REACH;
    const behind = (ground(x - roll.direction * ROLLER_REACH) - ground(x)) / ROLLER_REACH;
    const speed2 = roll.speed2 + 2 * GRAVITY * (drop - ROLLER_FRICTION);
    if (speed2 > 0 && ground(x) - ground(next) <= ROLLER_WALL) {
      x = next;
      roll.speed2 = Math.min(speed2, ROLLER_MAX_SPEED ** 2);
      if (atTank(x)) return explode(x);
    } else if (behind > ROLLER_FRICTION) {
      roll.direction = roll.direction === 1 ? -1 : 1;
      roll.speed2 = ROLLER_TURN_SPEED ** 2;
    } else {
      return explode(x);
    }
  }
  return { ...shot, roll, x, y: ground(x) - ROLLER_HEIGHT, vx: 0, vy: 0 };
}

/**
 * Moves the projectiles one step of the simulation forward, and makes what follows happen to the
 * field: an explosion destroys the dirt around it, the dirt above falls, and the tanks come down
 * with the ground.
 *
 * @param nextId Gives the id of a new projectile: the warheads of a MIRV are new ones.
 * @returns The projectiles that are still in the air, and what happened.
 */
export function stepShots(
  field: FieldState,
  shots: Shot[],
  nextId: () => number = (() => {
    let id = Math.max(0, ...shots.map((shot) => shot.id));
    return () => ++id;
  })()
): { shots: Shot[]; events: ShotEvent[] } {
  const dt = 1 / STEPS_PER_SECOND;
  const flying: Shot[] = [];
  const events: ShotEvent[] = [];

  for (const shot of shots) {
    const weapon = findWeapon(shot.weapon) ?? WEAPONS[0];
    if (shot.roll) {
      const rolling = rollShot(field, shot, weapon, events);
      if (rolling) flying.push(rolling);
      continue;
    }
    let vx = shot.vx + field.wind * WIND_PER_UNIT * dt;
    let vy = shot.vy + GRAVITY * dt;
    const from = { x: shot.x, y: shot.y };
    const to = { x: shot.x + vx * dt, y: shot.y + vy * dt };
    if (field.walls === "rubber") {
      // Rubber walls: the sides and the top of the field throw a projectile back as fast as it came
      if (to.x < 0 || to.x > field.width) {
        to.x = to.x < 0 ? -to.x : 2 * field.width - to.x;
        vx = -vx;
      }
      if (to.y < 0) {
        to.y = -to.y;
        vy = -vy;
      }
    } else if (field.walls === "wraparound" && (to.x < 0 || to.x >= field.width)) {
      // What leaves from one side comes in from the other, at the same height and speed
      const shift = to.x < 0 ? field.width : -field.width;
      from.x += shift;
      to.x += shift;
    }

    // The way from the old place to the new one is walked a pixel at a time, so that a fast
    // projectile does not jump over a thin wall or a tank
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)));
    let hit: { x: number; y: number; tank: boolean } | null = null;
    for (let i = 1; i <= steps && !hit; i++) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const y = from.y + ((to.y - from.y) * i) / steps;
      const tank = field.tanks.some((candidate) => hitsTank(candidate, x, y));
      if (tank || isDirt(field.terrain, x, y)) hit = { x, y, tank };
    }

    if (hit && weapon.kind === "roller" && !hit.tank) {
      // A roller that lands on the ground starts to roll, the way it was going
      const x = Math.min(field.width - 1, Math.max(0, Math.round(hit.x)));
      const speed2 = Math.min(Math.abs(vx), ROLLER_START_SPEED) ** 2;
      const roll = { direction: vx < 0 ? (-1 as const) : (1 as const), speed2, progress: 0, time: 0 };
      const y = groundAt(field.terrain, x, field.height) - ROLLER_HEIGHT;
      flying.push({ ...shot, x, y, vx: 0, vy: 0, roll });
    } else if (hit) {
      // A MIRV that hits something on its way up goes off as the one warhead it still is
      detonate(field, weapon, { x: Math.round(hit.x), y: Math.round(hit.y) }, shot.owner, events);
    } else if (to.x < -BORDER || to.x > field.width + BORDER || to.y >= field.height) {
      // Past the sides or the bottom a projectile is gone. Above the field it flies on: it comes back down.
    } else if (weapon.kind === "mirv" && !shot.warhead && shot.vy < 0 && vy >= 0) {
      // At the top of its flight a MIRV splits into warheads that spread sideways
      for (let i = 0; i < MIRV_WARHEADS; i++) {
        const spread = (i - (MIRV_WARHEADS - 1) / 2) * MIRV_SPREAD;
        flying.push({ ...shot, ...to, id: i === 0 ? shot.id : nextId(), warhead: true, vx: vx + spread, vy });
      }
    } else {
      flying.push({ ...shot, ...to, vx, vy });
    }
  }
  return { shots: flying, events };
}
