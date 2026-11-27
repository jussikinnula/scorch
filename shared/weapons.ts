/**
 * The weapons of the first phase (see docs/PLAN.md). The prices, the bundle sizes and the
 * blast radii are those of the manual of the original game. The reload times of the live mode are
 * our own starting values, to be tuned by playing.
 */

/**
 * What a weapon does when it comes down (shared/sim/shots.ts):
 * - blast: an explosion that destroys dirt and damages tanks.
 * - mirv: splits into warheads at the top of its flight; each of them is a blast.
 * - leapfrog: three blasts one after another, each larger than the one before: after the first two
 *   the weapon leaps on.
 * - funky: a blast that throws bombs around itself; each of them is a blast where it comes down.
 * - roller: rolls downhill from where it lands, and explodes at a tank or where it stops.
 * - dirt: makes a ball of dirt, which falls.
 * - riot: destroys dirt but does not damage tanks.
 * - digger: tunnels into the dirt from where it lands. It does nothing to a tank.
 * - sandhog: tunnels sideways under the ground, one tunnel after another, with a charge at the end
 *   of each: a blast that a shield does not stop, as it comes from below.
 * - charge: is not a projectile: destroys a wedge of dirt from the turret, the way it points, or
 *   throws one there.
 * - liquid: liquid dirt that oozes out where it lands, flows downhill, fills holes and sets.
 * - napalm: spills where it lands and flows like a liquid, then burns: the deeper it lies at a tank,
 *   the more it takes.
 * - disrupter: makes all the dirt that hangs in the air fall. It matters in a game with Suspend Dirt.
 * - tracer: nothing. It shows where a shot would go.
 */
export type WeaponKind =
  | "blast"
  | "mirv"
  | "leapfrog"
  | "funky"
  | "roller"
  | "dirt"
  | "riot"
  | "digger"
  | "sandhog"
  | "charge"
  | "liquid"
  | "napalm"
  | "disrupter"
  | "tracer";

export interface Weapon {
  id: string;
  name: string;
  kind: WeaponKind;
  /** The price of a bundle in dollars. */
  price: number;
  /** How many are got with one purchase. Infinity: everyone always has these. */
  bundle: number;
  /**
   * The radius of the explosion in pixels of the original game at 640x480, 0 if there is none. Of a
   * digger, which does not explode, half the width of its tunnels.
   */
  radius: number;
  /**
   * The most energy its explosion takes from a tank: what a tank loses when the explosion is right
   * at its middle. Our own values, by how the game plays: the small weapons take several hits to
   * destroy a tank. 0 for what does no damage.
   */
  damage: number;
  /** The lowest arms level (0-4) of a game where the weapon can be bought. */
  armsLevel: number;
  /** How long the tank reloads after firing this in the live mode, in seconds. */
  reload: number;
  /** How many warheads a weapon that splits at the top of its flight splits into, or how many tunnels one that tunnels makes. */
  warheads?: number;
  /** How long the tunnels of a weapon that tunnels are, in pixels of the original game. Our own values. */
  tunnel?: number;
  /** A charge that throws dirt instead of destroying it. */
  dirt?: boolean;
  /** How much there is of a weapon that flows, in pixels of this field: the area it covers seen from the side. Our own values. */
  amount?: number;
  /** How wide the wedge of a charge is, in degrees to each side of where the turret points. Our own values. */
  spread?: number;
  /** A tracer whose trace is smoke: thick, and easy to see. */
  smoke?: boolean;
}

/** How many warheads a MIRV splits into. */
export const MIRV_WARHEADS = 5;

