import React from "react";

import { PlayerInfo } from "../../shared/protocol";
import { playerColor } from "../colors";

interface Props {
  players: PlayerInfo[];
  /** The id of the player of this device, if it is one. */
  self?: number;
}

/** The players in the order of the rounds they have won, the most first. Those with as many are in the order they joined. */
export const ranked = (players: PlayerInfo[]) => [...players].sort((a, b) => b.wins - a.wins || a.id - b.id);

/** The standings of a game: the players and the rounds each has won. */
export default function Standings({ players, self }: Props) {
  return (
    <ol className="standings">
      {ranked(players).map((player) => (
        <li key={player.id}>
          <span className="players__color" style={{ background: playerColor(player.id) }} />
          <span className="standings__name">
            {player.name}
            {player.id === self && " (you)"}
          </span>
          <span className="standings__wins" aria-label={`Rounds won by ${player.name}`}>
            {player.wins}
          </span>
        </li>
      ))}
    </ol>
  );
}
