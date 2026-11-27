import React from "react";

import { isForSale, sellCount, sellPrice } from "../../shared/economy";
import { MAX_ITEMS, WEAPONS } from "../../shared/weapons";
import { formatMoney } from "../money";

interface Props {
  money: number;
  /** How many the player has of each weapon, by its id. */
  counts: Record<string, number>;
  /** Whether the player has said it is ready. */
  ready: boolean;
  /** How long the shop is still open, as it is shown, or null when that is not known. */
  time: number | null;
  /** The arms level of the room: the weapons of a higher level are not sold. */
  armsLevel: number;
  onBuy: (weapon: string) => void;
  onSell: (weapon: string) => void;
  onReady: () => void;
}

/** The shop between two rounds, on the phone: what there is to buy, and a button for being done. */
export default function Shop({ money, counts, ready, time, armsLevel, onBuy, onSell, onReady }: Props) {
  return (
    <div className="shop">
      <p className="shop__money" aria-label="Money">
        {formatMoney(money)}
        {time !== null && time > 0 && <span aria-label="Time left">{time}</span>}
      </p>
      <ul className="shop__items">
        {WEAPONS.filter((weapon) => isForSale(weapon, armsLevel) || (counts[weapon.id] ?? 0) > 0).map((weapon) => {
          const owned = counts[weapon.id] ?? 0;
          const full = owned + weapon.bundle > MAX_ITEMS;
          return (
            <li key={weapon.id}>
              <span className="shop__name">
                {weapon.name}
                <small>
                  {weapon.bundle} for {formatMoney(weapon.price)} · you have {owned}
                </small>
              </span>
              <button
                className="button button--small"
                aria-label={`Sell ${weapon.name}`}
                title={
                  owned > 0
                    ? `${sellCount(weapon, owned)} for ${formatMoney(sellPrice(weapon, sellCount(weapon, owned)))}`
                    : undefined
                }
                onClick={() => onSell(weapon.id)}
                disabled={ready || owned <= 0}
              >
                Sell
              </button>
              <button
                className="button button--small"
                aria-label={`Buy ${weapon.name}`}
                onClick={() => onBuy(weapon.id)}
                disabled={ready || full || money < weapon.price || !isForSale(weapon, armsLevel)}
              >
                Buy
              </button>
            </li>
          );
        })}
      </ul>
      <button className="button button--primary shop__ready" onClick={onReady} disabled={ready}>
        {ready ? "Waiting for the others…" : "Ready"}
      </button>
    </div>
  );
}
