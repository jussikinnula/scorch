/**
 * The weapons of the first phase (see docs/PLAN.md). The prices, the bundle sizes and the
 * blast radii are those of the manual of the original game. The reload times of the live mode are
 * our own starting values, to be tuned by playing.
 */

/**
 * What a weapon does when it comes down (shared/sim/shots.ts):
 * - blast: an explosion that destroys dirt and damages tanks.
 * - mirv: splits into warheads at the top of its flight; each of them is a blast.
 * - roller: rolls downhill from where it lands, and explodes at a tank or where it stops.
 * - dirt: makes a ball of dirt, which falls.
 * - riot: destroys dirt but does not damage tanks.
 * - tracer: nothing. It shows where a shot would go.
 */
export type WeaponKind = "blast" | "mirv" | "roller" | "dirt" | "riot" | "tracer";

export interface Weapon {
  id: string;
  name: string;
  kind: WeaponKind;
  /** The price of a bundle in dollars. */
  price: number;
  /** How many are got with one purchase. Infinity: everyone always has these. */
  bundle: number;
  /** The radius of the explosion in pixels of the original game at 640x480, 0 if there is none. */
  radius: number;
  /** The lowest arms level (0-4) of a game where the weapon can be bought. */
  armsLevel: number;
  /** How long the tank reloads after firing this in the live mode, in seconds. */
  reload: number;
}

export const WEAPONS: readonly Weapon[] = [
  {
    id: "baby-missile",
    kind: "blast",
    name: "Baby Missile",
    price: 400,
    bundle: Infinity,
    radius: 10,
    armsLevel: 0,
    reload: 3
  },
  { id: "missile", kind: "blast", name: "Missile", price: 1875, bundle: 5, radius: 20, armsLevel: 0, reload: 5 },
  { id: "baby-nuke", kind: "blast", name: "Baby Nuke", price: 10000, bundle: 3, radius: 40, armsLevel: 0, reload: 12 },
  { id: "nuke", kind: "blast", name: "Nuke", price: 12000, bundle: 1, radius: 75, armsLevel: 1, reload: 20 },
  { id: "mirv", kind: "mirv", name: "MIRV", price: 10000, bundle: 3, radius: 20, armsLevel: 2, reload: 15 },
  {
    id: "baby-roller",
    kind: "roller",
    name: "Baby Roller",
    price: 5000,
    bundle: 10,
    radius: 10,
    armsLevel: 2,
    reload: 5
  },
  { id: "roller", kind: "roller", name: "Roller", price: 6000, bundle: 5, radius: 20, armsLevel: 2, reload: 7 },
  {
    id: "heavy-roller",
    kind: "roller",
    name: "Heavy Roller",
    price: 6750,
    bundle: 2,
    radius: 45,
    armsLevel: 3,
    reload: 14
  },
  { id: "dirt-clod", kind: "dirt", name: "Dirt Clod", price: 5000, bundle: 10, radius: 20, armsLevel: 0, reload: 4 },
  { id: "dirt-ball", kind: "dirt", name: "Dirt Ball", price: 5000, bundle: 5, radius: 35, armsLevel: 0, reload: 6 },
  {
    id: "ton-of-dirt",
    kind: "dirt",
    name: "Ton of Dirt",
    price: 6750,
    bundle: 2,
    radius: 70,
    armsLevel: 1,
    reload: 12
  },
  { id: "riot-bomb", kind: "riot", name: "Riot Bomb", price: 5000, bundle: 5, radius: 30, armsLevel: 3, reload: 5 },
  {
    id: "heavy-riot-bomb",
    kind: "riot",
    name: "Heavy Riot Bomb",
    price: 4750,
    bundle: 2,
    radius: 45,
    armsLevel: 3,
    reload: 8
  },
  { id: "tracer", kind: "tracer", name: "Tracer", price: 10, bundle: 20, radius: 0, armsLevel: 0, reload: 1 }
];

/** The weapon everyone always has, and the one a tank has chosen when nothing else is. */
export const DEFAULT_WEAPON = "baby-missile";

/** How many warheads a MIRV splits into. */
export const MIRV_WARHEADS = 5;

/** The most a player can have of a weapon, as in the original. */
export const MAX_ITEMS = 99;

export const findWeapon = (id: string) => WEAPONS.find((weapon) => weapon.id === id);

/**
 * One bundle of every weapon: what the players start a game with in the tests that fire weapons
 * without buying them first. How many of each weapon, by its id; the weapons there is no end of are
 * not in it.
 */
export function starterKit(): Record<string, number> {
  const kit: Record<string, number> = {};
  for (const weapon of WEAPONS) if (Number.isFinite(weapon.bundle)) kit[weapon.id] = weapon.bundle;
  return kit;
}
