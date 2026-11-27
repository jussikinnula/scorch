import { describe, expect, it } from "vitest";

import { atEdge, fallTanks, layoutField, placeShots, wrapText } from "./Field";

describe("layoutField", () => {
  const field = { width: 1280, height: 720 };

  it("fills a window of the shape of the field", () => {
    expect(layoutField(field, 1920, 1080)).toEqual({ scale: 1.5, left: 0, top: 0 });
  });

  it("is in the middle of a wider window, with the whole height", () => {
    expect(layoutField(field, 2000, 720)).toEqual({ scale: 1, left: 360, top: 0 });
  });

  it("is against the bottom of a taller window, with the whole width", () => {
    expect(layoutField(field, 640, 1000)).toEqual({ scale: 0.5, left: 0, top: 640 });
  });
});

describe("wrapText", () => {
  /** Lines of at most ten characters. */
  const fits = (line: string) => line.length <= 10;

  it("keeps a short text on one line", () => {
    expect(wrapText("Eat this!", fits)).toEqual(["Eat this!"]);
  });

  it("breaks a long text between words", () => {
    expect(wrapText("one two three four five", fits)).toEqual(["one two", "three four", "five"]);
  });

  it("cuts a word that is too long for a line", () => {
    expect(wrapText("aaaaaaaaaaaaaaaaaaaaaaaaa b", fits)).toEqual(["aaaaaaaaaa", "aaaaaaaaaa", "aaaaa b"]);
  });
});

describe("placeShots", () => {
  const previous = [{ id: 1, owner: 0, weapon: "baby-missile", x: 100, y: 200 }];
  const shots = [
    { id: 1, owner: 0, weapon: "baby-missile", x: 130, y: 180 },
    { id: 2, owner: 1, weapon: "baby-missile", x: 500, y: 500 }
  ];

  it("puts a projectile on the way from where it was to where it is", () => {
    // The places are told every 50 milliseconds
    expect(placeShots({ shots, previous, at: 1000 }, 1000)[0]).toMatchObject({ x: 100, y: 200 });
    expect(placeShots({ shots, previous, at: 1000 }, 1025)[0]).toMatchObject({ x: 115, y: 190 });
    expect(placeShots({ shots, previous, at: 1000 }, 1050)[0]).toMatchObject({ x: 130, y: 180 });
  });

  it("does not put a projectile past where it is known to be", () => {
    expect(placeShots({ shots, previous, at: 1000 }, 5000)[0]).toMatchObject({ x: 130, y: 180 });
  });

  it("puts a new projectile where it is", () => {
    expect(placeShots({ shots, previous, at: 1000 }, 1025)[1]).toEqual(shots[1]);
  });
});

describe("atEdge", () => {
  it("shows a projectile that is outside the field on its edge", () => {
    expect(atEdge({ x: 300, y: 200 })).toBeNull();
    // Above the field: on the top edge, straight below
    expect(atEdge({ x: 300, y: -500 })).toEqual({ x: 300, y: 2 });
    // Past a side: on that side, at its height
    expect(atEdge({ x: -80, y: 400 })).toEqual({ x: 2, y: 400 });
    expect(atEdge({ x: 1400, y: 400 })).toEqual({ x: 1278, y: 400 });
    // Past a corner: in the corner
    expect(atEdge({ x: 1400, y: -30 })).toEqual({ x: 1278, y: 2 });
  });
});

describe("fallTanks", () => {
  const tank = { id: 0, x: 100, y: 500, angle: 45, power: 500, energy: 100 };

  it("shows a tank whose ground went on its way down, until it lands", () => {
    const shown = new Map<number, { x: number; y: number; speed: number }>();
    expect(fallTanks([tank], shown, 0.016)[0].y).toBe(500);

    // The server says the tank is 60 pixels lower: it is drawn falling there
    const lower = { ...tank, y: 560 };
    const first = fallTanks([lower], shown, 0.05)[0].y;
    expect(first).toBeGreaterThan(500);
    expect(first).toBeLessThan(510);
    const second = fallTanks([lower], shown, 0.05)[0].y;
    expect(second - first).toBeGreaterThan(first - 500);
    let y = second;
    for (let frame = 0; frame < 40; frame++) y = fallTanks([lower], shown, 0.05)[0].y;
    expect(y).toBe(560);
  });

  it("puts a tank at once where it is in a new round, and when it is higher than it was shown", () => {
    const shown = new Map<number, { x: number; y: number; speed: number }>();
    fallTanks([tank], shown, 0.016);
    expect(fallTanks([{ ...tank, x: 700, y: 650 }], shown, 0.016)[0]).toMatchObject({ x: 700, y: 650 });
    expect(fallTanks([{ ...tank, x: 700, y: 600 }], shown, 0.016)[0].y).toBe(600);
  });
});
