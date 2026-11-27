// @vitest-environment node
import { describe, expect, it } from "vitest";

import { addTank, createField, drawWind, FIELD_HEIGHT, FIELD_WIDTH, removeTank, TANK_WIDTH } from "./field";
import { createRandom, randomInteger } from "./random";
import { flatten, generateTerrain, groundAt } from "./terrain";

describe("createRandom", () => {
  it("gives the same numbers for the same seed, and others for another", () => {
    const numbers = (seed: number) => {
      const random = createRandom(seed);
      return Array.from({ length: 5 }, random);
    };
    expect(numbers(1)).toEqual(numbers(1));
    expect(numbers(1)).not.toEqual(numbers(2));
  });

  it("gives numbers from 0 to 1, and whole numbers in a range", () => {
    const random = createRandom(123);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const integer = randomInteger(random, 3, 5);
      expect([3, 4, 5]).toContain(integer);
    }
  });
});

describe("generateTerrain", () => {
  it("makes a column of plain ground for each x, inside the field", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const terrain = generateTerrain(FIELD_WIDTH, FIELD_HEIGHT, createRandom(seed));
      expect(terrain).toHaveLength(FIELD_WIDTH);
      for (const column of terrain) {
        expect(column).toHaveLength(2);
        expect(Number.isInteger(column[0])).toBe(true);
        expect(column[0]).toBeGreaterThanOrEqual(0.25 * FIELD_HEIGHT);
        expect(column[0]).toBeLessThan(FIELD_HEIGHT);
        expect(column[1]).toBe(FIELD_HEIGHT);
      }
    }
  });

  it("has no cliffs: the ground changes little from a column to the next", () => {
    const terrain = generateTerrain(FIELD_WIDTH, FIELD_HEIGHT, createRandom(7));
    for (let x = 1; x < terrain.length; x++) expect(Math.abs(terrain[x][0] - terrain[x - 1][0])).toBeLessThanOrEqual(6);
  });

  it("is the same for the same seed", () => {
    const terrain = (seed: number) => generateTerrain(FIELD_WIDTH, FIELD_HEIGHT, createRandom(seed));
    expect(terrain(42)).toEqual(terrain(42));
    expect(terrain(42)).not.toEqual(terrain(43));
  });
});

describe("the ground", () => {
  it("is found at an x, also outside the field and in an empty column", () => {
    const terrain = [[100, 200], [150, 200], []];
    expect(groundAt(terrain, 0, 200)).toBe(100);
    expect(groundAt(terrain, 1.4, 200)).toBe(150);
    expect(groundAt(terrain, -5, 200)).toBe(100);
    expect(groundAt(terrain, 2, 200)).toBe(200);
    expect(groundAt(terrain, 99, 200)).toBe(200);
  });

  it("can be made level", () => {
    const terrain = [
      [10, 50],
      [20, 50],
      [30, 50],
      [40, 50],
      [50, 50]
    ];
    flatten(terrain, 2, 1, 50);
    expect(terrain.map((column) => column[0])).toEqual([10, 30, 30, 30, 50]);
  });
});

describe("the field", () => {
  it("has a tank for each player, on the ground and inside the field", () => {
    const field = createField([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], createRandom(5));
    expect(field).toMatchObject({ width: FIELD_WIDTH, height: FIELD_HEIGHT });
    expect(field.tanks.map((tank) => tank.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    for (const tank of field.tanks) {
      expect(tank.x).toBeGreaterThan(TANK_WIDTH);
      expect(tank.x).toBeLessThan(FIELD_WIDTH - TANK_WIDTH);
      expect(tank.y).toBe(groundAt(field.terrain, tank.x, FIELD_HEIGHT));
      // The ground is level under the whole tank
      for (let x = tank.x - TANK_WIDTH / 2; x <= tank.x + TANK_WIDTH / 2; x++) expect(field.terrain[x][0]).toBe(tank.y);
    }
  });

  it("keeps the tanks apart from each other", () => {
    for (const seed of [1, 2, 3]) {
      const xs = createField([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], createRandom(seed))
        .tanks.map((tank) => tank.x)
        .sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(2 * TANK_WIDTH);
    }
  });

  it("aims the tanks up and towards the middle, at half power", () => {
    for (const tank of createField([0, 1, 2, 3], createRandom(9)).tanks) {
      expect(tank.angle).toBe(tank.x < FIELD_WIDTH / 2 ? 60 : 120);
      expect(tank.power).toBe(500);
    }
  });

  it("puts the players in a random order, the same for the same seed", () => {
    const order = (seed: number) =>
      [...createField([0, 1, 2, 3, 4, 5], createRandom(seed)).tanks].sort((a, b) => a.x - b.x).map((tank) => tank.id);
    expect(order(1)).toEqual(order(1));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => order(seed).join())).size).toBeGreaterThan(1);
  });

  it("adds a tank in the widest gap, and removes one", () => {
    const field = createField([0, 1], createRandom(3));
    const [left, right] = field.tanks.map((tank) => tank.x).sort((a, b) => a - b);

    const added = addTank(field, 2);
    expect(field.tanks.map((tank) => tank.id)).toEqual([0, 1, 2]);
    expect(added.y).toBe(groundAt(field.terrain, added.x, FIELD_HEIGHT));
    expect(Math.min(Math.abs(added.x - left), Math.abs(added.x - right))).toBeGreaterThan(2 * TANK_WIDTH);

    removeTank(field, 0);
    expect(field.tanks.map((tank) => tank.id)).toEqual([1, 2]);
  });
});

describe("the wind of a round", () => {
  it("is mostly light and sometimes strong, to either side, within what is allowed", () => {
    const random = createRandom(7);
    const winds = Array.from({ length: 2000 }, () => drawWind(200, random));
    const strengths = winds.map(Math.abs).sort((a, b) => a - b);
    expect(strengths[strengths.length - 1]).toBeLessThanOrEqual(200);
    expect(winds.every(Number.isInteger)).toBe(true);
    // As in the original at a Max. Wind of 200: about 30 on average, half of them under 27
    const mean = strengths.reduce((sum, wind) => sum + wind, 0) / strengths.length;
    expect(mean).toBeGreaterThan(25);
    expect(mean).toBeLessThan(35);
    expect(strengths[1000]).toBeGreaterThan(15);
    expect(strengths[1000]).toBeLessThan(27);
    // A wind over 100 is rare
    expect(strengths.filter((wind) => wind > 100).length).toBeLessThan(100);
    const right = winds.filter((wind) => wind > 0).length;
    expect(right).toBeGreaterThan(850);
    expect(right).toBeLessThan(1150);
  });

  it("is none when no wind is allowed", () => {
    expect(drawWind(0, createRandom(1))).toBe(0);
  });
});
