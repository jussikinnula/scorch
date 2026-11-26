/**
 * The weapons of the first phase (see docs/PLAN.md). The prices, the bundle sizes and the
 * blast radii are those of the manual of the original game. The reload times of the live mode are
 * our own starting values, to be tuned by playing.
 */
export interface Weapon {
  id: string;
  name: string;
  /** The price of a bundle in dollars. */
  price: number;
  /** How many are got with one purchase. Infinity: everyone always has these. */
  bundle: number;
  /** The radius of the explosion in pixels of the playing field, 0 if there is none. */
  radius: number;
  /** The lowest arms level (0-4) of a game where the weapon can be bought. */
  armsLevel: number;
  /** How long the tank reloads after firing this in the live mode, in seconds. */
  reload: number;
}

export const WEAPONS: readonly Weapon[] = [
  { id: "baby-missile", name: "Baby Missile", price: 400, bundle: Infinity, radius: 10, armsLevel: 0, reload: 3 },
  { id: "missile", name: "Missile", price: 1875, bundle: 5, radius: 20, armsLevel: 0, reload: 5 },
  { id: "baby-nuke", name: "Baby Nuke", price: 10000, bundle: 3, radius: 40, armsLevel: 0, reload: 12 },
  { id: "nuke", name: "Nuke", price: 12000, bundle: 1, radius: 75, armsLevel: 1, reload: 20 },
  { id: "mirv", name: "MIRV", price: 10000, bundle: 3, radius: 20, armsLevel: 2, reload: 15 },
  { id: "baby-roller", name: "Baby Roller", price: 5000, bundle: 10, radius: 10, armsLevel: 2, reload: 5 },
  { id: "roller", name: "Roller", price: 6000, bundle: 5, radius: 20, armsLevel: 2, reload: 7 },
  { id: "heavy-roller", name: "Heavy Roller", price: 6750, bundle: 2, radius: 45, armsLevel: 3, reload: 14 },
  { id: "dirt-clod", name: "Dirt Clod", price: 5000, bundle: 10, radius: 20, armsLevel: 0, reload: 4 },
  { id: "dirt-ball", name: "Dirt Ball", price: 5000, bundle: 5, radius: 35, armsLevel: 0, reload: 6 },
  { id: "ton-of-dirt", name: "Ton of Dirt", price: 6750, bundle: 2, radius: 70, armsLevel: 1, reload: 12 },
  { id: "riot-bomb", name: "Riot Bomb", price: 5000, bundle: 5, radius: 30, armsLevel: 3, reload: 5 },
  { id: "heavy-riot-bomb", name: "Heavy Riot Bomb", price: 4750, bundle: 2, radius: 45, armsLevel: 3, reload: 8 },
  { id: "tracer", name: "Tracer", price: 10, bundle: 20, radius: 0, armsLevel: 0, reload: 1 }
];
