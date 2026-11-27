import React from "react";

import { RoomSettings } from "../../shared/protocol";
import { formatMoney } from "../money";

/** The settings of a game in a few words each, for someone who is choosing a game or is about to play one. */
export function describeSettings(settings: RoomSettings): string[] {
  return [
    settings.turns === "classic" ? "Classic turns" : "Live",
    `${settings.rounds} ${settings.rounds === 1 ? "round" : "rounds"}`,
    `up to ${settings.maxPlayers} players`,
    settings.maxWind === 0 ? "no wind" : `wind up to ${settings.maxWind}${settings.changingWind ? ", changing" : ""}`,
    `walls: ${settings.walls}`,
    `${formatMoney(settings.cash)} at start`,
    `${settings.interest} % interest`,
    `arms level ${settings.armsLevel}`,
    ...(settings.traces ? ["every shot leaves a trace"] : [])
  ];
}

interface Props {
  settings: RoomSettings;
}

/** The settings of a game as a list to read: those of an online game, which cannot be changed. */
export default function SettingsSummary({ settings }: Props) {
  return (
    <ul className="settings-summary" aria-label="Settings">
      {describeSettings(settings).map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}
