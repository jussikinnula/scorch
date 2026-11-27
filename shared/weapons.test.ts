// @vitest-environment node
import { describe, expect, it } from "vitest";

import { findWeapon, MAX_ITEMS, starterKit, WEAPONS } from "./weapons";

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

  it("are found by their ids", () => {
    expect(findWeapon("nuke")?.name).toBe("Nuke");
    expect(findWeapon("no-such")).toBeUndefined();
  });

  it("give a starter kit of a bundle of each weapon", () => {
    const kit = starterKit();
    expect(kit).toMatchObject({ missile: 5, "baby-nuke": 3, nuke: 1, mirv: 3, roller: 5, "dirt-clod": 10, tracer: 20 });
    // Not what there is no end of
    expect(kit["baby-missile"]).toBeUndefined();
    expect(Object.keys(kit)).toHaveLength(WEAPONS.length - 1);
    for (const id of Object.keys(kit)) expect(kit[id]).toBeLessThanOrEqual(MAX_ITEMS);
  });
});
