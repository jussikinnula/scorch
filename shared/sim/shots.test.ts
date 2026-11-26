// @vitest-environment node
import { describe, expect, it } from "vitest";

import { FieldState, TankState } from "../protocol";
import { FIELD_HEIGHT, FIELD_WIDTH, TANK_HEIGHT, TURRET_LENGTH } from "./field";
import { BABY_MISSILE_RADIUS, GRAVITY, launch, Shot, SPEED_PER_POWER, stepShots, STEPS_PER_SECOND } from "./shots";
import { applyTerrainOp, carve, isDirt, settle, Terrain } from "./terrain";

/** A field of level ground at the given y, with the given tanks on it. */
const flatField = (ground: number, tanks: Partial<TankState>[] = []): FieldState => ({
  width: FIELD_WIDTH,
  height: FIELD_HEIGHT,
  terrain: Array.from({ length: FIELD_WIDTH }, () => [ground, FIELD_HEIGHT]),
  tanks: tanks.map((tank, id) => ({ id, x: 100, y: ground, angle: 45, power: 500, ...tank }))
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
    const tank: TankState = { id: 3, x: 100, y: 500, angle: 90, power: 400 };
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
    const shot = launch({ id: 0, x: 100, y: 600, angle: 45, power }, 1);
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
    const shot = launch({ id: 0, x: 640, y: 700, angle: 90, power: 300 }, 1);
    const { highest } = fly(field, shot);
    const rise = (300 * SPEED_PER_POWER) ** 2 / (2 * GRAVITY);
    expect(shot.y - highest).toBeGreaterThan(rise * 0.97);
    expect(shot.y - highest).toBeLessThan(rise * 1.03);
  });

  it("comes back when it flies over the top of the field", () => {
    const field = flatField(700);
    const { highest, events } = fly(field, launch({ id: 0, x: 640, y: 700, angle: 85, power: 900 }, 1));
    expect(highest).toBeLessThan(0);
    expect(events[0]).toMatchObject({ event: "explode", y: 700 });
  });

  it("is gone when it flies far past the side of the field", () => {
    const field = flatField(700);
    const { events } = fly(field, launch({ id: 0, x: 100, y: 700, angle: 135, power: 600 }, 1));
    expect(events).toEqual([]);
  });

  it("explodes where it hits the ground: the dirt is destroyed and the terrain is told", () => {
    const field = flatField(600);
    const { events } = fly(field, launch({ id: 0, x: 200, y: 600, angle: 60, power: 300 }, 1));

    const [explosion, terrain] = events;
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
    const { events } = fly(field, launch({ id: 0, x: 100, y: 600, angle: 20, power: 1000 }, 1));
    expect(events[0]).toMatchObject({ event: "explode" });
    expect((events[0] as { x: number }).x).toBeGreaterThanOrEqual(399);
    expect((events[0] as { x: number }).x).toBeLessThanOrEqual(403);
  });

  it("explodes when it hits a tank", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    const shot: Shot = { id: 1, owner: 0, x: 700, y: 300, vx: 0, vy: 0 };
    const { events } = fly(field, shot);
    expect(events[0]).toMatchObject({ event: "explode", x: 700 });
    const { y } = events[0] as { y: number };
    expect(y).toBeGreaterThanOrEqual(600 - TANK_HEIGHT);
    expect(y).toBeLessThanOrEqual(600 - TANK_HEIGHT + 2);
  });

  it("brings the tanks down with the ground under them", () => {
    const field = flatField(600, [{ x: 100 }, { x: 700 }]);
    fly(field, { id: 1, owner: 0, x: 705, y: 300, vx: 0, vy: 0 });
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
