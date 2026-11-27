import React, { useEffect, useRef, useState } from "react";

import { ACCESSORIES } from "../../shared/accessories";

interface Props {
  /** How many the player has of each item, by its id. */
  counts: Record<string, number>;
  /** The energy of the tank: a battery is of no use to a tank that has all of it. */
  energy: number;
  /** What is left of the shield of the tank, 0 when it has none. */
  shield: number;
  onUse: (item: string) => void;
  /**
   * Whether the accessories are behind one button, which opens them as a list, as the inventory of
   * the original: for where there is no room for a button of each.
   */
  compact?: boolean;
}

/**
 * The accessories of the tank that the player uses during a round: a battery for energy, a shield to
 * put up. Only those the player has are shown. The parachutes are shown too, but not as a button:
 * one opens by itself when the tank falls.
 */
export default function GearControl({ counts, energy, shield, onUse, compact = false }: Props) {
  const owned = ACCESSORIES.filter((accessory) => counts[accessory.id] > 0);
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);

  // While the list is open the keys of the game do nothing, and Escape closes it
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (owned.length === 0 && shield === 0) return null;

  const worn = shield > 0 && (
    <span className="gear__shield" aria-label="Shield">
      Shield {shield}
    </span>
  );
  const items = owned.map((accessory) =>
    accessory.kind === "parachute" ? (
      <span key={accessory.id} className="gear__worn" aria-label="Parachutes">
        Parachute × {counts[accessory.id]}
      </span>
    ) : (
      <button
        key={accessory.id}
        className="button button--small"
        aria-label={`Use ${accessory.name}`}
        onClick={() => onUse(accessory.id)}
        disabled={accessory.kind === "battery" && energy >= 100}
      >
        {accessory.name} × {counts[accessory.id]}
      </button>
    )
  );

  if (!compact) {
    return (
      <div className="gear" role="group" aria-label="Accessories">
        {worn}
        {items}
      </div>
    );
  }

  return (
    <div className="gear" role="group" aria-label="Accessories">
      {worn}
      {owned.length > 0 && (
        <button type="button" className="button button--small" onClick={() => setOpen(true)}>
          Inventory
        </button>
      )}
      {open && (
        <div className="ask" onClick={() => setOpen(false)}>
          <div
            className="ask__plate"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="inventory-title">Inventory</h2>
            <div className="gear__list">
              {worn}
              {items}
            </div>
            <div className="ask__answers">
              <button type="button" className="button" ref={close} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
