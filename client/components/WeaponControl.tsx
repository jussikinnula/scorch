import React from "react";

import { WEAPONS } from "../../shared/weapons";

interface Props {
  /** The id of the weapon the tank fires next. */
  selected: string;
  /** How many the player has of each weapon, by its id. The weapons there is no end of are not among them. */
  counts: Record<string, number>;
  onSelect: (weapon: string) => void;
}

/** The choice of the weapon the tank fires next, from those the player has. */
export default function WeaponControl({ selected, counts, onSelect }: Props) {
  const owned = WEAPONS.filter((weapon) => !Number.isFinite(weapon.bundle) || counts[weapon.id] > 0);

  return (
    <label className="weapon">
      <span className="weapon__label">Weapon</span>
      <select className="weapon__select" value={selected} onChange={(event) => onSelect(event.target.value)}>
        {owned.map((weapon) => (
          <option key={weapon.id} value={weapon.id}>
            {weapon.name} {Number.isFinite(weapon.bundle) ? `× ${counts[weapon.id]}` : "∞"}
          </option>
        ))}
      </select>
    </label>
  );
}
