// @vitest-environment node
import { describe, expect, it } from "vitest";

import { FieldState, TankState } from "../protocol";
import { FIELD_HEIGHT, FIELD_WIDTH, TANK_HEIGHT, TANK_WIDTH, TURRET_LENGTH } from "./field";
import {
  BABY_MISSILE_RADIUS,
  blastRadius,
  damageTo,
  DIG_SPEED,
  GRAVITY,
  launch,
  Shot,
  SPEED_PER_POWER,
  stepShots,
  STEPS_PER_SECOND,
  WIND_PER_UNIT
} from "./shots";
import { findWeapon, FUNKY_BOMBS, FUNKY_REACH, LEAP_FROG_RADII, MIRV_WARHEADS } from "../weapons";
import { applyTerrainOp, carve, fill, flow, isDirt, settle, Terrain } from "./terrain";

/** A field of level ground at the given y, with the given tanks on it. */
const flatField = (ground: number, tanks: Partial<TankState>[] = []): FieldState => ({
  width: FIELD_WIDTH,
  height: FIELD_HEIGHT,
  terrain: Array.from({ length: FIELD_WIDTH }, () => [ground, FIELD_HEIGHT]),
  tanks: tanks.map((tank, id) => ({
    id,
    x: 100,
    y: ground,
    angle: 45,
    power: 500,
    energy: 100,
    shield: 0,
    shieldMax: 0,
    ...tank
  })),
  wind: 0,
  walls: "none"
});

/** Flies a projectile until it is gone or has exploded. */
const fly = (field: FieldState, shot: Shot) => {
  let shots = [shot];
  let steps = 0;
  let highest = shot.y;
  for (; shots.length > 0 && steps < 100000; steps++) {
    const result = stepShots(field, shots);
    if (result.shots[0]) highest = Math.min(highest, result.shots[0].y);
    if (result.events.length > 0) return { steps, highest, events: result.events };
    shots = result.shots;
  }
  return { steps, highest, events: [] };
};

describe("the terrain", () => {
  const column = (terrain: Terrain, x: number) => terrain[x];

  it("knows where there is dirt", () => {
    const terrain = [[10, 20, 30, 40]];
    expect([5, 10, 19, 20, 25, 30, 39, 40].map((y) => isDirt(terrain, 0, y))).toEqual([
      false,
      true,
      true,
      false,
      false,
      true,
      true,
      false
    ]);
    expect(isDirt(terrain, 0.9, 15)).toBe(true);
    expect(isDirt(terrain, -1, 15)).toBe(false);
    expect(isDirt(terrain, 1, 15)).toBe(false);
  });

  it("loses the dirt inside a circle that is carved", () => {
    const terrain: Terrain = Array.from({ length: 21 }, () => [0, 100]);
    carve(terrain, 10, 50, 5);
    expect(column(terrain, 10)).toEqual([0, 45, 56, 100]);
    expect(column(terrain, 5)).toEqual([0, 50, 51, 100]);
    expect(column(terrain, 15)).toEqual([0, 50, 51, 100]);
    expect(column(terrain, 4)).toEqual([0, 100]);
    // The circle is a circle: three pixels from the middle it is four high each way
    expect(column(terrain, 13)).toEqual([0, 46, 55, 100]);
  });

  it("is carved at its surface and at the edge of the field", () => {
    const terrain: Terrain = Array.from({ length: 10 }, () => [50, 100]);
    carve(terrain, 0, 50, 3);
    expect(column(terrain, 0)).toEqual([54, 100]);
    expect(column(terrain, 3)).toEqual([51, 100]);
    carve(terrain, 9, 98, 5);
    expect(column(terrain, 9)).toEqual([50, 93]);
  });

  it("settles: the dirt that hangs falls down", () => {
    const terrain: Terrain = [[0, 45, 56, 100], [20, 100], [10, 20], [], [90, 95, 97, 100]];
    settle(terrain, 100);
    expect(terrain).toEqual([[11, 100], [20, 100], [90, 100], [], [92, 100]]);
  });

  it("applies the changes it is told", () => {
    const terrain: Terrain = Array.from({ length: 21 }, () => [0, 100]);
    applyTerrainOp(terrain, { op: "carve", x: 10, y: 50, r: 5 }, 100);
    applyTerrainOp(terrain, { op: "settle" }, 100);
    expect(column(terrain, 10)).toEqual([11, 100]);
    expect(column(terrain, 4)).toEqual([0, 100]);
  });
});

describe("a projectile", () => {
  it("starts at the tip of the turret, at a speed by the power and the angle", () => {
    const tank: TankState = { id: 3, x: 100, y: 500, angle: 90, power: 400, energy: 100, shield: 0, shieldMax: 0 };
    const up = launch(tank, 7);
    expect(up).toMatchObject({ id: 7, owner: 3, y: 500 - TANK_HEIGHT - TURRET_LENGTH });
    expect(up.x).toBeCloseTo(100);
    expect(up.vx).toBeCloseTo(0);
    expect(up.vy).toBeCloseTo(-400 * SPEED_PER_POWER);

    const left = launch({ ...tank, angle: 180 }, 8);
    expect(left.x).toBeCloseTo(100 - TURRET_LENGTH);
    expect(left.vx).toBeCloseTo(-400 * SPEED_PER_POWER);
    expect(left.vy).toBeCloseTo(0);
  });

  it("flies as far as in the original: at full power and 45 degrees, 3.125 widths of the field", () => {
    const speed = 1000 * SPEED_PER_POWER;
    expect((speed * speed) / GRAVITY / FIELD_WIDTH).toBeCloseTo(3.125);
  });

  it("is in the air for three seconds on a shot of the width of the field at 45 degrees", () => {
    const power = Math.sqrt(FIELD_WIDTH * GRAVITY) / SPEED_PER_POWER;
    const speed = power * SPEED_PER_POWER * Math.SQRT1_2;
    expect((2 * speed) / GRAVITY).toBeCloseTo(3);
  });

  it("lands where and when the physics say", () => {
    const field = flatField(600);
    // The power with which a shot at 45 degrees flies 1000 pixels
    const power = Math.sqrt(1000 * GRAVITY) / SPEED_PER_POWER;
    const shot = launch({ id: 0, x: 100, y: 600, angle: 45, power, energy: 100, shield: 0, shieldMax: 0 }, 1);
    const { steps, events } = fly(field, shot);

    // It starts a turret above the ground, so it flies a little longer and further than from the ground
    const time = Math.SQRT2 * Math.sqrt(1000 / GRAVITY);
    expect(steps / STEPS_PER_SECOND).toBeGreaterThan(time);
    expect(steps / STEPS_PER_SECOND).toBeLessThan(time * 1.05);
    const explosion = events.find((event) => event.event === "explode") as { x: number; y: number };
    expect(explosion).toMatchObject({ y: 600, radius: BABY_MISSILE_RADIUS });
    expect(explosion.x - shot.x).toBeGreaterThan(1000);
    expect(explosion.x - shot.x).toBeLessThan(1040);
  });

  it("rises as high as the physics say", () => {
    const field = flatField(700);
    const shot = launch({ id: 0, x: 640, y: 700, angle: 90, power: 300, energy: 100, shield: 0, shieldMax: 0 }, 1);
    const { highest } = fly(field, shot);
    const rise = (300 * SPEED_PER_POWER) ** 2 / (2 * GRAVITY);
    expect(shot.y - highest).toBeGreaterThan(rise * 0.97);
    expect(shot.y - highest).toBeLessThan(rise * 1.03);
  });

  it("comes back when it flies over the top of the field", () => {
    const field = flatField(700);
    const { highest, events } = fly(
      field,
      launch({ id: 0, x: 640, y: 700, angle: 85, power: 900, energy: 100, shield: 0, shieldMax: 0 }, 1)
    );
    expect(highest).toBeLessThan(0);
    expect(events[0]).toMatchObject({ event: "explode", y: 700 });
  });

  it("is gone when it flies far past the side of the field", () => {
    const field = flatField(700);
    const { events } = fly(
      field,
      launch({ id: 0, x: 100, y: 700, angle: 135, power: 600, energy: 100, shield: 0, shieldMax: 0 }, 1)
    );
    expect(events).toEqual([]);
  });

  it("explodes where it hits the ground: the dirt is destroyed and the terrain is told", () => {
    const field = flatField(600);
    const { events } = fly(
      field,
      launch({ id: 0, x: 200, y: 600, angle: 60, power: 300, energy: 100, shield: 0, shieldMax: 0 }, 1)
    );

    const [explosion, terrain] = events;
    expect(events).toHaveLength(2);
    expect(explosion).toMatchObject({ event: "explode", y: 600, radius: BABY_MISSILE_RADIUS });
    const { x } = explosion as { x: number };
    expect(terrain).toEqual({
      event: "terrain",
      ops: [{ op: "carve", x, y: 600, r: BABY_MISSILE_RADIUS }, { op: "settle" }]
    });
    // A crater: deepest in the middle, nothing at its edge
    expect(field.terrain[x]).toEqual([600 + BABY_MISSILE_RADIUS + 1, FIELD_HEIGHT]);
    expect(field.terrain[x + BABY_MISSILE_RADIUS + 1]).toEqual([600, FIELD_HEIGHT]);
  });

  it("does not jump over a thin wall, however fast it flies", () => {
    const field = flatField(600);
    for (let x = 400; x < 403; x++) field.terrain[x] = [100, FIELD_HEIGHT];
    const { events } = fly(
      field,
      launch({ id: 0, x: 100, y: 600, angle: 20, power: 1000, energy: 100, shield: 0, shieldMax: 0 }, 1)
    );
    expect(events[0]).toMatchObject({ event: "explode" });
    expect((events[0] as { x: number }).x).toBeGreaterThanOrEqual(399);
    expect((events[0] as { x: number }).x).toBeLessThanOrEqual(403);
  });

  it("explodes when it hits a tank", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    const shot: Shot = { id: 1, owner: 0, weapon: "baby-missile", x: 700, y: 300, vx: 0, vy: 0 };
    const { events } = fly(field, shot);
    expect(events[0]).toMatchObject({ event: "explode", x: 700 });
    const { y } = events[0] as { y: number };
    expect(y).toBeGreaterThanOrEqual(600 - TANK_HEIGHT);
    expect(y).toBeLessThanOrEqual(600 - TANK_HEIGHT + 2);
  });

  it("brings the tanks down with the ground under them", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    fly(field, { id: 1, owner: 0, weapon: "baby-missile", x: 705, y: 300, vx: 0, vy: 0 });
    expect(field.tanks[1].y).toBeGreaterThan(600);
    expect(field.tanks[1].y).toBe(field.terrain[700][0]);
    expect(field.tanks[0].y).toBe(600);
  });

  it("does not hit the tank that fires it", () => {
    const field = flatField(600, [{ x: 640, angle: 90, power: 200 }]);
    const { steps } = fly(field, launch(field.tanks[0], 1));
    // It goes up and comes down on the tank, which takes a while
    expect(steps).toBeGreaterThan(STEPS_PER_SECOND);
  });
});

