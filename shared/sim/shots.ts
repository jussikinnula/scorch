import { FieldState, TankState } from "../protocol";
import { TANK_HEIGHT, TANK_WIDTH, TURRET_LENGTH } from "./field";
import { PARACHUTE_THRESHOLD } from "../accessories";
import {
  DEFAULT_WEAPON,
  findWeapon,
  FUNKY_BOMBS,
  FUNKY_REACH,
  LEAP_FROG_RADII,
  MIRV_WARHEADS,
  Weapon,
  WEAPONS
} from "../weapons";
import { flow, groundAt, groundBelow, isDirt, TerrainOp, applyTerrainOp } from "./terrain";

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
/**
 * How a Leap Frog leaps on after an explosion: upwards at this speed, in pixels a second, and
 * sideways the way it was going at a part of the speed it came with, but never slower than the
 * least. Our own values: the leap of the original is not measured.
 */
export const LEAP_SPEED = 150;
export const LEAP_KEEP = 0.5;
export const LEAP_LEAST = 50;
/** How fast a Funky Bomb throws its bombs upwards, in pixels a second: a little less or more for each. Our own value. */
export const FUNKY_SPEED = 220;
/** How close to the turret a charge starts to destroy dirt from, as the radius of what is destroyed there, in pixels. */
const CHARGE_START = 8;
/** How large the flash of an Earth Disrupter is shown, in pixels. It destroys nothing. */
const DISRUPTER_FLASH = 16;
/** How many circles the wedge of a charge is made of. */
const CHARGE_CIRCLES = 8;
/** How far from the end of the turret the dirt of a Dirt Charge starts, in pixels: it is thrown, and does not bury the turret that threw it. */
const DIRT_CHARGE_START = 24;
/** How fast liquid dirt oozes out of where it landed, in pixels of dirt a second. Our own value. */
export const POUR_SPEED = 6000;
/** How fast Napalm spills out of where it landed, in pixels of it a second. Our own value. */
export const NAPALM_SPEED = 1200;
/** Every how many steps of the simulation it is told where Napalm that still spreads burns. */
const SPILL_TELL = 3;
/** Over how many columns Napalm rises by a pixel where it lies: it is runnier than liquid dirt. Our own value. */
export const NAPALM_REACH = 16;
/** How thick a film of Napalm sticks to the ground it flows over, in pixels: a slope burns too, not only the hollow under it. Our own value. */
export const NAPALM_FILM = 3;
/** How far beside a tank Napalm still burns it, in pixels. Our own value. */
export const NAPALM_BESIDE = 16;
/** How high above its surface the flames of Napalm that lies this deep reach, in pixels: about as high as they are drawn. */
const flameReach = (depth: number) => 6 + depth * 3;
/** How deep Napalm lies on a tank, in pixels, when it takes all that the weapon can take. Our own value. */
export const NAPALM_DEEP = 6;
/** How fast the head of a tunnel eats its way through the dirt, in pixels a second. Our own value. */
export const DIG_SPEED = 100;
/** How many degrees apart the tunnels of a digger are. Our own value. */
export const TUNNEL_FAN = 22;
/** How many degrees down from level the first tunnel of a sandhog goes: the rest are level. Our own value. */
export const SANDHOG_DIVE = 15;
/** Half the width of the tunnels of a sandhog, in pixels of the original game. */
const SANDHOG_TUNNEL = 3;
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
  /** A warhead of a MIRV that has split, or a bomb that a Funky Bomb threw: it does not split again. */
  warhead?: boolean;
  /** How many times a Leap Frog has exploded so far. */
  stage?: number;
  /**
   * A bomb that was thrown from where something else went off: nothing stops it until it has come
   * out of whatever it started inside of, a tank or the ground.
   */
  leaving?: boolean;
  /** Which of the bombs that a Funky Bomb threw this is, from 0. */
  part?: number;
  /**
   * The head of a tunnel that a digger or a sandhog digs: where the tunnel starts, which way it goes
   * in radians, how much of it is dug in pixels, the id of the projectile that it came from, and of
   * a sandhog how many charges it has left after the one at the end of this tunnel.
   */
  /**
   * Napalm that has landed and spills out: how much of it is left, the tops of the ground it flows
   * over, the tops of what lies on that ground so far, and for how many steps it has spilled.
   */
  spill?: { left: number; ground: number[]; tops: number[]; steps: number };
  /** Liquid dirt that has landed and oozes out: how much of it is left, in pixels of dirt. */
  pour?: { left: number };
  dig?: { from: { x: number; y: number }; angle: number; done: number; group: number; left?: number };
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
  | { event: "explode"; x: number; y: number; radius: number; weapon: string; part?: number }
  /** The terrain changed. */
  | { event: "terrain"; ops: TerrainOp[] }
  /**
   * A tank was damaged, by an explosion or by falling when the ground went from under it. Its energy
   * is what is left; 0 means it was destroyed. The amount is how much it lost, and "by" the id of
   * the player whose shot did it.
   */
  | { event: "damage"; id: number; energy: number; amount: number; by: number }
  /** The shield of a tank took damage that the shot of another player would have done to the tank. What is left of it is in the tank. */
  | { event: "shield"; id: number; amount: number; by: number }
  /**
   * Something that burns lies on the ground: how deep on each column from x to the right, in pixels.
   * It is told again with the same id as it spreads: each telling is all of it.
   */
  | { event: "burn"; id: number; x: number; depths: number[]; weapon: string }
  /** A parachute of a tank opened, and took the damage of a fall. */
  | { event: "parachute"; id: number };

