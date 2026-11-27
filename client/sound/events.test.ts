// @vitest-environment node
import { describe, expect, it } from "vitest";

import { explosionSound, landed, launched } from "./events";

const shot = (id: number, x: number, y: number, part?: number) => ({ id, owner: 0, weapon: "missile", x, y, part });

describe("the sounds of the field", () => {
  const tanks = [
    { x: 100, y: 400 },
    { x: 900, y: 300 }
  ];

  it("hear a shot when a new projectile appears at a tank", () => {
    expect(launched([], [shot(1, 130, 370)], tanks)).toBe(1);
    // The same one a moment later is not new
    expect(launched([shot(1, 130, 370)], [shot(1, 180, 320)], tanks)).toBe(0);
    // Two tanks fire at the same moment
    expect(launched([], [shot(1, 130, 370), shot(2, 880, 280)], tanks)).toBe(2);
  });

  it("do not hear a shot when a weapon splits in the air or throws its bombs", () => {
    const before = [shot(1, 500, 80)];
    expect(launched(before, [shot(1, 505, 80), shot(2, 505, 80), shot(3, 505, 80)], tanks)).toBe(0);
    expect(launched([], [shot(5, 110, 395, 0), shot(6, 110, 395, 1)], tanks)).toBe(0);
  });

  it("count what ended on the field, and not what flew out of it", () => {
    const field = { width: 1280, height: 720 };
    expect(landed([shot(1, 500, 400)], [], field)).toBe(1);
    expect(landed([shot(1, 500, 400)], [shot(1, 510, 410)], field)).toBe(0);
    expect(landed([shot(1, -60, 400), shot(2, 1400, 300), shot(3, 500, 719)], [], field)).toBe(0);
    // What is gone from above the field went off there, on something: it counts
    expect(landed([shot(1, 500, -200)], [], field)).toBe(1);
  });

  it("rumble for what explodes and click for what does not", () => {
    expect(explosionSound("missile", 40)).toBe("explosion");
    expect(explosionSound("nuke", 150)).toBe("explosion");
    expect(explosionSound("funky-bomb", 40)).toBe("explosion");
    expect(explosionSound("sandhog", 24)).toBe("explosion");
    // The flash where a sandhog starts to dig, dirt, riot weapons and diggers
    expect(explosionSound("sandhog", 6)).toBe("click");
    expect(explosionSound("dirt-ball", 70)).toBe("click");
    expect(explosionSound("riot-bomb", 60)).toBe("click");
    expect(explosionSound("baby-digger", 6)).toBe("click");
    expect(explosionSound("earth-disrupter", 16)).toBe("click");
    expect(explosionSound("no-such", 40)).toBe("click");
  });
});