describe("the damage of an explosion", () => {
  const tank: TankState = { id: 0, x: 500, y: 600, angle: 45, power: 500, energy: 100, shield: 0, shieldMax: 0 };
  const middle = 600 - TANK_HEIGHT / 2;

  it("is the most at the middle of the tank, and what the weapon takes at the most", () => {
    expect(damageTo(tank, 500, middle, 20)).toBe(100);
    expect(damageTo(tank, 500, middle, 20, 50)).toBe(50);
    expect(damageTo(tank, 500, middle, 150, 100)).toBe(100);
  });

  it("is less the further the explosion is from the middle of the tank, and none a radius away", () => {
    const beside = (distance: number, most?: number) => damageTo(tank, 500 + distance, middle, 20, most);
    expect(beside(5)).toBe(75);
    expect(beside(10)).toBe(50);
    expect(beside(19)).toBe(5);
    expect(beside(20)).toBe(0);
    expect(beside(-10)).toBe(50);
    expect(damageTo(tank, 500, middle - 10, 20)).toBe(50);
    // What was measured in the original: 37 for a crater about 7 of its pixels from the middle, a third of its radius
    expect(Math.abs(damageTo(tank, 500 + 13, middle - 4, 20) - 37)).toBeLessThanOrEqual(6);
    // A Baby Missile takes half of that
    expect(beside(10, 50)).toBe(25);
  });

  it("takes energy from a tank beside which a shot lands, and tells it", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700, power: 900 }]);
    // A Missile that comes down just past the side of the tank
    const { events } = fly(field, {
      id: 1,
      owner: 0,
      weapon: "missile",
      x: 700 + TANK_WIDTH / 2 + 2,
      y: 300,
      vx: 0,
      vy: 0
    });

    const energy = field.tanks[1].energy;
    expect(energy).toBeGreaterThan(30);
    expect(energy).toBeLessThan(70);
    expect(events).toContainEqual({ event: "damage", id: 1, energy, amount: 100 - energy, by: 0 });
    expect(field.tanks[0].energy).toBe(100);
    // The power is at most ten times the energy
    expect(field.tanks[1].power).toBe(energy * 10);
  });

  it("takes several Baby Missiles to destroy a tank, even when they come down right on it", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    let hits = 0;
    while (field.tanks[1].energy > 0 && hits < 20) {
      fly(field, { id: 1, owner: 0, weapon: "baby-missile", x: 700, y: 300, vx: 0, vy: 0 });
      hits += 1;
      if (hits === 1) {
        expect(field.tanks[1].energy).toBeGreaterThanOrEqual(55);
        expect(field.tanks[1].energy).toBeLessThan(80);
      }
    }
    expect(hits).toBeGreaterThanOrEqual(3);
    expect(hits).toBeLessThan(8);
  });

  it("destroys a tank with a Baby Nuke that comes down on it, and a wreck does not stop projectiles or take damage", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    const { events } = fly(field, { id: 1, owner: 0, weapon: "baby-nuke", x: 700, y: 300, vx: 0, vy: 0 });
    expect(field.tanks[1]).toMatchObject({ energy: 0, power: 0 });
    expect(events).toContainEqual({ event: "damage", id: 1, energy: 0, amount: 100, by: 0 });

    const ground = field.tanks[1].y;
    const next = fly(field, { id: 2, owner: 0, weapon: "baby-missile", x: 700, y: 300, vx: 0, vy: 0 });
    expect(next.events.filter((event) => event.event === "damage")).toEqual([]);
    // It fell through the wreck to the ground
    expect((next.events[0] as { y: number }).y).toBeGreaterThanOrEqual(ground);
  });
});

describe("dirt that is added", () => {
  it("makes a ball that joins the dirt it touches", () => {
    const terrain: Terrain = Array.from({ length: 100 }, () => [80, 100]);
    fill(terrain, 50, 40, 10, 100);
    // In the air: a run of its own above the ground
    expect(terrain[50]).toEqual([30, 51, 80, 100]);
    expect(terrain[60]).toEqual([40, 41, 80, 100]);
    expect(terrain[61]).toEqual([80, 100]);

    // Touching the ground and what is in the air: one run
    fill(terrain, 50, 65, 15, 100);
    expect(terrain[50]).toEqual([30, 100]);
  });

  it("stays inside the field", () => {
    const terrain: Terrain = Array.from({ length: 20 }, () => [90, 100]);
    fill(terrain, 0, 3, 8, 100);
    expect(terrain[0]).toEqual([0, 12, 90, 100]);
    fill(terrain, 19, 97, 8, 100);
    expect(terrain[19]).toEqual([89, 100]);
  });

  it("falls when the terrain is settled", () => {
    const terrain: Terrain = Array.from({ length: 100 }, () => [80, 100]);
    applyTerrainOp(terrain, { op: "fill", x: 50, y: 40, r: 10 }, 100);
    applyTerrainOp(terrain, { op: "settle" }, 100);
    expect(terrain[50]).toEqual([59, 100]);
    expect(terrain[61]).toEqual([80, 100]);
  });
});

