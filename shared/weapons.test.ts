// @vitest-environment node
import { describe, expect, it } from "vitest";

import { WEAPONS } from "./weapons";

describe("the weapons", () => {
  it("have unique ids", () => {
    expect(new Set(WEAPONS.map((weapon) => weapon.id)).size).toBe(WEAPONS.length);
  });

  it("have sensible values", () => {
    for (const weapon of WEAPONS) {
      expect(weapon.price).toBeGreaterThan(0);
      expect(weapon.bundle).toBeGreaterThan(0);
      expect(weapon.radius).toBeGreaterThanOrEqual(0);
      expect(weapon.reload).toBeGreaterThan(0);
      expect(weapon.armsLevel).toBeGreaterThanOrEqual(0);
      expect(weapon.armsLevel).toBeLessThanOrEqual(4);
    }
  });

  it("include the one everybody always has", () => {
    expect(WEAPONS.filter((weapon) => weapon.bundle === Infinity).map((weapon) => weapon.id)).toEqual(["baby-missile"]);
  });
});
