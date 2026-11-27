import React, { useEffect, useRef, useState } from "react";

interface Props {
  onLeave: () => void;
}

/**
 * The button that leaves the game. Leaving cannot be undone, and the button is easy to hit by
 * accident: it asks first, and leaves only when the player says so.
 */
export default function LeaveButton({ onLeave }: Props) {
  const [asking, setAsking] = useState(false);
  const stay = useRef<HTMLButtonElement>(null);

  // The safe answer is the one at hand, and Escape is the same answer. While this is asked the keys of the
  // game do nothing: no key gets past here to them, so the space bar does not fire
  useEffect(() => {
    if (!asking) return;
    stay.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") setAsking(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [asking]);

  return (
    <>
      <button type="button" className="button controller__leave" onClick={() => setAsking(true)}>
        Leave the game
      </button>
      {asking && (
        <div className="ask" onClick={() => setAsking(false)}>
          <div
            className="ask__plate"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-question"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="leave-question">Leave the game?</h2>
            <p>Your tank is taken off the field, and you cannot come back to this game.</p>
            <div className="ask__answers">
              <button type="button" className="button" ref={stay} onClick={() => setAsking(false)}>
                Stay
              </button>
              <button type="button" className="button button--primary" onClick={onLeave}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