export const WEAPONS: readonly Weapon[] = [
  {
    id: "baby-missile",
    kind: "blast",
    name: "Baby Missile",
    price: 400,
    bundle: Infinity,
    radius: 10,
    damage: 50,
    armsLevel: 0,
    reload: 3
  },
  {
    id: "missile",
    kind: "blast",
    name: "Missile",
    price: 1875,
    bundle: 5,
    radius: 20,
    damage: 75,
    armsLevel: 0,
    reload: 5
  },
  {
    id: "baby-nuke",
    kind: "blast",
    name: "Baby Nuke",
    price: 10000,
    bundle: 3,
    radius: 40,
    damage: 100,
    armsLevel: 0,
    reload: 12
  },
  {
    id: "nuke",
    kind: "blast",
    name: "Nuke",
    price: 12000,
    bundle: 1,
    radius: 75,
    damage: 100,
    armsLevel: 1,
    reload: 20
  },
  {
    id: "mirv",
    kind: "mirv",
    name: "MIRV",
    price: 10000,
    bundle: 3,
    radius: 20,
    damage: 75,
    armsLevel: 2,
    reload: 15,
    warheads: MIRV_WARHEADS
  },
  {
    id: "deaths-head",
    kind: "mirv",
    name: "Death's Head",
    price: 20000,
    bundle: 1,
    radius: 35,
    damage: 100,
    armsLevel: 4,
    reload: 25,
    warheads: 9
  },
  {
    id: "leap-frog",
    kind: "leapfrog",
    name: "Leap Frog",
    price: 10000,
    bundle: 2,
    // The last and the largest of its three explosions (LEAP_FROG_RADII)
    radius: 30,
    damage: 75,
    armsLevel: 3,
    reload: 12
  },
  {
    id: "funky-bomb",
    kind: "funky",
    name: "Funky Bomb",
    price: 7000,
    bundle: 2,
    // Of each of its explosions. The 80 of the manual is taken as how far around they are scattered (FUNKY_REACH).
    radius: 20,
    damage: 75,
    armsLevel: 4,
    reload: 18
  },
  {
    id: "baby-roller",
    kind: "roller",
    name: "Baby Roller",
    price: 5000,
    bundle: 10,
    radius: 10,
    damage: 50,
    armsLevel: 2,
    reload: 5
  },
  {
    id: "roller",
    kind: "roller",
    name: "Roller",
    price: 6000,
    bundle: 5,
    radius: 20,
    damage: 75,
    armsLevel: 2,
    reload: 7
  },
  {
    id: "heavy-roller",
    kind: "roller",
    name: "Heavy Roller",
    price: 6750,
    bundle: 2,
    radius: 45,
    damage: 100,
    armsLevel: 3,
    reload: 14
  },
  {
    id: "dirt-clod",
    kind: "dirt",
    name: "Dirt Clod",
    price: 5000,
    bundle: 10,
    radius: 20,
    damage: 0,
    armsLevel: 0,
    reload: 4
  },
  {
    id: "dirt-ball",
    kind: "dirt",
    name: "Dirt Ball",
    price: 5000,
    bundle: 5,
    radius: 35,
    damage: 0,
    armsLevel: 0,
    reload: 6
  },
  {
    id: "ton-of-dirt",
    kind: "dirt",
    name: "Ton of Dirt",
    price: 6750,
    bundle: 2,
    radius: 70,
    damage: 0,
    armsLevel: 1,
    reload: 12
  },
  {
    id: "riot-bomb",
    kind: "riot",
    name: "Riot Bomb",
    price: 5000,
    bundle: 5,
    radius: 30,
    damage: 0,
    armsLevel: 3,
    reload: 5
  },
  {
    id: "heavy-riot-bomb",
    kind: "riot",
    name: "Heavy Riot Bomb",
    price: 4750,
    bundle: 2,
    radius: 45,
    damage: 0,
    armsLevel: 3,
    reload: 8
  },
  {
    id: "riot-charge",
    kind: "charge",
    name: "Riot Charge",
    price: 2000,
    bundle: 10,
    radius: 36,
    damage: 0,
    armsLevel: 2,
    reload: 3,
    spread: 30
  },
  {
    id: "riot-blast",
    kind: "charge",
    name: "Riot Blast",
    price: 5000,
    bundle: 5,
    radius: 60,
    damage: 0,
    armsLevel: 3,
    reload: 5,
    spread: 40
  },
  {
    id: "baby-digger",
    kind: "digger",
    name: "Baby Digger",
    price: 3000,
    bundle: 10,
    radius: 3,
    damage: 0,
    armsLevel: 0,
    reload: 3,
    warheads: 1,
    tunnel: 30
  },
  {
    id: "digger",
    kind: "digger",
    name: "Digger",
    price: 2500,
    bundle: 5,
    radius: 3,
    damage: 0,
    armsLevel: 0,
    reload: 4,
    warheads: 3,
    tunnel: 45
  },
  {
    id: "heavy-digger",
    kind: "digger",
    name: "Heavy Digger",
    price: 6750,
    bundle: 2,
    radius: 4,
    damage: 0,
    armsLevel: 1,
    reload: 6,
    warheads: 5,
    tunnel: 60
  },
  {
    id: "baby-sandhog",
    kind: "sandhog",
    name: "Baby Sandhog",
    price: 10000,
    bundle: 10,
    radius: 10,
    damage: 50,
    armsLevel: 0,
    reload: 6,
    warheads: 3,
    tunnel: 30
  },
  {
    id: "sandhog",
    kind: "sandhog",
    name: "Sandhog",
    price: 16750,
    bundle: 5,
    radius: 12,
    damage: 60,
    armsLevel: 0,
    reload: 9,
    warheads: 5,
    tunnel: 30
  },
  {
    id: "heavy-sandhog",
    kind: "sandhog",
    name: "Heavy Sandhog",
    price: 25000,
    bundle: 2,
    radius: 15,
    damage: 75,
    armsLevel: 1,
    reload: 14,
    warheads: 7,
    tunnel: 30
  },
  {
    id: "dirt-charge",
    kind: "charge",
    name: "Dirt Charge",
    price: 5000,
    bundle: 5,
    // The manual gives none: as far as a Riot Blast
    radius: 60,
    damage: 0,
    armsLevel: 1,
    reload: 4,
    spread: 30,
    dirt: true
  },
  {
    id: "liquid-dirt",
    kind: "liquid",
    name: "Liquid Dirt",
    price: 5000,
    bundle: 10,
    radius: 0,
    damage: 0,
    armsLevel: 2,
    reload: 5,
    amount: 8000
  },
  {
    id: "napalm",
    kind: "napalm",
    name: "Napalm",
    price: 10000,
    bundle: 10,
    radius: 0,
    // What it takes from a tank that it lies deep on (NAPALM_DEEP)
    damage: 60,
    armsLevel: 2,
    reload: 8,
    amount: 1500
  },
  {
    id: "hot-napalm",
    kind: "napalm",
    name: "Hot Napalm",
    price: 20000,
    bundle: 2,
    radius: 0,
    damage: 100,
    armsLevel: 4,
    reload: 14,
    amount: 2500
  },
  {
    id: "earth-disrupter",
    kind: "disrupter",
    name: "Earth Disrupter",
    price: 5000,
    bundle: 10,
    radius: 0,
    damage: 0,
    armsLevel: 0,
    reload: 3
  },
  {
    id: "tracer",
    kind: "tracer",
    name: "Tracer",
    price: 10,
    bundle: 20,
    radius: 0,
    damage: 0,
    armsLevel: 0,
    reload: 1
  },
  {
    id: "smoke-tracer",
    kind: "tracer",
    name: "Smoke Tracer",
    price: 500,
    bundle: 10,
    radius: 0,
    damage: 0,
    armsLevel: 1,
    reload: 1,
    smoke: true
  }
];

/** The weapon everyone always has, and the one a tank has chosen when nothing else is. */
export const DEFAULT_WEAPON = "baby-missile";

/**
 * The radii of the three explosions of a Leap Frog, in pixels of the original game, as in its manual.
 */
export const LEAP_FROG_RADII = [20, 25, 30];

/** How many bombs a Funky Bomb throws around itself. Our own value: the original throws five to ten. */
export const FUNKY_BOMBS = 6;

/** How far from where it hit a Funky Bomb throws its bombs, in pixels of the original game. */
export const FUNKY_REACH = 80;

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
