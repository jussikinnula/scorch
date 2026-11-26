import React, { useEffect, useState } from "react";

interface Props {
  /** When the tank can fire again, on the clock of performance.now(). In the past when it can fire now. */
  reloadedAt: number;
  /** How long the reload that is going on takes in all, in milliseconds. */
  reloadTime: number;
  /** Why the tank cannot fire although it is not reloading, e.g. that it is not the turn of the player. */
  waiting?: string;
  onFire: () => void;
}

/** The fire button. While the tank reloads the button cannot be pressed, and shows how the reload proceeds. */
export default function FireControl({ reloadedAt, reloadTime, waiting, onFire }: Props) {
  const [reloading, setReloading] = useState(() => reloadedAt > performance.now());

  useEffect(() => {
    const left = reloadedAt - performance.now();
    setReloading(left > 0);
    if (left <= 0) return;
    const timer = window.setTimeout(() => setReloading(false), left);
    return () => window.clearTimeout(timer);
  }, [reloadedAt]);

  return (
    <button className="button fire" onClick={onFire} disabled={reloading || waiting !== undefined}>
      {reloading && (
        // A new bar for each reload, so that its animation starts from the beginning
        <span key={reloadedAt} className="fire__reload" style={{ animationDuration: `${reloadTime}ms` }} />
      )}
      <span className="fire__label">{reloading ? "Reloading…" : (waiting ?? "Fire")}</span>
    </button>
  );
}
