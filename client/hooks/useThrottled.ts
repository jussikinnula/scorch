import { useCallback, useEffect, useRef } from "react";

/**
 * A function that runs the given one at most once in an interval.
 *
 * The first call runs it at once. Calls that come sooner than the interval after a run are joined
 * into one run, when the interval is over. This is how a control that is dragged sends its value:
 * often enough to feel immediate, never in a flood. The given function reads the latest value itself.
 *
 * @param run What to do.
 * @param interval The shortest time between two runs, in milliseconds.
 */
export function useThrottled(run: () => void, interval: number) {
  const latest = useRef(run);
  latest.current = run;
  const ranAt = useRef(-Infinity);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  return useCallback(() => {
    const runNow = () => {
      timer.current = null;
      ranAt.current = performance.now();
      latest.current();
    };

    if (timer.current !== null) return;
    const wait = ranAt.current + interval - performance.now();
    if (wait <= 0) runNow();
    else timer.current = window.setTimeout(runNow, wait);
  }, [interval]);
}