describe("the weapons in the air", () => {
  /** Drops a weapon straight down at an x. */
  const drop = (field: FieldState, weapon: string, x: number) =>
    fly(field, { id: 1, owner: 0, weapon, x, y: 300, vx: 0, vy: 0 });

  it("explode with the radius of the weapon, twice that of the original", () => {
    for (const [weapon, radius] of [
      ["missile", 40],
      ["baby-nuke", 80],
      ["nuke", 150]
    ] as const) {
      expect(blastRadius(findWeapon(weapon)!)).toBe(radius);
      const { events } = drop(flatField(600), weapon, 640);
      expect(events[0]).toEqual({ event: "explode", x: 640, y: 600, radius, weapon });
    }
  });

  it("reach further with a bigger weapon", () => {
    const beside = (weapon: string) => {
      const field = flatField(600, [{ x: 100 }, { x: 700 }]);
      drop(field, weapon, 700 + TANK_WIDTH / 2 + 30);
      return field.tanks[1].energy;
    };
    // 44 pixels from the middle of the tank: out of the reach of a Baby Missile and a Missile
    expect(beside("baby-missile")).toBe(100);
    expect(beside("missile")).toBe(100);
    expect(beside("baby-nuke")).toBeLessThan(70);
    // A Nuke also takes the ground from under the tank, and the fall takes the rest
    expect(beside("nuke")).toBe(0);
  });

  it("destroy dirt with a riot bomb, which does not harm a tank but lets it fall", () => {
    // Far enough to the side that the ground under the tank stays
    const safe = flatField(600, [{ x: 100 }, { x: 700 }]);
    const { events } = drop(safe, "riot-bomb", 700 + TANK_WIDTH / 2 + 62);
    expect(events[0]).toMatchObject({ event: "explode", radius: 60, weapon: "riot-bomb" });
    expect(events.filter((event) => event.event === "damage")).toEqual([]);
    expect(safe.tanks[1]).toMatchObject({ y: 600, energy: 100, shield: 0, shieldMax: 0 });

    // Right beside the tank the ground goes from under it: it falls, and the fall hurts
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    const fallen = drop(field, "riot-bomb", 705).events.filter((event) => event.event === "damage");
    const fall = field.tanks[1].y - 600;
    expect(fall).toBeGreaterThan(0);
    // A point of energy for each pixel of the original, which is two of ours
    expect(fallen).toEqual([
      { event: "damage", id: 1, energy: 100 - Math.floor(fall / 2), amount: Math.floor(fall / 2), by: 0 }
    ]);
  });

  it("let a wreck fall without telling of damage, and do not lift a tank with the ground", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700, energy: 0 }]);
    const { events } = drop(field, "riot-bomb", 705);
    expect(field.tanks[1].y).toBeGreaterThan(600);
    expect(events.filter((event) => event.event === "damage")).toEqual([]);
  });

  it("bury a tank with a dirt weapon: the tank stays where it is, unharmed", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    const { events } = drop(field, "dirt-ball", 700);
    expect(events[0]).toMatchObject({ event: "explode", radius: 70, weapon: "dirt-ball" });
    expect(events[1]).toMatchObject({ event: "terrain", ops: [{ op: "fill", x: 700, r: 70 }, { op: "settle" }] });
    expect(field.tanks[1]).toMatchObject({ y: 600, energy: 100, shield: 0, shieldMax: 0 });
    expect(field.terrain[700][0]).toBeLessThan(600 - TANK_HEIGHT);
  });

  it("hurt a buried tank that fires: its shot goes off at the turret", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700, angle: 90, power: 500 }]);
    drop(field, "dirt-ball", 700);
    // A Baby Missile is too small to reach the tank from the end of its turret, a Missile is not
    fly(field, launch(field.tanks[1], 2));
    expect(field.tanks[1].energy).toBe(100);
    drop(field, "dirt-ball", 700);
    const { events } = fly(field, launch(field.tanks[1], 3, "missile"));
    expect(events[0]).toMatchObject({ event: "explode", x: 700 });
    expect(field.tanks[1].energy).toBeGreaterThan(0);
    expect(field.tanks[1].energy).toBeLessThan(100);
  });

  it("do nothing with a tracer", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    const before = JSON.stringify(field);
    const { events, steps } = drop(field, "tracer", 700);
    expect(events).toEqual([]);
    expect(steps).toBeGreaterThan(0);
    expect(JSON.stringify(field)).toBe(before);
  });

  it("split a MIRV into warheads at the top of its flight", () => {
    const field = flatField(600, [{ x: 100, angle: 60, power: 500 }]);
    let shots = [launch(field.tanks[0], 1, "mirv")];
    let id = 1;
    const explosions: number[] = [];
    let split = false;
    for (let step = 0; shots.length > 0 && step < 10000; step++) {
      const result = stepShots(field, shots, () => ++id);
      if (!split && result.shots.length > 1) {
        split = true;
        expect(result.shots).toHaveLength(MIRV_WARHEADS);
        expect(new Set(result.shots.map((shot) => shot.id)).size).toBe(MIRV_WARHEADS);
        // At the top: it has stopped rising
        expect(Math.abs(result.shots[0].vy)).toBeLessThan(15);
        expect(result.shots.every((shot) => shot.warhead)).toBe(true);
      }
      for (const event of result.events) if (event.event === "explode") explosions.push(event.x);
      shots = result.shots;
    }
    expect(split).toBe(true);
    // Each warhead came down at a place of its own
    expect(explosions).toHaveLength(MIRV_WARHEADS);
    expect(new Set(explosions).size).toBe(MIRV_WARHEADS);
  });

  it("explode a MIRV as one warhead when it hits something on its way up", () => {
    const field = flatField(600, [{ x: 100, angle: 0, power: 300 }, { x: 200 }]);
    // A wall right in front of the tank
    for (let x = 140; x < 150; x++) field.terrain[x] = [500, FIELD_HEIGHT];
    const { events } = fly(field, launch(field.tanks[0], 1, "mirv"));
    expect(events.filter((event) => event.event === "explode")).toEqual([
      expect.objectContaining({ radius: 40, weapon: "mirv" })
    ]);
  });
});

