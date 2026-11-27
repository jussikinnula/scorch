import React from "react";

interface Props {
  /** How hard the wind blows, with a sign for the way: positive blows to the right. */
  wind: number;
  className?: string;
}

/** The wind of the round, as in the original: an arrow that points the way it blows, and how hard. */
export default function Wind({ wind, className }: Props) {
  const text = wind === 0 ? "No wind" : wind < 0 ? `◀ Wind ${-wind}` : `Wind ${wind} ▶`;
  return (
    <p className={className} aria-label="Wind">
      {text}
    </p>
  );
}