/** What the simulation is told from outside the field: the parachutes of the tanks, and whether dirt in the air stays there. */
interface World {
  parachutes: Record<number, number>;
  hangs: () => boolean;
}

/** The dirt that has nothing under it falls, unless it stays hanging this time. */
const settling = (world: World): TerrainOp[] => (world.hangs() ? [] : [{ op: "settle" }]);

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
  // A charge is not thrown anywhere: its speed only tells which way the turret points
  const speed = findWeapon(weapon)?.kind === "charge" ? 1 : tank.power * SPEED_PER_POWER;
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
 * @param r The radius of the explosion, when it is not that of the weapon.
 */
function detonate(
  field: FieldState,
  weapon: Weapon,
  at: { x: number; y: number },
  by: number,
  events: ShotEvent[],
  world: World,
  r = blastRadius(weapon),
  part?: number
) {
  if (weapon.kind === "tracer") return;
  if (weapon.kind === "disrupter") {
    // An Earth Disrupter brings down all the dirt that hangs in the air, everywhere
    events.push({ event: "explode", ...at, radius: DISRUPTER_FLASH, weapon: weapon.id });
    return changeField(field, [{ op: "settle" }], null, by, events, world);
  }
  const ops: TerrainOp[] = [{ op: weapon.kind === "dirt" ? "fill" : "carve", ...at, r }, ...settling(world)];
  events.push({ event: "explode", ...at, radius: r, weapon: weapon.id, ...(part === undefined ? {} : { part }) });
  // The charge of a sandhog comes from below, where a shield does not reach
  const harm = {
    to: (tank: TankState) => damageTo(tank, at.x, at.y, r, weapon.damage),
    through: weapon.kind === "sandhog"
  };
  changeField(field, ops, weapon.damage > 0 ? harm : null, by, events, world);
}

/**
 * Moves Napalm that has landed one step of the simulation forward: a little more of it spills out
 * and flows over the ground like a liquid, downhill and into the holes, burning where it lies. When
 * all of it is out it takes energy from the tanks by how deep it lies on them, so a tank in a hollow
 * is hurt the most. The dirt does not burn.
 *
 * @returns The Napalm after the step, or null when all of it has spilled.
 */
