import React from "react";

import { ACCESSORIES } from "../../shared/accessories";

interface Props {
  /** How many the player has of each item, by its id. */
  counts: Record<string, number>;
  /** The energy of the tank: a battery is of no use to a tank that has all of it. */
  energy: number;
  /** What is left of the shield of the tank, 0 when it has none. */
  shield: number;
  onUse: (item: string) => void;
}

/**
 * The accessories of the tank that the player uses during a round: a battery for energy, a shield to
 * put up. Only those the player has are shown. The parachutes are shown too, but not as a button:
 * one opens by itself when the tank falls.
 */
export default function GearControl({ counts, energy, shield, onUse }: Props) {
  const owned = ACCESSORIES.filter((accessory) => counts[accessory.id] > 0);
  if (owned.length === 0 && shield === 0) return null;

  return (
    <div className="gear" role="group" aria-label="Accessories">
      {shield > 0 && (
        <span className="gear__shield" aria-label="Shield">
          Shield {shield}
        </span>
      )}
      {owned.map((accessory) =>
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
      )}
    </div>
  );
}