describe("a roller", () => {
  /** A field whose ground is at the y a function gives for each x. */
  const shaped = (ground: (x: number) => number, tanks: Partial<TankState>[] = []): FieldState => {
    const field = flatField(600, tanks);
    field.terrain = field.terrain.map((_, x) => [Math.round(ground(x)), FIELD_HEIGHT]);
    for (const tank of field.tanks) tank.y = field.terrain[tank.x][0];
    return field;
  };
  /** Drops a roller at an x with a speed sideways, and follows it until it explodes or is gone. */
  const roll = (field: FieldState, x: number, vx = 0, weapon = "roller") => {
    let shots: Shot[] = [{ id: 1, owner: 0, weapon, x, y: 100, vx, vy: 0 }];
    let rolled = false;
    for (let step = 0; shots.length > 0 && step < 100000; step++) {
      const result = stepShots(field, shots);
      rolled ||= result.shots.some((shot) => shot.roll !== undefined);
      const explosion = result.events.find((event) => event.event === "explode");
      if (explosion)
        return { rolled, explosion: explosion as { x: number; y: number; radius: number }, seconds: step / 60 };
      shots = result.shots;
    }
    return { rolled, explosion: null, seconds: 0 };
  };

  it("rolls down a slope into the valley, and explodes there", () => {
    // A valley whose bottom is at x = 600
    const field = shaped((x) => 600 - Math.abs(x - 600) * 0.5);
    const { rolled, explosion } = roll(field, 300);
    expect(rolled).toBe(true);
    expect(explosion).toMatchObject({ radius: 40 });
    expect(Math.abs(explosion!.x - 600)).toBeLessThan(40);
  });

  it("explodes where it lands when it lands in a hollow", () => {
    const field = shaped((x) => 600 - Math.abs(x - 600) * 0.5);
    expect(Math.abs(roll(field, 600).explosion!.x - 600)).toBeLessThanOrEqual(2);
  });

  it("rolls on along level ground for a while, the way it was going, and stops", () => {
    // It comes down some 280 pixels from where it was dropped, and rolls on from there
    const right = roll(flatField(600), 400, 150).explosion!;
    const left = roll(flatField(600), 900, -150).explosion!;
    expect(right.x).toBeGreaterThan(720);
    expect(right.x).toBeLessThan(900);
    expect(Math.abs(900 - left.x - (right.x - 400))).toBeLessThanOrEqual(1);
  });

  it("turns back from a slope it cannot climb, and rolls down the other way", () => {
    // A slope that rises to the right, with level ground at its foot on the left
    const field = shaped((x) => (x < 300 ? 700 : 700 - (x - 300) * 0.5));
    const { explosion } = roll(field, 450, 20);
    expect(explosion!.x).toBeLessThan(300);
    expect(explosion!.x).toBeGreaterThan(0);
  });

  it("explodes at a tank it rolls into, and at once when it comes down on one", () => {
    const field = shaped((x) => 400 + x * 0.3, [{ x: 100 }, { x: 700 }]);
    const { explosion } = roll(field, 400);
    expect(explosion!.x).toBeGreaterThanOrEqual(700 - TANK_WIDTH / 2 - 1);
    expect(explosion!.x).toBeLessThanOrEqual(700);
    expect(field.tanks[1].energy).toBeLessThan(70);

    const direct = shaped((x) => 400 + x * 0.3, [{ x: 100 }, { x: 700 }]);
    const hit = roll(direct, 700);
    expect(hit.rolled).toBe(false);
    expect(direct.tanks[1].energy).toBeLessThan(50);
  });

  it("is gone when it rolls off the field, and never rolls for ever", () => {
    expect(
      roll(
        shaped((x) => 300 + x * 0.3),
        1000
      ).explosion
    ).toBeNull();
    // A slope so long and gentle that the time runs out
    const { explosion, seconds } = roll(
      shaped((x) => 300 + x * 0.41),
      5,
      0,
      "baby-roller"
    );
    if (explosion) expect(seconds).toBeLessThan(8);
  });
});

describe("the wind", () => {
  /** How far to the right of the tank a shot straight up comes down, in a wind. */
  const drift = (wind: number, power = 300) => {
    const field = { ...flatField(600, [{ x: 640, angle: 90, power }]), wind };
    const { events } = fly(field, launch(field.tanks[0], 1));
    return (events[0] as { x: number }).x - 640;
  };

  it("pushes what flies sideways, the way it blows, as hard as measured from the original", () => {
    // A wind of 400 pushes sideways as hard as gravity pulls down
    expect(WIND_PER_UNIT * 400).toBeCloseTo(GRAVITY, 6);
    expect(drift(0)).toBe(0);
    expect(drift(100)).toBeGreaterThan(20);
    expect(drift(-100)).toBe(-drift(100));
  });

  it("pushes twice as far when it is twice as strong, and much further on a longer flight", () => {
    expect(Math.abs(drift(200) - 2 * drift(100))).toBeLessThanOrEqual(3);
    // Twice the power is twice the time in the air, and four times the drift
    expect(drift(50, 600) / drift(50, 300)).toBeGreaterThan(3.5);
    expect(drift(50, 600) / drift(50, 300)).toBeLessThan(4.5);
  });
});

describe("the walls", () => {
  /** Follows a projectile until it explodes or is gone: where it exploded, and the furthest it was to each side and up. */
  const follow = (field: FieldState, shot: Shot) => {
    let shots = [shot];
    const seen = { left: shot.x, right: shot.x, top: shot.y, explosion: null as { x: number; y: number } | null };
    for (let step = 0; shots.length > 0 && step < 100000; step++) {
      const result = stepShots(field, shots);
      for (const flying of result.shots) {
        seen.left = Math.min(seen.left, flying.x);
        seen.right = Math.max(seen.right, flying.x);
        seen.top = Math.min(seen.top, flying.y);
      }
      const explosion = result.events.find((event) => event.event === "explode");
      if (explosion) seen.explosion = explosion as { x: number; y: number };
      shots = result.shots;
    }
    return seen;
  };
  const walled = (walls: FieldState["walls"], tanks: Partial<TankState>[] = []) => ({
    ...flatField(600, tanks),
    walls
  });
  /** A shot to the right from near the right side, which would land well past it. */
  const out = (): Shot => ({
    id: 1,
    owner: 0,
    weapon: "baby-missile",
    x: FIELD_WIDTH - 100,
    y: 400,
    vx: 400,
    vy: -300
  });

  it("let a projectile fly out past a side when there are none: it lands outside or is gone", () => {
    const seen = follow(walled("none"), out());
    expect(seen.right).toBeGreaterThan(FIELD_WIDTH);
    expect(seen.explosion).toBeNull();
  });

  it("throw a projectile back from the side when they are rubber", () => {
    const seen = follow(walled("rubber"), out());
    expect(seen.right).toBeLessThanOrEqual(FIELD_WIDTH);
    // It lands as far inside the field as it would have landed outside it
    const open = follow(
      { ...walled("none"), width: FIELD_WIDTH * 2, terrain: [...flatField(600).terrain, ...flatField(600).terrain] },
      out()
    );
    expect(seen.explosion!.x).toBeLessThan(FIELD_WIDTH - 100);
    expect(Math.abs(2 * FIELD_WIDTH - open.explosion!.x - seen.explosion!.x)).toBeLessThanOrEqual(3);
  });

  it("throw a projectile back from the top when they are rubber, and from the left side too", () => {
    const up = follow(walled("rubber"), { id: 1, owner: 0, weapon: "baby-missile", x: 640, y: 300, vx: 0, vy: -900 });
    expect(up.top).toBeGreaterThanOrEqual(0);
    expect(up.explosion!.x).toBe(640);
    const free = follow(walled("none"), { id: 1, owner: 0, weapon: "baby-missile", x: 640, y: 300, vx: 0, vy: -900 });
    expect(free.top).toBeLessThan(0);

    const left = follow(walled("rubber"), {
      id: 1,
      owner: 0,
      weapon: "baby-missile",
      x: 100,
      y: 400,
      vx: -400,
      vy: -300
    });
    expect(left.left).toBeGreaterThanOrEqual(0);
    expect(left.explosion!.x).toBeGreaterThan(100);
  });

  it("bring a projectile in from the other side when the field wraps around", () => {
    const seen = follow(walled("wraparound"), {
      id: 1,
      owner: 0,
      weapon: "baby-missile",
      x: FIELD_WIDTH - 100,
      y: 400,
      vx: 200,
      vy: -100
    });
    expect(seen.right).toBeLessThan(FIELD_WIDTH);
    // It went out on the right and landed on the left
    expect(seen.left).toBeLessThan(100);
    expect(seen.explosion!.x).toBeLessThan(FIELD_WIDTH / 2);
    const back = follow(walled("wraparound"), {
      id: 1,
      owner: 0,
      weapon: "baby-missile",
      x: 100,
      y: 400,
      vx: -200,
      vy: -100
    });
    expect(back.explosion!.x).toBeGreaterThan(FIELD_WIDTH / 2);
  });

  it("hit a tank that stands just inside the other side when the field wraps around", () => {
    const field = walled("wraparound", [{ x: 640 }, { x: 20 }]);
    follow(field, { id: 1, owner: 0, weapon: "nuke", x: FIELD_WIDTH - 60, y: 560, vx: 200, vy: -60 });
    expect(field.tanks[1].energy).toBeLessThan(100);
  });

  it("turn a roller back, or bring it in from the other side", () => {
    const slope = (walls: FieldState["walls"]) => {
      const field = walled(walls);
      // Ground that falls to the right all the way to the edge
      field.terrain = field.terrain.map((_, x) => [Math.round(300 + x * 0.3), FIELD_HEIGHT]);
      return follow(field, { id: 1, owner: 0, weapon: "roller", x: 1100, y: 100, vx: 0, vy: 0 });
    };
    expect(slope("none").explosion).toBeNull();
    expect(slope("rubber").explosion!.x).toBeGreaterThan(FIELD_WIDTH - 200);
    expect(slope("wraparound").explosion!.x).toBeLessThan(400);
  });
});

