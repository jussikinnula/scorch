import { useEffect, useState } from "react";

/**
 * The seconds that are left of a time that was told as milliseconds left, counted down on the clock
 * of this device from the moment it was told.
 *
 * @param time The milliseconds that were left when it was told, or null when there is nothing to count.
 * @param told Changes whenever the time is told again, also when it is the same number as before.
 */
export function useCountdown(time: number | null, told: unknown) {
  const [seconds, setSeconds] = useState(time === null ? null : Math.ceil(time / 1000));

  useEffect(() => {
    if (time === null) {
      setSeconds(null);
      return;
    }
    const until = performance.now() + time;
    const update = () => setSeconds(Math.max(0, Math.ceil((until - performance.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [time, told]);

  return seconds;
}
