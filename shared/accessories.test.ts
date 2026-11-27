// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ACCESSORIES, findAccessory } from "./accessories";
import { findItem, isForSale, ITEMS } from "./economy";
import { WEAPONS } from "./weapons";

describe("the accessories", () => {
  it("have ids of their own, also among the weapons", () => {
    expect(new Set(ITEMS.map((item) => item.id)).size).toBe(WEAPONS.length + ACCESSORIES.length);
  });

  it("are found by their ids, as items of the shop too", () => {
    expect(findAccessory("heavy-shield")?.name).toBe("Heavy Shield");
    expect(findAccessory("missile")).toBeUndefined();
    expect(findItem("parachute")?.price).toBe(10000);
    expect(findItem("missile")?.price).toBe(1875);
    expect(findItem("no-such")).toBeUndefined();
  });

  it("are sold by the arms level of the room, as the weapons are", () => {
    const sold = (armsLevel: number) => ACCESSORIES.filter((item) => isForSale(item, armsLevel)).map((item) => item.id);
    expect(sold(1)).toEqual([]);
    expect(sold(2)).toEqual(["parachute", "battery", "mag-deflector"]);
    expect(sold(3)).toEqual(["parachute", "battery", "mag-deflector", "shield", "force-shield"]);
    expect(sold(4)).toEqual([
      "parachute",
      "battery",
      "mag-deflector",
      "shield",
      "force-shield",
      "heavy-shield",
      "super-mag"
    ]);
  });

  it("have one shield that deflects, which lasts longer than a plain one", () => {
    expect(ACCESSORIES.filter((item) => item.deflects).map((item) => item.id)).toEqual(["force-shield"]);
    expect(findAccessory("force-shield")!.strength).toBeGreaterThan(findAccessory("shield")!.strength);
  });

  it("have two shields that repel: a weak one, and one as strong as a heavy shield that a laser does not get through", () => {
    const [weak, strong] = ACCESSORIES.filter((item) => item.repels);
    expect([weak.id, strong.id]).toEqual(["mag-deflector", "super-mag"]);
    expect(weak.strength).toBeLessThan(findAccessory("shield")!.strength);
    expect(weak.repels).toBeLessThan(strong.repels!);
    expect(strong.strength).toBe(findAccessory("heavy-shield")!.strength);
    expect(strong.laserproof).toBe(true);
    expect(weak.laserproof).toBeUndefined();
  });

  it("have a heavy shield that takes more than a shield", () => {
    expect(findAccessory("heavy-shield")!.strength).toBeGreaterThan(findAccessory("shield")!.strength);
  });
});
