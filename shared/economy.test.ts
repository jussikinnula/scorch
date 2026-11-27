// @vitest-environment node
import { describe, expect, it } from "vitest";

import { damageReward, isForSale, withInterest } from "./economy";
import { WEAPONS } from "./weapons";

describe("the economy", () => {
  it("pays for the damage to others, more for destroying a tank", () => {
    expect(damageReward(false, 30, false)).toBe(600);
    expect(damageReward(false, 30, true)).toBe(2600);
  });

  it("takes 1,500 from a player who destroys its own whole tank, as in the original", () => {
    expect(damageReward(true, 100, true)).toBe(-1500);
    expect(damageReward(true, 20, false)).toBe(-300);
  });

  it("pays interest on money at the rate of the room, not on debts", () => {
    expect(withInterest(5000, 5)).toBe(5250);
    expect(withInterest(5000, 30)).toBe(6500);
    expect(withInterest(5000, 0)).toBe(5000);
    expect(withInterest(19, 5)).toBe(19);
    expect(withInterest(-1500, 5)).toBe(-1500);
  });

  it("sells every weapon of the arms level but the one everyone always has", () => {
    expect(WEAPONS.filter((weapon) => !isForSale(weapon, 4)).map((weapon) => weapon.id)).toEqual(["baby-missile"]);
    const basic = WEAPONS.filter((weapon) => isForSale(weapon, 0)).map((weapon) => weapon.id);
    expect(basic).toContain("missile");
    expect(basic).not.toContain("nuke");
    expect(basic).not.toContain("mirv");
  });
});
