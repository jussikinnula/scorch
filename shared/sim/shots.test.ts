// @vitest-environment node
import { describe, expect, it } from "vitest";

import { FieldState, TankState } from "../protocol";
import { FIELD_HEIGHT, FIELD_WIDTH, TANK_HEIGHT, TANK_WIDTH, TURRET_LENGTH } from "./field";
import {
  BABY_MISSILE_RADIUS,
  blastRadius,
  damageTo,
  GRAVITY,
  launch,
  Shot,
  SPEED_PER_POWER,
  stepShots,
  STEPS_PER_SECOND,
  WIND_PER_UNIT
} from "./shots";
import { findWeapon, MIRV_WARHEADS } from "../weapons";
import { applyTerrainOp, carve, fill, isDirt, settle, Terrain } from "./terrain";

/** A field of level ground at the given y, with the given tanks on it. */
const flatField = (ground: number, tanks: Partial<TankState>[] = []): FieldState => ({
  width: FIELD_WIDTH,
  height: FIELD_HEIGHT,
  terrain: Array.from({ length: FIELD_WIDTH }, () => [ground, FIELD_HEIGHT]),
  tanks: tanks.map((tank, id) => ({ id, x: 100, y: ground, angle: 45, power: 500, energy: 100, ...tank })),
  wind: 0
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
    const tank: TankState = { id: 3, x: 100, y: 500, angle: 90, power: 400, energy: 100 };
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
    const shot = launch({ id: 0, x: 100, y: 600, angle: 45, power, energy: 100 }, 1);
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
    const shot = launch({ id: 0, x: 640, y: 700, angle: 90, power: 300, energy: 100 }, 1);
    const { highest } = fly(field, shot);
    const rise = (300 * SPEED_PER_POWER) ** 2 / (2 * GRAVITY);
    expect(shot.y - highest).toBeGreaterThan(rise * 0.97);
    expect(shot.y - highest).toBeLessThan(rise * 1.03);
  });

  it("comes back when it flies over the top of the field", () => {
    const field = flatField(700);
    const { highest, events } = fly(field, launch({ id: 0, x: 640, y: 700, angle: 85, power: 900, energy: 100 }, 1));
    expect(highest).toBeLessThan(0);
    expect(events[0]).toMatchObject({ event: "explode", y: 700 });
  });

  it("is gone when it flies far past the side of the field", () => {
    const field = flatField(700);
    const { events } = fly(field, launch({ id: 0, x: 100, y: 700, angle: 135, power: 600, energy: 100 }, 1));
    expect(events).toEqual([]);
  });

  it("explodes where it hits the ground: the dirt is destroyed and the terrain is told", () => {
    const field = flatField(600);
    const { events } = fly(field, launch({ id: 0, x: 200, y: 600, angle: 60, power: 300, energy: 100 }, 1));

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
    const { events } = fly(field, launch({ id: 0, x: 100, y: 600, angle: 20, power: 1000, energy: 100 }, 1));
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
  const tank: TankState = { id: 0, x: 500, y: 600, angle: 45, power: 500, energy: 100 };
  const side = 500 + TANK_WIDTH / 2;

  it("is all of the energy when the explosion is at the body of the tank", () => {
    expect(damageTo(tank, 500, 600 - TANK_HEIGHT, 20)).toBe(100);
    expect(damageTo(tank, side, 600, 20)).toBe(100);
    expect(damageTo(tank, 495, 595, 20)).toBe(100);
  });

  it("is less the further the explosion is from the body, and none a radius away", () => {
    const beside = (distance: number) => damageTo(tank, side + distance, 600, 20);
    expect(beside(5)).toBe(75);
    expect(beside(10)).toBe(50);
    // What was measured in the original: about 31 and 21 for two shots that landed beside a tank
    expect(beside(14)).toBe(30);
    expect(beside(16)).toBe(20);
    expect(beside(19)).toBe(5);
    expect(beside(20)).toBe(0);
    expect(damageTo(tank, 500, 600 - TANK_HEIGHT - 20, 20)).toBe(0);
    expect(damageTo(tank, 500, 600 - TANK_HEIGHT - 10, 20)).toBe(50);
  });

  it("takes energy from a tank beside which a shot lands, and tells it", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700, power: 900 }]);
    const { events } = fly(field, {
      id: 1,
      owner: 0,
      weapon: "baby-missile",
      x: 700 + TANK_WIDTH / 2 + 10,
      y: 300,
      vx: 0,
      vy: 0
    });

    const energy = field.tanks[1].energy;
    expect(energy).toBe(50);
    expect(events).toContainEqual({ event: "damage", id: 1, energy, amount: 50, by: 0 });
    expect(field.tanks[0].energy).toBe(100);
    // The power is at most ten times the energy
    expect(field.tanks[1].power).toBe(500);
  });

  it("destroys a tank that is hit, which then does not stop projectiles or take damage", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    const { events } = fly(field, { id: 1, owner: 0, weapon: "baby-missile", x: 700, y: 300, vx: 0, vy: 0 });
    expect(field.tanks[1]).toMatchObject({ energy: 0, power: 0 });
    expect(events).toContainEqual({ event: "damage", id: 1, energy: 0, amount: 100, by: 0 });

    const next = fly(field, { id: 2, owner: 0, weapon: "baby-missile", x: 700, y: 300, vx: 0, vy: 0 });
    expect(next.events.filter((event) => event.event === "damage")).toEqual([]);
    // It fell through the wreck to the ground
    expect((next.events[0] as { y: number }).y).toBeGreaterThan(600 - TANK_HEIGHT);
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
    expect(beside("baby-missile")).toBe(100);
    expect(beside("missile")).toBe(75);
    // A Nuke also takes the ground from under the tank, and the fall takes the rest
    expect(beside("nuke")).toBe(0);
  });

  it("destroy dirt with a riot bomb, which does not harm a tank but lets it fall", () => {
    // Far enough to the side that the ground under the tank stays
    const safe = flatField(600, [{ x: 100 }, { x: 700 }]);
    const { events } = drop(safe, "riot-bomb", 700 + TANK_WIDTH / 2 + 62);
    expect(events[0]).toMatchObject({ event: "explode", radius: 60, weapon: "riot-bomb" });
    expect(events.filter((event) => event.event === "damage")).toEqual([]);
    expect(safe.tanks[1]).toMatchObject({ y: 600, energy: 100 });

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
    expect(field.tanks[1]).toMatchObject({ y: 600, energy: 100 });
    expect(field.terrain[700][0]).toBeLessThan(600 - TANK_HEIGHT);
  });

  it("hurt a buried tank that fires: its shot goes off at the turret", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700, angle: 90, power: 500 }]);
    drop(field, "dirt-ball", 700);
    const { events } = fly(field, launch(field.tanks[1], 2));
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
    expect(field.tanks[1].energy).toBe(0);

    const direct = shaped((x) => 400 + x * 0.3, [{ x: 100 }, { x: 700 }]);
    const hit = roll(direct, 700);
    expect(hit.rolled).toBe(false);
    expect(direct.tanks[1].energy).toBe(0);
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
