import { ShotState } from "../../shared/protocol";
import { findWeapon, WeaponKind } from "../../shared/weapons";

/**
 * Which sounds the things that happen on the playing field make, from what the server tells of the
 * projectiles and the explosions. The server does not say that a tank fired or that something
 * landed: these are told from how the list of the projectiles changes.
 */

/** How far from the top of a tank a projectile can be when it is first told and still have been fired from that tank, in pixels. */
const LAUNCH_REACH = 80;
/** The kinds of weapons whose going off is an explosion to the ear. The rest dig, fill or only flash. */
const EXPLOSIVE: WeaponKind[] = ["blast", "mirv", "leapfrog", "funky", "roller", "sandhog"];
/** An explosion smaller than this, in pixels, is only the flash of where something started to dig. */
const LEAST_EXPLOSION = 16;

/**
 * How many shots were fired between two tellings of the projectiles: the new ones that are at a
 * tank. The warheads of a weapon that splits in the air are new too, but they are far from the tanks.
 */
export function launched(before: ShotState[], now: ShotState[], tanks: { x: number; y: number }[]) {
  return now.filter(
    (shot) =>
      shot.part === undefined &&
      !before.some((earlier) => earlier.id === shot.id) &&
      tanks.some((tank) => Math.hypot(shot.x - tank.x, shot.y - tank.y) <= LAUNCH_REACH)
  ).length;
}

/**
 * How many projectiles ended on the field between two tellings: those that are gone and were last
 * over the field. One that flew out past a side or fell under the field is not among them.
 */
export function landed(before: ShotState[], now: ShotState[], field: { width: number; height: number }) {
  return before.filter(
    (shot) =>
      !now.some((later) => later.id === shot.id) && shot.x >= 0 && shot.x <= field.width && shot.y < field.height - 4
  ).length;
}

/** The sound of something that went off: the rumble of an explosion, or the click of what does not explode. */
export function explosionSound(weapon: string, radius: number): "explosion" | "click" {
  const kind = findWeapon(weapon)?.kind;
  return kind && EXPLOSIVE.includes(kind) && radius >= LEAST_EXPLOSION ? "explosion" : "click";
}