describe("the accessories of a tank", () => {
  /** Drops a weapon of the first tank straight down at an x. */
  const drop = (field: FieldState, weapon: string, x: number, parachutes: Record<number, number> = {}) => {
    let shots: Shot[] = [{ id: 1, owner: 0, weapon, x, y: 300, vx: 0, vy: 0 }];
    const events = [];
    for (let step = 0; shots.length > 0 && step < 100000; step++) {
      const result = stepShots(field, shots, undefined, parachutes);
      events.push(...result.events);
      shots = result.shots;
    }
    return events;
  };
  const shielded = (shield: number) => flatField(600, [{ x: 100 }, { x: 700, shield, shieldMax: shield }]);

  it("take the damage of an explosion with a shield, as long as the shield lasts", () => {
    const bare = shielded(0);
    drop(bare, "missile", 700);
    const damage = 100 - bare.tanks[1].energy;
    expect(damage).toBeGreaterThan(30);

    const field = shielded(100);
    const events = drop(field, "missile", 700);
    const taken = 100 - field.tanks[1].shield;
    expect(taken).toBeGreaterThan(30);
    expect(events).toContainEqual({ event: "shield", id: 1, amount: taken, by: 0 });
    // Not a scratch from the explosion: only the fall into the crater hurt, and the two make what a bare tank lost
    expect(100 - field.tanks[1].energy).toBe(damage - taken);
    expect(100 - field.tanks[1].energy).toBeLessThan(25);
  });

  it("let through what is more than the shield takes, and are gone then", () => {
    const field = shielded(10);
    const events = drop(field, "baby-nuke", 700);
    expect(events).toContainEqual({ event: "shield", id: 1, amount: 10, by: 0 });
    expect(field.tanks[1]).toMatchObject({ shield: 0, shieldMax: 0 });
    expect(field.tanks[1].energy).toBeLessThan(50);
  });

  it("do not protect a tank from its own shot", () => {
    const field = flatField(600, [{ x: 700, shield: 100, shieldMax: 100 }]);
    const events = drop(field, "missile", 700);
    expect(events.filter((event) => event.event === "shield")).toEqual([]);
    expect(field.tanks[0].shield).toBe(100);
    expect(field.tanks[0].energy).toBeLessThan(70);
  });

  it("open a parachute when a tank falls far enough to be hurt, and take the damage of the fall", () => {
    const bare = flatField(600, [{ x: 100 }, { x: 700 }]);
    drop(bare, "riot-bomb", 705);
    expect(bare.tanks[1].energy).toBeLessThan(90);

    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    const parachutes = { 1: 2 };
    const events = drop(field, "riot-bomb", 705, parachutes);
    expect(events).toContainEqual({ event: "parachute", id: 1 });
    expect(field.tanks[1].energy).toBe(100);
    // The tank still came down
    expect(field.tanks[1].y).toBeGreaterThan(600);
    expect(parachutes).toEqual({ 1: 1 });
  });

  it("do not waste a parachute on a small fall, and have none to open when there are none", () => {
    // A Baby Missile beside the tank takes a little of the ground from under it
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    const parachutes = { 1: 1 };
    const events = drop(field, "riot-bomb", 700 + TANK_WIDTH / 2 + 58, parachutes);
    expect(events.filter((event) => event.event === "parachute")).toEqual([]);
    expect(parachutes).toEqual({ 1: 1 });

    const none = flatField(600, [{ x: 100 }, { x: 700 }]);
    const without = drop(none, "riot-bomb", 705, { 1: 0 });
    expect(without.filter((event) => event.event === "parachute")).toEqual([]);
    expect(none.tanks[1].energy).toBeLessThan(90);
  });
});

