import { describe, expect, it } from "vitest";

import { layoutField, placeShots, wrapText } from "./Field";

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
