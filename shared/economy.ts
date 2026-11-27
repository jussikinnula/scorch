import { Weapon } from "./weapons";

/**
 * The money of the game: what a player earns in a round, and what is done with it between the
 * rounds. This is the Standard scoring of the original as far as it is known (docs/ORIGINAL.md,
 * "Scoring"): what is marked measured was read from the original, the rest are our own starting
 * values until they are measured too.
 */

/** What the player whose tank is the last one left gets. Measured. */
export const ROUND_WIN = 5000;
/** What a player gets for each point of energy its shots take from the tanks of others. Our own value. */
export const DAMAGE_REWARD = 20;
/** What a player gets on top of that for destroying the tank of another. Our own value. */
export const KILL_REWARD = 2000;
/**
 * What a player loses for each point of energy its shots take from its own tank. A player who
 * destroyed its own whole tank had 1,500 less after the round: that much is measured, that it goes
 * by the point is our reading of it. Money can go below zero, as it does in the original.
 */
export const SELF_DAMAGE_PENALTY = 15;
/** How long the shop is open between two rounds at most, in milliseconds. It closes sooner when everyone is ready. */
export const SHOP_TIME = 60000;

/** What a shot that took energy from a tank is worth to the one who fired it. */
export function damageReward(own: boolean, amount: number, destroyed: boolean) {
  if (own) return -amount * SELF_DAMAGE_PENALTY;
  return amount * DAMAGE_REWARD + (destroyed ? KILL_REWARD : 0);
}

/** Money after the interest of one round, at a rate in per cent. Debts earn none. */
export const withInterest = (money: number, percent: number) =>
  money > 0 ? money + Math.floor((money * percent) / 100) : money;

/** Whether a weapon is sold in a shop of an arms level: all but those there is no end of and those of a higher level. */
export const isForSale = (weapon: Weapon, armsLevel: number) =>
  Number.isFinite(weapon.bundle) && weapon.armsLevel <= armsLevel;

/**
 * What the shop pays for an item that is sold back, as a part of what it costs. Our own value: the
 * manual of the original only says that items are usually sold at a loss.
 */
export const SELL_RATE = 0.8;

/** How many of a weapon are sold at a time: a bundle, or what the player has left of one. */
export const sellCount = (weapon: Weapon, owned: number) => Math.min(owned, weapon.bundle);

/** What the shop pays for a number of a weapon. */
export const sellPrice = (weapon: Weapon, count: number) =>
  Math.floor((weapon.price / weapon.bundle) * count * SELL_RATE);