describe("the weapons of the fourth phase", () => {
  /** Flies everything until nothing is in the air, and tells all that happened. */
  const play = (field: FieldState, first: Shot) => {
    let shots = [first];
    let id = first.id;
    const events = [];
    for (let step = 0; shots.length > 0 && step < 100000; step++) {
      const result = stepShots(field, shots, () => ++id);
      events.push(...result.events);
      shots = result.shots;
    }
    return events;
  };
  const explosions = (events: ReturnType<typeof play>) =>
    events.flatMap((event) => (event.event === "explode" ? [event] : []));
  const falling = (weapon: string, x: number, vx = 0): Shot => ({ id: 1, owner: 0, weapon, x, y: 300, vx, vy: 0 });

  it("split a Death's Head into nine large warheads", () => {
    const field = flatField(600, [{ x: 100, angle: 60, power: 500 }]);
    const blasts = explosions(play(field, launch(field.tanks[0], 1, "deaths-head")));
    expect(blasts).toHaveLength(9);
    expect(blasts.every((blast) => blast.radius === 70)).toBe(true);
    expect(new Set(blasts.map((blast) => blast.x)).size).toBe(9);
  });

  it("explode a Leap Frog three times, each time larger and further the way it was going", () => {
    const blasts = explosions(play(flatField(600), falling("leap-frog", 400, 120)));
    expect(blasts.map((blast) => blast.radius)).toEqual(LEAP_FROG_RADII.map((radius) => radius * 2));
    expect(blasts[1].x).toBeGreaterThan(blasts[0].x);
    expect(blasts[2].x).toBeGreaterThan(blasts[1].x);
    // A leap is a leap, not a flight: the three are within reach of each other
    expect(blasts[2].x - blasts[0].x).toBeLessThan(400);

    const left = explosions(play(flatField(600), falling("leap-frog", 400, -120)));
    expect(left[2].x).toBeLessThan(left[0].x);
  });

  it("hit a tank with all three explosions of a Leap Frog that comes down on it: its shield does not save it", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700, shield: 100, shieldMax: 100 }]);
    const events = play(field, falling("leap-frog", 700));
    expect(explosions(events)).toHaveLength(3);
    expect(field.tanks[1].shield).toBe(0);
    expect(field.tanks[1].energy).toBeLessThan(100);
  });

  it("throw bombs around where a Funky Bomb hits: each explodes where it comes down", () => {
    const field = flatField(600);
    const blasts = explosions(play(field, falling("funky-bomb", 640)));
    expect(blasts).toHaveLength(1 + FUNKY_BOMBS);
    expect(blasts[0]).toMatchObject({ x: 640, y: 600, radius: 40 });
    const thrown = blasts.slice(1).map((blast) => blast.x);
    // To both sides, to places of their own, and not much further than the reach
    expect(Math.min(...thrown)).toBeLessThan(640 - 40);
    expect(Math.max(...thrown)).toBeGreaterThan(640 + 40);
    expect(new Set(thrown).size).toBe(FUNKY_BOMBS);
    for (const x of thrown) expect(Math.abs(x - 640)).toBeLessThan(FUNKY_REACH * 2 + 60);
    // The same bomb at the same place scatters the same way
    expect(explosions(play(flatField(600), falling("funky-bomb", 640)))).toEqual(blasts);
  });

  it("do not set off the bombs of a Funky Bomb at the tank it hit: they fly out of it first", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700, shield: 1000, shieldMax: 1000 }]);
    const blasts = explosions(play(field, falling("funky-bomb", 700)));
    expect(blasts).toHaveLength(1 + FUNKY_BOMBS);
    // The shield took the one explosion at the tank and a part of those nearest to it, not seven on top of it
    expect(field.tanks[1].shield).toBeGreaterThan(1000 - 3 * 75);
    expect(blasts.slice(1).filter((blast) => Math.abs(blast.x - 700) > TANK_WIDTH / 2).length).toBeGreaterThanOrEqual(
      FUNKY_BOMBS - 2
    );
  });

  it("do nothing with a smoke tracer", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    const before = JSON.stringify(field);
    expect(play(field, falling("smoke-tracer", 700))).toEqual([]);
    expect(JSON.stringify(field)).toBe(before);
  });

  it("dig a buried tank out with a riot charge, without harm to it", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700, angle: 90, power: 0 }]);
    play(field, falling("dirt-ball", 700));
    const tip = 600 - TANK_HEIGHT - TURRET_LENGTH;
    expect(isDirt(field.terrain, 700, tip - 30)).toBe(true);

    const shot = launch(field.tanks[1], 2, "riot-charge");
    // It goes nowhere: only the way the turret points is in it
    expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(1);
    const result = stepShots(field, [shot]);
    expect(result.shots).toEqual([]);
    expect(result.events.map((event) => event.event)).toEqual(["explode", "terrain"]);
    expect(field.tanks[1]).toMatchObject({ y: 600, energy: 100 });
    // The way up from the turret is open
    for (let y = tip; y > 0; y--) expect(isDirt(field.terrain, 700, y)).toBe(false);
  });

  it("destroy a wedge of dirt the way the turret points: wider further away, and as far as the weapon reaches", () => {
    const wedge = (weapon: string, angle: number) => {
      const field = flatField(600, [{ x: 100, angle }]);
      const shot = launch(field.tanks[0], 1, weapon);
      const terrain = stepShots(field, [shot]).events.find((event) => event.event === "terrain");
      const ops = terrain?.event === "terrain" ? terrain.ops : [];
      expect(ops[ops.length - 1]).toEqual({ op: "settle" });
      return { shot, circles: ops.flatMap((op) => (op.op === "carve" ? [op] : [])) };
    };
    for (const [weapon, reach] of [
      ["riot-charge", 72],
      ["riot-blast", 120]
    ] as const) {
      const { shot, circles } = wedge(weapon, 0);
      // From the end of the turret, to the right along the ground
      expect(circles[0]).toMatchObject({ x: Math.round(shot.x), y: Math.round(shot.y) });
      const last = circles[circles.length - 1];
      expect(last.y).toBe(Math.round(shot.y));
      expect(last.x + last.r - shot.x).toBeGreaterThan(reach - 3);
      expect(last.x + last.r - shot.x).toBeLessThan(reach + 3);
      expect(last.r).toBeGreaterThan(circles[0].r * 2);
      for (let i = 1; i < circles.length; i++) expect(circles[i].r).toBeGreaterThanOrEqual(circles[i - 1].r);
    }
    // A Riot Blast is wider too
    const width = (weapon: string) => Math.max(...wedge(weapon, 0).circles.map((circle) => circle.r));
    expect(width("riot-blast")).toBeGreaterThan(width("riot-charge") * 1.5);
    // Straight up when the turret points up
    const up = wedge("riot-charge", 90);
    expect(up.circles.every((circle) => circle.x === Math.round(up.shot.x))).toBe(true);
    expect(up.circles[up.circles.length - 1].y).toBeLessThan(up.shot.y - 40);
  });

  it("dig a way through a wall with a riot blast, and harm nobody", () => {
    const field = flatField(600, [
      { x: 100, angle: 0 },
      { x: 300, y: 400 }
    ]);
    for (let x = 140; x < 400; x++) field.terrain[x] = [400, FIELD_HEIGHT];
    stepShots(field, [launch(field.tanks[0], 1, "riot-blast")]);
    // The dirt above the hole came down: the wall is lower where the blast reached, and as it was beyond
    expect(field.terrain[160][0]).toBeGreaterThan(400);
    expect(field.terrain[300][0]).toBe(400);
    expect(field.tanks.map((tank) => tank.energy)).toEqual([100, 100]);
  });

  it("let a tank fall when a riot charge takes the ground from under it", () => {
    const field = flatField(600, [
      { x: 100, angle: 0 },
      { x: 150, y: 560 }
    ]);
    // The other tank stands on a pillar right in front of the turret
    for (let x = 136; x < 165; x++) field.terrain[x] = [560, FIELD_HEIGHT];
    const { events } = stepShots(field, [launch(field.tanks[0], 1, "riot-blast")]);
    expect(field.tanks[1].y).toBeGreaterThan(560);
    expect(events).toContainEqual(expect.objectContaining({ event: "damage", id: 1, by: 0 }));
  });

  const carves = (events: ReturnType<typeof play>) =>
    events
      .flatMap((event) => (event.event === "terrain" ? event.ops : []))
      .flatMap((op) => (op.op === "carve" ? [op] : []));

  it("tunnel into the dirt with a digger, the way it came down: more and longer tunnels with a bigger one", () => {
    const dig = (weapon: string) => carves(play(flatField(300), falling(weapon, 640)));
    const baby = dig("baby-digger");
    // Straight down from where it landed, 30 pixels of the original deep
    expect(baby.every((op) => op.x === 640 && op.r === 6)).toBe(true);
    expect(Math.max(...baby.map((op) => op.y))).toBe(360);
    const heavy = dig("heavy-digger");
    expect(Math.max(...heavy.map((op) => op.y))).toBe(420);
    // Five tunnels that fan out to both sides
    expect(Math.min(...heavy.map((op) => op.x))).toBeLessThan(640 - 60);
    expect(Math.max(...heavy.map((op) => op.x))).toBeGreaterThan(640 + 60);
    expect(heavy.length).toBeGreaterThan(baby.length * 4);
  });

  it("eat the dirt a little at a time: the head of a tunnel is a projectile until the tunnel is done", () => {
    const field = flatField(300);
    let shots = [falling("heavy-digger", 640)];
    let id = 1;
    // Until it has landed
    while (!shots[0].dig) shots = stepShots(field, shots, () => ++id).shots;
    expect(shots).toHaveLength(5);
    expect(new Set(shots.map((shot) => shot.id)).size).toBe(5);

    let steps = 0;
    let settled = 0;
    const depths: number[] = [];
    for (; shots.length > 0 && steps < 1000; steps++) {
      const result = stepShots(field, shots, () => ++id);
      const ops = result.events.flatMap((event) => (event.event === "terrain" ? event.ops : []));
      settled += ops.filter((op) => op.op === "settle").length;
      // The dirt does not fall before every tunnel is done
      if (result.shots.length > 0) expect(settled).toBe(0);
      if (result.shots[2]) depths.push(result.shots[2].y);
      shots = result.shots;
    }
    // 120 pixels at the speed of digging: more than a second
    expect(steps).toBeGreaterThan((120 / DIG_SPEED) * STEPS_PER_SECOND - 2);
    expect(settled).toBe(1);
    expect(depths[0]).toBeLessThan(310);
    expect(depths[depths.length - 1]).toBe(420);
    for (let i = 1; i < depths.length; i++) expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]);
  });

  it("tell which bomb of a Funky Bomb each explosion is of, and not for the one where it hit", () => {
    const blasts = explosions(play(flatField(600), falling("funky-bomb", 640)));
    expect(blasts[0].part).toBeUndefined();
    expect(
      blasts
        .slice(1)
        .map((blast) => blast.part)
        .sort()
    ).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("let the ground down above the tunnels of a digger, and harm nobody", () => {
    const field = flatField(400, [{ x: 100 }, { x: 640 }]);
    const events = play(field, falling("heavy-digger", 600, 100));
    expect(events.some((event) => event.event === "explode" && event.weapon === "heavy-digger")).toBe(true);
    const landed = explosions(events)[0].x;
    expect(field.terrain[landed + 10][0]).toBeGreaterThan(400);
    // No dirt hangs in the air: each column is one piece again
    expect(field.terrain.every((column) => column.length === 2)).toBe(true);
    expect(field.tanks[0].energy).toBe(100);
  });

  it("fizzle a digger that comes down on a tank", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    const before = JSON.stringify(field);
    expect(play(field, falling("digger", 700))).toEqual([]);
    expect(JSON.stringify(field)).toBe(before);
  });

  it("tunnel sideways with a sandhog, one charge after another: each digs on from where the one before went off", () => {
    const field = flatField(400);
    let shots = [falling("sandhog", 400, 150)];
    const blasts: { x: number; y: number; step: number }[] = [];
    let most = 0;
    for (let step = 0; shots.length > 0 && step < 100000; step++) {
      const result = stepShots(field, shots);
      for (const event of result.events) {
        if (event.event === "explode" && event.radius === 24) blasts.push({ x: event.x, y: event.y, step });
      }
      most = Math.max(most, result.shots.length);
      shots = result.shots;
    }
    // Never more than one in the ground at a time
    expect(most).toBe(1);
    expect(blasts).toHaveLength(5);
    for (let i = 1; i < blasts.length; i++) {
      // Each a tunnel further the way it was going, and that much later
      expect(blasts[i].x - blasts[i - 1].x).toBeGreaterThan(55);
      expect(blasts[i].x - blasts[i - 1].x).toBeLessThanOrEqual(60);
      expect(blasts[i].step - blasts[i - 1].step).toBeGreaterThan(30);
    }
    // The first tunnel dives under the ground, the rest are level
    expect(blasts[0].y).toBeGreaterThan(405);
    expect(new Set(blasts.map((blast) => blast.y)).size).toBe(1);

    const left = explosions(play(flatField(400), falling("sandhog", 400, -150))).filter((blast) => blast.radius === 24);
    expect(left).toHaveLength(5);
    expect(left[4].x).toBeLessThan(left[0].x - 200);
  });

  it("end a sandhog at a tank that its tunnel reaches: the charges that are left are lost", () => {
    const field = flatField(400, [{ x: 100 }, { x: 660 }]);
    // A tank that is dug in to the depth of the tunnels: they run into it
    field.tanks[1].y = 416;
    const blasts = explosions(play(field, falling("heavy-sandhog", 310, 150))).filter((blast) => blast.radius === 30);
    expect(blasts.length).toBeGreaterThan(1);
    expect(blasts.length).toBeLessThan(7);
    expect(Math.abs(blasts[blasts.length - 1].x - 660)).toBeLessThanOrEqual(TANK_WIDTH / 2);
    expect(field.tanks[1].energy).toBeLessThan(100);
  });

  it("reach a tank from under its shield with a sandhog that lands beside it", () => {
    const field = flatField(400, [{ x: 100 }, { x: 500, shield: 100, shieldMax: 100 }]);
    const events = play(field, falling("heavy-sandhog", 310, 150));
    expect(field.tanks[1].shield).toBe(100);
    expect(field.tanks[1].energy).toBeLessThan(100);
    expect(events).toContainEqual(expect.objectContaining({ event: "damage", id: 1, by: 0 }));
    expect(events.some((event) => event.event === "shield")).toBe(false);
  });

  it("explode a sandhog that comes down on a tank as the one charge it is", () => {
    const field = flatField(400, [{ x: 100 }, { x: 500 }]);
    const blasts = explosions(play(field, falling("sandhog", 500)));
    expect(blasts).toHaveLength(1);
    expect(field.tanks[1].energy).toBeLessThan(100);
  });

  it("throw a wedge of dirt with a dirt charge: it falls in front of the tank and does not bury the turret", () => {
    const field = flatField(600, [{ x: 100, angle: 30, power: 300 }, { x: 700 }]);
    const shot = launch(field.tanks[0], 1, "dirt-charge");
    const { events, shots } = stepShots(field, [shot]);
    expect(shots).toEqual([]);
    const terrain = events.find((event) => event.event === "terrain");
    const fills = terrain?.event === "terrain" ? terrain.ops.filter((op) => op.op === "fill") : [];
    expect(fills.length).toBeGreaterThan(5);
    // A pile of dirt in front of the tank
    const pile = Math.min(...field.terrain.slice(140, 240).map((column) => column[0]));
    expect(pile).toBeLessThan(570);
    expect(field.terrain[100][0]).toBe(600);
    expect(isDirt(field.terrain, shot.x, shot.y)).toBe(false);
    // The tank can still fire over it or into it without its shot going off at the turret
    const next = stepShots(field, [launch(field.tanks[0], 2)]);
    expect(next.events).toEqual([]);
    expect(field.tanks.map((tank) => tank.energy)).toEqual([100, 100]);
  });

  describe("with dirt that stays in the air", () => {
    const hangs = () => true;
    /** Flies a projectile until nothing is in the air, with dirt that hangs. */
    const hang = (field: FieldState, first: Shot, staying = hangs) => {
      let shots = [first];
      const events = [];
      for (let step = 0; shots.length > 0 && step < 100000; step++) {
        const result = stepShots(field, shots, undefined, {}, staying);
        events.push(...result.events);
        shots = result.shots;
      }
      return events;
    };

    it("leave the tunnels of a digger open, and the ground above them where it was", () => {
      const field = flatField(400);
      const events = hang(field, falling("baby-digger", 640));
      expect(
        events.flatMap((event) => (event.event === "terrain" ? event.ops : [])).some((op) => op.op === "settle")
      ).toBe(false);
      expect(isDirt(field.terrain, 640, 430)).toBe(false);
      // Beside the tunnel the ground is as it was, and so is the dirt below its end
      expect(field.terrain[660]).toEqual([400, FIELD_HEIGHT]);
      expect(isDirt(field.terrain, 640, 480)).toBe(true);
    });

    it("ask whether the dirt hangs each time, and let it fall when it does not", () => {
      const field = flatField(400);
      let asked = 0;
      const sometimes = () => ++asked === 1;
      // The dirt of a ball that goes off in the air on a pillar hangs the first time
      field.terrain[640] = [300, 310, 400, FIELD_HEIGHT];
      hang(field, falling("dirt-clod", 640), sometimes);
      expect(field.terrain[640].length).toBeGreaterThan(2);
      expect(asked).toBe(1);
      hang(field, falling("baby-missile", 200), sometimes);
      expect(asked).toBe(2);
      expect(field.terrain.every((column) => column.length === 2)).toBe(true);
    });

    it("bring all of it down with an Earth Disrupter, wherever that lands", () => {
      const field = flatField(400, [{ x: 100 }, { x: 640, y: 300 }]);
      // A tank on a ledge that hangs in the air
      for (let x = 600; x < 680; x++) field.terrain[x] = [300, 320, 400, FIELD_HEIGHT];
      const events = hang(field, falling("earth-disrupter", 200));
      expect(events.map((event) => event.event)).toEqual(["explode", "damage", "terrain"]);
      expect(events[2]).toEqual({ event: "terrain", ops: [{ op: "settle" }] });
      expect(field.terrain[640]).toEqual([380, FIELD_HEIGHT]);
      // The tank came down with its ledge, and the fall hurt it
      expect(field.tanks[1].y).toBe(380);
      expect(field.tanks[1].energy).toBe(60);
      expect(field.tanks[0].energy).toBe(100);
    });

    it("let a tank fall only to the dirt below it: dirt that hangs above it is not ground", () => {
      const field = flatField(400, [{ x: 100 }, { x: 640 }]);
      // A roof over the tank
      for (let x = 600; x < 680; x++) field.terrain[x] = [300, 320, 400, FIELD_HEIGHT];
      hang(field, falling("baby-missile", 200));
      expect(field.tanks[1].y).toBe(400);
      // The ground goes from under it: it falls to what is left, not up to the roof
      for (let x = 600; x < 680; x++) field.terrain[x] = [300, 320, 450, FIELD_HEIGHT];
      hang(field, falling("baby-missile", 200));
      expect(field.tanks[1].y).toBe(450);
    });
  });

  describe("that flow", () => {
    it("let a liquid lie nearly level on flat ground, as much to each side", () => {
      const tops = Array.from({ length: 400 }, () => 300);
      flow(tops, 200, 1000, 8);
      // All of it is there, on top of the ground
      expect(tops.reduce((sum, top) => sum + (300 - top), 0)).toBe(1000);
      const depth = (x: number) => 300 - tops[x];
      expect(depth(200)).toBeGreaterThan(8);
      expect(depth(200)).toBeLessThan(16);
      expect(Math.abs(depth(150) - depth(250))).toBeLessThanOrEqual(1);
      // It never rises by more than a pixel from a column to the next
      for (let x = 1; x < 400; x++) expect(Math.abs(tops[x] - tops[x - 1])).toBeLessThanOrEqual(1);
      expect(depth(20)).toBe(0);
    });

    it("let it run downhill into a hole and fill that first", () => {
      const tops = Array.from({ length: 400 }, (_, x) => 300 - Math.round(x / 4));
      // A hole down the slope
      for (let x = 100; x < 120; x++) tops[x] = 320;
      const before = [...tops];
      flow(tops, 300, 600, 8);
      expect(tops[300]).toBe(before[300]);
      for (let x = 100; x < 120; x++) expect(tops[x]).toBeLessThan(300);
      // What went past the edge of the field is gone
      const flat = Array.from({ length: 100 }, (_, x) => 300 - x);
      flow(flat, 50, 500, 8);
      expect(flat.reduce((sum, top, x) => sum + (300 - x - top), 0)).toBeLessThan(500);
    });

    it("let a liquid that sticks leave a film on the slope it runs down, and take the rest to the hollow", () => {
      const slope = () => Array.from({ length: 400 }, (_, x) => (x < 200 ? 400 : 300 - Math.round((x - 200) / 2)));
      const under = slope();
      const plain = slope();
      flow(plain, 350, 900, 16);
      const sticky = slope();
      flow(sticky, 350, 900, 16, { under, film: 3 });
      const depth = (tops: number[], x: number) => under[x] - tops[x];
      // Without sticking nothing stays on the slope
      expect(depth(plain, 300)).toBe(0);
      for (let x = 210; x <= 350; x++) expect(depth(sticky, x)).toBe(3);
      // The rest is at the foot of the slope, deeper than the film
      expect(depth(sticky, 190)).toBeGreaterThan(3);
      expect(sticky.reduce((sum, top, x) => sum + under[x] - top, 0)).toBe(900);
    });

    it("ooze liquid dirt out of where it lands, a little at a time: it fills a hole and becomes ground", () => {
      const field = flatField(400, [{ x: 100 }]);
      for (let x = 600; x < 680; x++) field.terrain[x] = [460, FIELD_HEIGHT];
      const dirt = () => field.terrain.reduce((sum, column) => sum + column[1] - column[0], 0);
      const before = dirt();
      let shots = [falling("liquid-dirt", 640)];
      let pours = 0;
      for (let step = 0; shots.length > 0 && step < 10000; step++) {
        const result = stepShots(field, shots);
        for (const event of result.events) {
          if (event.event === "terrain") pours += event.ops.filter((op) => op.op === "pour").length;
        }
        shots = result.shots;
      }
      expect(pours).toBeGreaterThan(30);
      expect(dirt() - before).toBe(8000);
      // The hole is full, and the rest lies on the ground around it
      for (let x = 600; x < 680; x++) expect(field.terrain[x][0]).toBeLessThanOrEqual(400);
      expect(field.terrain[560][0]).toBeLessThan(400);
      expect(field.terrain.every((column) => column.length === 2)).toBe(true);
      expect(field.tanks[0]).toMatchObject({ y: 400, energy: 100 });
    });

    it("burn a tank with napalm by how deep it lies on it: the most where it landed, none far away", () => {
      const burnt = (weapon: string, distance: number) => {
        const field = flatField(400, [{ x: 100 }, { x: 640 + distance }]);
        const events = play(field, falling(weapon, 640));
        return { field, events, lost: 100 - field.tanks[1].energy };
      };
      const near = burnt("napalm", 20);
      // It is told where it burns again and again as it spreads, and the damage comes when all of it is out
      const kinds = near.events.map((event) => event.event);
      expect(kinds.slice(-2)).toEqual(["damage", "terrain"]);
      expect(kinds.slice(0, -2).every((kind) => kind === "burn")).toBe(true);
      const burns = near.events.flatMap((event) => (event.event === "burn" ? [event] : []));
      expect(burns.length).toBeGreaterThan(10);
      const amounts = burns.map((told) => told.depths.reduce((sum, depth) => sum + depth, 0));
      for (let i = 1; i < amounts.length; i++) expect(amounts[i]).toBeGreaterThan(amounts[i - 1]);
      expect(amounts[0]).toBeLessThan(200);
      expect(new Set(burns.map((told) => told.id)).size).toBe(1);
      expect(burns[0].depths.length).toBeLessThan(burns[burns.length - 1].depths.length);
      const burn = burns[burns.length - 1];
      expect(burn.depths.reduce((sum, depth) => sum + depth, 0)).toBe(1500);
      expect(burn.x).toBeLessThan(640 - 100);
      expect(burn.depths.every((depth) => depth >= 0)).toBe(true);
      // The dirt does not burn
      expect(near.field.terrain.every((column) => column[0] === 400)).toBe(true);
      expect(near.lost).toBeGreaterThan(40);
      expect(near.lost).toBeLessThanOrEqual(60);
      expect(burnt("napalm", 130).lost).toBeLessThan(near.lost);
      expect(burnt("napalm", 130).lost).toBeGreaterThan(0);
      expect(burnt("napalm", 300).lost).toBe(0);
      expect(burnt("hot-napalm", 130).lost).toBeGreaterThan(burnt("napalm", 130).lost);
    });

    it("burn a tank on a ledge over a pool of napalm: the flames reach it from beside", () => {
      const ledge = (drop: number) => {
        const field = flatField(400, [{ x: 100 }, { x: 640 }]);
        // A pit right beside the tank, which the napalm fills
        for (let x = 660; x < 760; x++) field.terrain[x] = [400 + drop, FIELD_HEIGHT];
        play(field, falling("hot-napalm", 700));
        return 100 - field.tanks[1].energy;
      };
      expect(ledge(20)).toBe(100);
      // What lies far below does not reach it
      expect(ledge(250)).toBe(0);
    });

    it("run napalm into a hollow, where a tank is burnt the worst, and stop it with a shield", () => {
      const hollow = (shield: number) => {
        const field = flatField(400, [{ x: 100 }, { x: 800, y: 440, shield, shieldMax: shield }]);
        // A slope down from where it lands to the hollow of the tank
        for (let x = 600; x < 760; x++) field.terrain[x] = [400 + Math.round((x - 600) / 4), FIELD_HEIGHT];
        for (let x = 760; x < 840; x++) field.terrain[x] = [440, FIELD_HEIGHT];
        play(field, falling("napalm", 620));
        return field.tanks[1];
      };
      expect(hollow(0).energy).toBe(40);
      expect(hollow(100)).toMatchObject({ energy: 100, shield: 40 });
    });
  });
});