function spillShot(field: FieldState, shot: Shot, weapon: Weapon, events: ShotEvent[], world: World): Shot | null {
  const { ground } = shot.spill!;
  const tops = [...shot.spill!.tops];
  const amount = Math.min(shot.spill!.left, Math.ceil(NAPALM_SPEED / STEPS_PER_SECOND));
  const left = shot.spill!.left - amount;
  const steps = shot.spill!.steps + 1;
  flow(tops, shot.x, amount, NAPALM_REACH, { under: ground, film: NAPALM_FILM });
  const depths = ground.map((top, x) => top - tops[x]);
  // Where it burns is told a few times a second while it spreads, and once more when it has stopped
  if (left === 0 || steps % SPILL_TELL === 0) {
    const from = depths.findIndex((depth) => depth > 0);
    let to = depths.length - 1;
    while (to > from && depths[to] === 0) to--;
    if (from >= 0) {
      events.push({ event: "burn", id: shot.id, x: from, depths: depths.slice(from, to + 1), weapon: weapon.id });
    }
  }
  if (left > 0) return { ...shot, spill: { ground, tops, left, steps } };
  const taken = (tank: TankState) => {
    // As deep as it lies anywhere under the tank or right beside it, where its flames reach the tank: a tank on a
    // ledge over a pool of it burns too. What lies far below does not reach it.
    let deepest = 0;
    const reach = TANK_WIDTH / 2 + NAPALM_BESIDE;
    for (let x = Math.max(0, Math.round(tank.x - reach)); x <= Math.min(tops.length - 1, tank.x + reach); x++) {
      if (depths[x] > 0 && tops[x] - flameReach(depths[x]) <= tank.y) deepest = Math.max(deepest, depths[x]);
    }
    return Math.min(weapon.damage, Math.round((weapon.damage * deepest) / NAPALM_DEEP));
  };
  changeField(field, [], { to: taken }, shot.owner, events, world);
  return null;
}

/**
 * A weapon that tunnels has come down: it goes on into the dirt, as one tunnel or as several that
 * fan out: a digger the way it was going. A sandhog digs one tunnel after another, sideways under the
 * ground. Each tunnel is dug by a head, which is a projectile like the others and is moved by digShot.
 *
 * @param way The speed the weapon came down with: only its direction matters.
 * @returns The heads of the tunnels.
 */
function burrow(
  weapon: Weapon,
  shot: Shot,
  at: { x: number; y: number },
  way: { vx: number; vy: number },
  nextId: () => number,
  events: ShotEvent[]
): Shot[] {
  const r = (weapon.kind === "sandhog" ? SANDHOG_TUNNEL : weapon.radius) * ORIGINAL_SCALE;
  const count = weapon.warheads ?? 1;
  const straight = Math.atan2(way.vy, way.vx);
  events.push({ event: "explode", ...at, radius: r, weapon: weapon.id });
  if (weapon.kind === "sandhog") {
    // A sandhog goes sideways under the ground, the way it was going: its first tunnel dives a little, and each
    // of its other charges digs on from where the one before it went off
    const dive = (SANDHOG_DIVE * Math.PI) / 180;
    const dig = { from: at, angle: way.vx < 0 ? Math.PI - dive : dive, done: 0, group: shot.id, left: count - 1 };
    return [{ ...shot, ...at, vx: 0, vy: 0, warhead: true, dig }];
  }
  const heads: Shot[] = [];
  for (let i = 0; i < count; i++) {
    // The tunnels of a digger fan out around the way it came
    const angle = straight + ((i - (count - 1) / 2) * TUNNEL_FAN * Math.PI) / 180;
    const dig = { from: at, angle, done: 0, group: shot.id };
    heads.push({ ...shot, ...at, id: i === 0 ? shot.id : nextId(), vx: 0, vy: 0, warhead: true, dig });
  }
  return heads;
}

/**
 * Moves the head of a tunnel one step of the simulation forward: it eats the dirt where it goes. At
 * the end of its tunnel a digger is done. A sandhog sets off a charge there, and if it has charges
 * left, the next one digs on from there, level. A tunnel that reaches a tank ends there, and so does
 * one that reaches the edge of the field: a sandhog then goes no further.
 *
 * @param alone Whether this is the last head of its weapon that still digs: the dirt above the tunnels falls only after all of them are done.
 * @returns The head after the step, or null when its tunnel is done.
 */
