import React from "react";

import { setSound, useSound } from "../sound/sound";

interface Props {
  className?: string;
}

/** The switches of the music and of the sound effects of this device. */
export default function SoundControls({ className }: Props) {
  const { music, effects } = useSound();
  return (
    <div className={`sound${className ? ` ${className}` : ""}`} role="group" aria-label="Sound">
      <button
        type="button"
        className={`button button--small${music ? " button--chosen" : ""}`}
        aria-pressed={music}
        onClick={() => setSound({ music: !music })}
      >
        Music {music ? "on" : "off"}
      </button>
      <button
        type="button"
        className={`button button--small${effects ? " button--chosen" : ""}`}
        aria-pressed={effects}
        onClick={() => setSound({ effects: !effects })}
      >
        Effects {effects ? "on" : "off"}
      </button>
    </div>
  );
}
