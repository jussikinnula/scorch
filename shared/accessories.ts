/**
 * The accessories of a tank: what is bought in the shop beside the weapons, and used or worn instead
 * of fired. The prices, the bundle sizes and the arms levels are those of the original
 * (docs/ORIGINAL.md, "Accessories"). How much a shield takes is not known of the original: those
 * numbers are our own.
 */

/**
 * What an accessory does:
 * - parachute: opens by itself when the tank falls far enough to be hurt, and takes the damage of the fall. One for a fall.
 * - battery: gives the tank ten of its energy back, when the player uses one.
 * - shield: when the player puts one up, it takes the damage of the explosions of others until it is used up.
 */
export type AccessoryKind = "parachute" | "battery" | "shield";

export interface Accessory {
  id: string;
  name: string;
  kind: AccessoryKind;
  /** The price of a bundle in dollars. */
  price: number;
  /** How many are got with one purchase. */
  bundle: number;
  /** The lowest arms level (0-4) of a game where it can be bought. */
  armsLevel: number;
  /** For a shield: how much damage it takes before it is gone. For a battery: how much energy it gives. */
  strength: number;
}

export const ACCESSORIES: readonly Accessory[] = [
  { id: "parachute", name: "Parachute", kind: "parachute", price: 10000, bundle: 8, armsLevel: 2, strength: 0 },
  { id: "battery", name: "Battery", kind: "battery", price: 5000, bundle: 10, armsLevel: 2, strength: 10 },
  { id: "shield", name: "Shield", kind: "shield", price: 20000, bundle: 3, armsLevel: 3, strength: 100 },
  { id: "heavy-shield", name: "Heavy Shield", kind: "shield", price: 30000, bundle: 2, armsLevel: 4, strength: 200 }
];

export const findAccessory = (id: string) => ACCESSORIES.find((accessory) => accessory.id === id);

/**
 * A parachute opens only when the fall would take more energy than this from the tank, as in the
 * original, where it is the default of a setting of the player: a small fall is not worth a parachute.
 */
export const PARACHUTE_THRESHOLD = 5;