function digShot(field: FieldState, shot: Shot, weapon: Weapon, alone: boolean, events: ShotEvent[], world: World) {
  const dig = { ...shot.dig! };
  const r = (weapon.kind === "sandhog" ? SANDHOG_TUNNEL : weapon.radius) * ORIGINAL_SCALE;
  const length = (weapon.tunnel ?? 0) * ORIGINAL_SCALE;
  const end = (at: { x: number; y: number }, onward = false): Shot | null => {
    if (weapon.kind === "sandhog") detonate(field, weapon, at, shot.owner, events, world);
    else if (alone) changeField(field, settling(world), null, shot.owner, events, world);
    if (!onward || !dig.left) return null;
    const level = Math.cos(dig.angle) < 0 ? Math.PI : 0;
    return { ...shot, ...at, dig: { ...dig, from: at, angle: level, done: 0, left: dig.left - 1 } };
  };
  const here = { x: Math.round(shot.x), y: Math.round(shot.y) };
  if (dig.done >= length) return end(here, true);
  dig.done = Math.min(length, dig.done + DIG_SPEED / STEPS_PER_SECOND);
  const next = {
    x: Math.round(dig.from.x + Math.cos(dig.angle) * dig.done),
    y: Math.round(dig.from.y + Math.sin(dig.angle) * dig.done)
  };
  if (next.x < 0 || next.x >= field.width || next.y >= field.height) return end(here);
  if (field.tanks.some((tank) => hitsTank(tank, next.x, next.y))) return end(next);
  if (next.x !== here.x || next.y !== here.y || dig.done === length) {
    changeField(field, [{ op: "carve", ...next, r }], null, shot.owner, events, world);
  }
  return { ...shot, ...next, dig };
}

/**
 * A charge goes off at the turret: it destroys a wedge of dirt, from the turret the way it points,
 * or throws one there if it is a Dirt Charge: that dirt then falls where it is.
 * It harms nobody, but a tank whose ground it takes falls. The wedge is made of circles that grow
 * with the distance, so that the changes are ones that everyone who draws the field already knows.
 */
function charge(field: FieldState, weapon: Weapon, shot: Shot, events: ShotEvent[], world: World) {
  const speed = Math.hypot(shot.vx, shot.vy);
  const way = speed > 0 ? { x: shot.vx / speed, y: shot.vy / speed } : { x: 0, y: -1 };
  const narrow = Math.sin(((weapon.spread ?? 30) * Math.PI) / 180);
  // The middle of the last circle is where the circle just reaches the radius of the weapon
  const far = blastRadius(weapon) / (1 + narrow);
  const ops: TerrainOp[] = [];
  const near = weapon.dirt ? DIRT_CHARGE_START : 0;
  for (let i = 0; i <= CHARGE_CIRCLES; i++) {
    const distance = near + ((far - near) * i) / CHARGE_CIRCLES;
    const r = Math.max(weapon.dirt ? 1 : CHARGE_START, Math.round(distance * narrow));
    ops.push({
      op: weapon.dirt ? "fill" : "carve",
      x: Math.round(shot.x + way.x * distance),
      y: Math.round(shot.y + way.y * distance),
      r
    });
  }
  ops.push(...settling(world));
  events.push({
    event: "explode",
    x: Math.round(shot.x),
    y: Math.round(shot.y),
    radius: CHARGE_START,
    weapon: weapon.id
  });
  changeField(field, ops, null, shot.owner, events, world);
}

/**
 * Changes the terrain, and makes what follows happen to the tanks: an explosion among the changes
 * damages those it reaches, the dirt that has nothing under it falls, and the tanks come down with
 * the ground: a fall takes energy from a tank too, by its height.
 *
 * @param harm What damages tanks, if something does: how much it takes from a tank, and whether it gets through a shield.
 */
