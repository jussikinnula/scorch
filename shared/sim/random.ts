/** A source of random numbers: each call gives a number from 0 (inclusive) to 1 (exclusive). */
export type Random = () => number;

/**
 * A random number generator that gives the same numbers for the same seed (mulberry32).
 *
 * The simulation never uses Math.random: everything random in a game comes from a generator like
 * this, so that a game can be repeated in a test.
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number from min to max, both inclusive. */
export const randomInteger = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
