import React from "react";

import { PlayerInfo } from "../../shared/protocol";
import { playerColor } from "../colors";

interface Props {
  players: PlayerInfo[];
  /** The id of the player of this device, if it is one. */
  self?: number;
  /** Removes a player. Without it there are no buttons for removing. */
  onKick?: (player: PlayerInfo) => void;
}

/**
 * The players of a room, each with the colour of its tank. A player whose device is not connected
 * stays in the list, but looks different: dimmed, with a hollow colour and a label.
 */
export default function PlayerList({ players, self, onKick }: Props) {
  if (players.length === 0) return <p className="note">Nobody has joined yet.</p>;

  return (
    <ul className="players">
      {players.map((player) => (
        <li key={player.id} className={`players__player${player.connected ? "" : " players__player--away"}`}>
          <span
            className="players__color"
            style={player.connected ? { background: playerColor(player.id) } : { borderColor: playerColor(player.id) }}
          />
          <span className="players__name">
            {player.name}
            {player.id === self && " (you)"}
          </span>
          {!player.connected && <span className="players__status">Disconnected</span>}
          {onKick && (
            <button
              className="button button--small"
              onClick={() => onKick(player)}
              aria-label={`Remove ${player.name}`}
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
