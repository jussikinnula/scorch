import { describe, expect, it } from "vitest";

import {
  atEdge,
  BURN_TIME,
  fallTanks,
  flameHeight,
  layoutField,
  PLASMA_SIZE,
  plasmaClouds,
  plasmaColor,
  pulseBands,
  shadesOf,
  placeShots,
  shieldShade,
  smokeWisps,
  tracePoints,
  wrapText
} from "./Field";

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
  const tank = { id: 0, x: 100, y: 500, angle: 45, power: 500, energy: 100, shield: 0, shieldMax: 0 };

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

describe("tracePoints", () => {
  const points = [
    { x: 100, y: 200 },
    { x: 130, y: 180 },
    { x: 160, y: 170 }
  ];

  it("ends the trace of a projectile that flies where the projectile is drawn, not ahead of it", () => {
    expect(tracePoints({ points }, { x: 140, y: 176 })).toEqual([points[0], points[1], { x: 140, y: 176 }]);
  });

  it("is all the places that were told once the projectile is gone", () => {
    expect(tracePoints({ points }, undefined)).toEqual(points);
  });
});

describe("shieldShade", () => {
  it("is white for a whole shield, and a darker grey the less of it is left", () => {
    expect(shieldShade(100, 100)).toBe(255);
    expect(shieldShade(200, 200)).toBe(255);
    expect(shieldShade(50, 100)).toBeLessThan(shieldShade(75, 100));
    expect(shieldShade(1, 100)).toBeLessThan(60);
    expect(shieldShade(1, 100)).toBeGreaterThan(0);
  });
});

describe("flameHeight", () => {
  it("stands higher where what burns lies deeper, and is none where nothing lies", () => {
    expect(flameHeight(0, 10, 1000, 0.1)).toBe(0);
    const heights = (depth: number) =>
      Array.from({ length: 50 }, (_, tick) => flameHeight(depth, 10, tick * 16, 0.1)).reduce((a, b) => a + b) / 50;
    expect(heights(10)).toBeGreaterThan(heights(2) * 2);
    expect(heights(1)).toBeGreaterThan(3);
  });

  it("dies down at the end of its time", () => {
    expect(BURN_TIME).toBeGreaterThan(1000);
    expect(flameHeight(10, 10, 1000, 0.95)).toBeLessThan(flameHeight(10, 10, 1000, 0.5) / 2);
    expect(flameHeight(10, 10, 1000, 1)).toBe(0);
  });
});

describe("flameHeight over a fire", () => {
  it("changes smoothly from a column to the next", () => {
    for (let x = 100; x < 400; x++) {
      expect(Math.abs(flameHeight(10, x + 1, 5000, 0.1) - flameHeight(10, x, 5000, 0.1))).toBeLessThan(9);
    }
  });

  it("lets each tongue move in its own time: the fire does not rise and fall as one", () => {
    // When each of a row of columns is at its highest, over a few seconds
    const highest = (x: number) => {
      let [best, at] = [0, 0];
      for (let now = 0; now < 4000; now += 20) {
        const flame = flameHeight(10, x, now, 0.1);
        if (flame > best) [best, at] = [flame, now];
      }
      return at;
    };
    const moments = [106, 119, 132, 145, 158, 171, 184].map(highest);
    expect(new Set(moments).size).toBeGreaterThan(4);
  });
});

describe("smokeWisps", () => {
  it("rise from places along the fire, grow and thin out, and start again", () => {
    const wisps = smokeWisps(300, 260, 5000);
    expect(wisps.length).toBeGreaterThan(6);
    expect(wisps.length).toBeLessThan(14);
    for (const wisp of wisps) {
      expect(wisp.rise).toBeGreaterThanOrEqual(0);
      expect(wisp.rise).toBeLessThan(70);
      expect(wisp.thickness).toBeGreaterThan(0);
      expect(wisp.thickness).toBeLessThanOrEqual(0.3);
    }
    // Not all at the same height: each has a pace of its own
    expect(new Set(wisps.map((wisp) => Math.round(wisp.rise / 10))).size).toBeGreaterThan(2);
    // The same wisp a little later is higher, larger and thinner, until it starts again
    const later = smokeWisps(300, 260, 5100);
    const risen = wisps.filter((wisp, index) => later[index].rise > wisp.rise);
    expect(risen.length).toBeGreaterThan(wisps.length / 2);
    for (const wisp of risen) expect(later[wisps.indexOf(wisp)].radius).toBeGreaterThan(wisp.radius);
  });

  it("has none where there is no fire", () => {
    expect(smokeWisps(300, 0, 5000)).toEqual([]);
  });
});

describe("the plasma", () => {
  it("has clouds that are the same every time, of all values, and smooth from a pixel to the next", () => {
    const clouds = plasmaClouds();
    expect(clouds).toHaveLength(PLASMA_SIZE * PLASMA_SIZE);
    expect(plasmaClouds()).toEqual(clouds);
    expect(Math.max(...clouds) - Math.min(...clouds)).toBeGreaterThan(150);
    for (let i = 1; i < PLASMA_SIZE; i++) expect(Math.abs(clouds[i] - clouds[i - 1])).toBeLessThan(40);
  });

  it("is red and black, and its colours run with the time", () => {
    const colors = Array.from({ length: 256 }, (_, value) => plasmaColor(value, 0));
    // Black veins and bright red patches, and never green or blue
    expect(Math.min(...colors.map(([red]) => red))).toBeLessThan(20);
    expect(Math.max(...colors.map(([red]) => red))).toBe(255);
    for (const [red, green, blue] of colors) {
      expect(green).toBeLessThanOrEqual(Math.max(red, 70));
      expect(blue).toBeLessThanOrEqual(30);
    }
    // A moment later each value has the colour that another one had
    expect(plasmaColor(100, 500)).toEqual(plasmaColor(150, 0));
    expect(plasmaColor(100, 500)).not.toEqual(plasmaColor(100, 0));
  });
});

describe("pulseBands", () => {
  const colors = ["red", "yellow", "green", "blue"];

  it("fills a ball with bands of colour from the outside in, the outermost as large as the ball", () => {
    const bands = pulseBands(40, 1000, colors);
    expect(bands[0].radius).toBe(40);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].radius).toBeLessThan(bands[i - 1].radius);
      expect(bands[i].color).not.toBe(bands[i - 1].color);
    }
    expect(new Set(bands.map((band) => band.color)).size).toBe(colors.length);
  });

  it("runs the colours outwards as the time passes, and starts each ball from a colour of its own", () => {
    const before = pulseBands(40, 1200, colors);
    const after = pulseBands(40, 1260, colors);
    for (let i = 1; i < before.length; i++) expect(after[i - 1].color).toBe(before[i].color);
    expect(pulseBands(40, 1210, colors)).toEqual(before);
    expect(pulseBands(40, 1200, colors, 1)).not.toEqual(before);
  });
});

describe("shadesOf", () => {
  it("gives a colour from a light shade to a dark one, all of the same hue", () => {
    const shades = shadesOf("#ff8000");
    expect(shades).toHaveLength(6);
    expect(shades[1]).toBe("rgb(255, 128, 0)");
    expect(shades[0]).toBe("rgb(255, 172, 89)");
    expect(shades[5]).toBe("rgb(56, 28, 0)");
    expect(new Set(shades).size).toBe(6);
  });
});
