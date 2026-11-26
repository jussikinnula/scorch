import { useCallback, useEffect, useRef, useState } from "react";

/** How long a speech bubble is shown, in milliseconds. */
export const BUBBLE_TIME = 5000;

/** The speech bubbles that are shown right now: the text by the id of the player. */
export type Bubbles = Record<number, string>;

/**
 * The speech bubbles of the tanks. A bubble is shown for a while and then goes away. A new bubble
 * of a player takes the place of the old one, and stays for its own whole time.
 *
 * @returns The bubbles to show, and a function that adds one.
 */
export function useBubbles(time = BUBBLE_TIME) {
  const [bubbles, setBubbles] = useState<Bubbles>({});
  const timers = useRef(new Map<number, number>());

  useEffect(() => {
    const running = timers.current;
    return () => running.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const say = useCallback(
    (id: number, text: string) => {
      window.clearTimeout(timers.current.get(id));
      setBubbles((current) => ({ ...current, [id]: text }));
      timers.current.set(
        id,
        window.setTimeout(() => {
          timers.current.delete(id);
          setBubbles((current) => {
            const rest = { ...current };
            delete rest[id];
            return rest;
          });
        }, time)
      );
    },
    [time]
  );

  return { bubbles, say };
}
