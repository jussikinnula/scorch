/** The colours of the tanks, by the number of the player in the room. They are told apart on a TV. */
export const PLAYER_COLORS = [
  "#e6194b",
  "#3cb44b",
  "#ffe119",
  "#4363d8",
  "#f58231",
  "#b45cf0",
  "#42d4f4",
  "#f032e6",
  "#bfef45",
  "#fabed4"
] as const;

export const playerColor = (id: number) => PLAYER_COLORS[id % PLAYER_COLORS.length];