function changeField(
  field: FieldState,
  ops: TerrainOp[],
  harm: { to: (tank: TankState) => number; through?: boolean } | null,
  by: number,
  events: ShotEvent[],
  world: World
) {
  ops.forEach((op) => applyTerrainOp(field.terrain, op, field.height));
  for (const tank of field.tanks) {
    let amount = 0;
    if (harm && tank.energy > 0) {
      // The damage is by where the tank was when the explosion happened, before it came down
      amount = harm.to(tank);
      // A shield takes the damage of the shots of others, as long as it lasts. It never protects from one's own shot.
      if (amount > 0 && tank.shield > 0 && by !== tank.id && !harm.through) {
        const taken = Math.min(tank.shield, amount);
        tank.shield -= taken;
        if (tank.shield === 0) tank.shieldMax = 0;
        amount -= taken;
        events.push({ event: "shield", id: tank.id, amount: taken, by });
      }
    }
    // A tank falls with the ground under it, and the fall hurts it. Dirt that lands on it does not lift it.
    // What it falls to is the dirt below it: dirt that hangs above it is not ground
    const fall = groundBelow(field.terrain, tank.x, tank.y, field.height) - tank.y;
    tank.y += fall;
    let hurt = Math.floor((fall / ORIGINAL_SCALE) * FALL_DAMAGE);
    // A parachute opens when the fall would hurt enough to be worth one, and takes all of its damage
    if (tank.energy > 0 && hurt > PARACHUTE_THRESHOLD && world.parachutes[tank.id] > 0) {
      world.parachutes[tank.id] -= 1;
      hurt = 0;
      events.push({ event: "parachute", id: tank.id });
    }
    amount = Math.min(tank.energy, amount + hurt);
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
 * A number from 0 up to 1 that looks like chance but is always the same for the same three numbers:
 * what is scattered is scattered the same way whenever the same thing happens.
 */
function scatter(a: number, b: number, c: number) {
  const value = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Moves a roller that is on the ground one step of the simulation forward. It rolls like a ball:
 * going down speeds it up, going up and the ground itself slow it down. Where it cannot go on it
 * turns back if the ground falls behind it, and explodes if it does not: it is in a valley. It also
 * explodes when it reaches a tank, and when it has rolled for too long.
 *
 * @returns The roller after the step, or null when it has exploded or rolled off the field.
 */
function rollShot(field: FieldState, shot: Shot, weapon: Weapon, events: ShotEvent[], world: World): Shot | null {
  const roll = { ...shot.roll! };
  const ground = (x: number) => groundAt(field.terrain, x, field.height);
  const explode = (x: number) => {
    detonate(field, weapon, { x, y: ground(x) }, shot.owner, events, world);
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
 * @param parachutes How many parachutes each tank has, by the id of its player. One that opens is taken from here.
 * @param hangs Asked whenever dirt is left with nothing under it: whether it stays hanging in the air instead of falling (Suspend Dirt).
 * @returns The projectiles that are still in the air, and what happened.
 */
export function stepShots(
  field: FieldState,
  shots: Shot[],
  nextId: () => number = (() => {
    let id = Math.max(0, ...shots.map((shot) => shot.id));
    return () => ++id;
  })(),
  parachutes: Record<number, number> = {},
  hangs: () => boolean = () => false
): { shots: Shot[]; events: ShotEvent[] } {
  const world = { parachutes, hangs };
  const dt = 1 / STEPS_PER_SECOND;
  const flying: Shot[] = [];
  const events: ShotEvent[] = [];

  for (const [index, shot] of shots.entries()) {
    const weapon = findWeapon(shot.weapon) ?? WEAPONS[0];
    if (shot.pour) {
      // Liquid dirt oozes out of where it landed, a little at every step
      const amount = Math.min(shot.pour.left, Math.ceil(POUR_SPEED / STEPS_PER_SECOND));
      changeField(field, [{ op: "pour", x: Math.round(shot.x), amount }], null, shot.owner, events, world);
      if (shot.pour.left > amount) flying.push({ ...shot, pour: { left: shot.pour.left - amount } });
      continue;
    }
    if (shot.spill) {
      const spilling = spillShot(field, shot, weapon, events, world);
      if (spilling) flying.push(spilling);
      continue;
    }
    if (shot.dig) {
      const group = shot.dig.group;
      const others = [...flying, ...shots.slice(index + 1)].some((other) => other.dig?.group === group);
      const digging = digShot(field, shot, weapon, !others, events, world);
      if (digging) flying.push(digging);
      continue;
    }
    if (weapon.kind === "charge") {
      charge(field, weapon, shot, events, world);
      continue;
    }
    if (shot.roll) {
      const rolling = rollShot(field, shot, weapon, events, world);
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
    let leaving = shot.leaving;
    for (let i = 1; i <= steps && !hit; i++) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const y = from.y + ((to.y - from.y) * i) / steps;
      const tank = field.tanks.some((candidate) => hitsTank(candidate, x, y));
      const stopped = tank || isDirt(field.terrain, x, y);
      // What was thrown from inside something is not stopped by it: only by what it meets after it has come out
      if (leaving) leaving = stopped;
      else if (stopped) hit = { x, y, tank };
    }

    if (hit && weapon.kind === "roller" && !hit.tank) {
      // A roller that lands on the ground starts to roll, the way it was going
      const x = Math.min(field.width - 1, Math.max(0, Math.round(hit.x)));
      const speed2 = Math.min(Math.abs(vx), ROLLER_START_SPEED) ** 2;
      const roll = { direction: vx < 0 ? (-1 as const) : (1 as const), speed2, progress: 0, time: 0 };
      const y = groundAt(field.terrain, x, field.height) - ROLLER_HEIGHT;
      flying.push({ ...shot, x, y, vx: 0, vy: 0, roll });
    } else if (hit && (weapon.kind === "digger" || weapon.kind === "sandhog")) {
      const at = { x: Math.round(hit.x), y: Math.round(hit.y) };
      // On a tank a digger fizzles, and a sandhog goes off as the one charge it still is
      if (!hit.tank) flying.push(...burrow(weapon, shot, at, { vx, vy }, nextId, events));
      else if (weapon.kind === "sandhog") detonate(field, weapon, at, shot.owner, events, world);
    } else if (hit && weapon.kind === "liquid") {
      const at = { x: Math.min(field.width - 1, Math.max(0, Math.round(hit.x))), y: Math.round(hit.y) };
      flying.push({ ...shot, ...at, vx: 0, vy: 0, pour: { left: weapon.amount ?? 0 } });
    } else if (hit && weapon.kind === "napalm") {
      const at = { x: Math.min(field.width - 1, Math.max(0, Math.round(hit.x))), y: Math.round(hit.y) };
      const ground = field.terrain.map((_, x) => groundAt(field.terrain, x, field.height));
      const spill = { left: weapon.amount ?? 0, ground, tops: ground, steps: 0 };
      flying.push({ ...shot, ...at, vx: 0, vy: 0, spill });
    } else if (hit && weapon.kind === "leapfrog") {
      // A Leap Frog explodes three times, each time larger: after the first two it leaps on the way it was going
      const at = { x: Math.round(hit.x), y: Math.round(hit.y) };
      const stage = shot.stage ?? 0;
      const last = LEAP_FROG_RADII.length - 1;
      const r = LEAP_FROG_RADII[Math.min(stage, last)] * ORIGINAL_SCALE;
      detonate(field, weapon, at, shot.owner, events, world, r);
      if (stage < last) {
        // From a tank it leaps straight up, and comes down on it again: that is what makes it good against shields
        const leap = hit.tank ? 0 : Math.max(LEAP_LEAST, Math.abs(vx) * LEAP_KEEP) * (vx < 0 ? -1 : 1);
        flying.push({ ...shot, ...at, vx: leap, vy: -LEAP_SPEED, stage: stage + 1 });
      }
    } else if (hit) {
      // A MIRV that hits something on its way up goes off as the one warhead it still is
      const at = { x: Math.round(hit.x), y: Math.round(hit.y) };
      detonate(field, weapon, at, shot.owner, events, world, undefined, shot.part);
      if (weapon.kind === "funky" && !shot.warhead) {
        // A Funky Bomb throws bombs around where it went off: each of them explodes where it comes down
        for (let i = 0; i < FUNKY_BOMBS; i++) {
          // One bomb for each part of the reach, so that they are scattered over all of it; where in its part, by chance
          const part = (i + scatter(shot.id, at.x, i)) / FUNKY_BOMBS;
          const reach = (2 * part - 1) * FUNKY_REACH * ORIGINAL_SCALE;
          const up = FUNKY_SPEED * (0.8 + 0.4 * scatter(at.x, shot.id, i + FUNKY_BOMBS));
          // On level ground a bomb thrown up at this speed is in the air for this long
          const time = (2 * up) / GRAVITY;
          flying.push({
            ...shot,
            ...at,
            id: nextId(),
            warhead: true,
            leaving: true,
            part: i,
            vx: reach / time,
            vy: -up
          });
        }
      }
    } else if (to.x < -BORDER || to.x > field.width + BORDER || to.y >= field.height) {
      // Past the sides or the bottom a projectile is gone. Above the field it flies on: it comes back down.
    } else if (weapon.kind === "mirv" && !shot.warhead && shot.vy < 0 && vy >= 0) {
      // At the top of its flight a MIRV splits into warheads that spread sideways
      const warheads = weapon.warheads ?? MIRV_WARHEADS;
      for (let i = 0; i < warheads; i++) {
        const spread = (i - (warheads - 1) / 2) * MIRV_SPREAD;
        flying.push({ ...shot, ...to, id: i === 0 ? shot.id : nextId(), warhead: true, vx: vx + spread, vy });
      }
    } else {
      flying.push({ ...shot, ...to, vx, vy, leaving });
    }
  }
  return { shots: flying, events };
}
