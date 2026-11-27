import { useEffect, useSyncExternalStore } from "react";

import { Effects } from "./effects";
import { Music, Track, tracksOf } from "./music";

/**
 * The sound of this device: the music and the effects, each on or off as the user has chosen. The
 * choices are remembered on the device. The music is off until it is turned on; the effects are on.
 */

export interface SoundSettings {
  music: boolean;
  effects: boolean;
}

const KEY = "scorch.sound";
const DEFAULTS: SoundSettings = { music: false, effects: true };

function load(): SoundSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<SoundSettings>;
    return {
      music: typeof saved.music === "boolean" ? saved.music : DEFAULTS.music,
      effects: typeof saved.effects === "boolean" ? saved.effects : DEFAULTS.effects
    };
  } catch {
    return DEFAULTS;
  }
}

// The music files that are in the build, whatever they are: the game goes on without those that are not
const files = import.meta.glob<string>("../assets/music/*.mp3", { eager: true, query: "?url", import: "default" });

let settings = load();
const listeners = new Set<() => void>();

export const music = new Music(tracksOf(files), (url) => new Audio(url));
export const effects = new Effects();
music.setEnabled(settings.music);
effects.setEnabled(settings.effects);

// A browser lets a page make sound only after the user has touched it
if (typeof window !== "undefined") {
  for (const event of ["pointerdown", "keydown"] as const) {
    window.addEventListener(event, () => {
      music.touched();
      effects.touched();
    });
  }
}

export function setSound(changed: Partial<SoundSettings>) {
  settings = { ...settings, ...changed };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // The choice is not remembered, but it holds for now
  }
  music.setEnabled(settings.music);
  effects.setEnabled(settings.effects);
  listeners.forEach((listener) => listener());
}

/** The choices of the user, for a view that shows them. */
export function useSound(): SoundSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => settings
  );
}

/**
 * Asks for the music of a view for as long as the view is shown with it. Null is silence.
 *
 * @param mine Whether the music is this view's to choose right now: a view that leaves it to another asks for nothing.
 */
export function useMusic(track: Track | null, mine = true) {
  useEffect(() => {
    if (mine) music.want(track);
  }, [track, mine]);
}
