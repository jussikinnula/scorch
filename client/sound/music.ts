import { RoomPhase } from "../../shared/protocol";

/**
 * The music of the game: one piece at a time. When the piece changes, the one that plays fades out
 * to silence and only then the new one fades in: they are never heard on top of each other.
 */

/** What can be asked to play: the pieces by what they are for. "game" is several pieces, played one after another. */
export type Track = "title" | "game" | "market" | "victory" | "defeat";

/** How loud the music is at its loudest, from 0 to 1: it is a background, under the effects and the talk of the players. */
export const MUSIC_VOLUME = 0.25;
/** How long a piece takes to fade out or in, in milliseconds. */
export const FADE_TIME = 1500;
/** How often the volume is changed during a fade, in milliseconds. */
const FADE_STEP = 50;
/** The pieces that are played once and not started again when they end. */
const ONCE: Track[] = ["victory", "defeat"];

/** The part of an audio element that the music needs: also what a test gives in its place. */
export interface Player {
  volume: number;
  loop: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: "ended", listener: () => void): void;
}

/**
 * The music a view plays: the title music outside a game and while a game waits for its players,
 * the game music during a round, the market music in the shop, and at the end of a game the music
 * of a victory or of a defeat.
 *
 * @param won Whether the one who watches won the game, when it is over. On the big screen of a
 *   hotseat game there is always a winner to celebrate.
 */
export function trackOf(phase: RoomPhase | undefined, won = true): Track {
  if (phase === "playing") return "game";
  if (phase === "shop") return "market";
  if (phase === "finished") return won ? "victory" : "defeat";
  return "title";
}

/** The addresses of the pieces of each track, from the names of the music files: game01.mp3 and game02.mp3 are both of "game". */
export function tracksOf(files: Record<string, string>): Record<Track, string[]> {
  const tracks: Record<Track, string[]> = { title: [], game: [], market: [], victory: [], defeat: [] };
  for (const path of Object.keys(files).sort()) {
    const name = path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
    const track = (Object.keys(tracks) as Track[]).find((candidate) => name.replace(/\d+$/, "") === candidate);
    if (track) tracks[track].push(files[path]);
  }
  return tracks;
}

export class Music {
  /** What should be heard, whether or not the music is on. */
  private wanted: Track | null = null;
  private enabled = false;
  private playing: { track: Track; piece: number; player: Player } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** The browser did not let the music start: it does only after the user has touched the page. */
  private blocked = false;

  constructor(
    private tracks: Record<Track, string[]>,
    private create: (url: string) => Player,
    private random: () => number = Math.random
  ) {}

  /** Asks for a track to be played from now on, or for silence. Asking for what already plays changes nothing. */
  want(track: Track | null) {
    this.wanted = track;
    this.run();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.run();
  }

  /** The user touched the page: music that the browser did not let start is started now. */
  touched() {
    if (!this.blocked || !this.playing) return;
    this.blocked = false;
    this.start(this.playing.player);
  }

  /** What is heard right now, for the tests. */
  get heard() {
    return this.playing
      ? { track: this.playing.track, piece: this.playing.piece, volume: this.playing.player.volume }
      : null;
  }

  private get target() {
    return this.enabled && this.wanted && this.tracks[this.wanted].length > 0 ? this.wanted : null;
  }

  private run() {
    if (this.timer === null) this.timer = setInterval(() => this.step(), FADE_STEP);
    this.step();
  }

  /** One step of a fade: down while something else is wanted than what plays, then up with what is wanted. */
  private step() {
    const change = (MUSIC_VOLUME * FADE_STEP) / FADE_TIME;
    const { playing, target } = this;
    if (playing && playing.track !== target) {
      playing.player.volume = Math.max(0, playing.player.volume - change);
      if (playing.player.volume === 0) {
        playing.player.pause();
        this.playing = null;
      }
    } else if (!playing && target) {
      // The pieces of a track with several are played one after another, from any of them
      this.begin(target, Math.floor(this.random() * this.tracks[target].length));
    } else if (playing && playing.player.volume < MUSIC_VOLUME) {
      playing.player.volume = Math.min(MUSIC_VOLUME, playing.player.volume + change);
    } else if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private begin(track: Track, piece: number) {
    const pieces = this.tracks[track];
    const player = this.create(pieces[piece]);
    player.volume = 0;
    player.loop = pieces.length === 1 && !ONCE.includes(track);
    player.addEventListener("ended", () => {
      // The next piece of the track, if this is still what plays and there is another
      if (this.playing?.player !== player || pieces.length === 1) return;
      this.begin(track, (piece + 1) % pieces.length);
      this.run();
    });
    this.playing = { track, piece, player };
    this.start(player);
  }

  private start(player: Player) {
    try {
      const started = player.play();
      if (started) {
        started.catch(() => {
          if (this.playing?.player === player) this.blocked = true;
        });
      }
    } catch {
      // No sound here: the game goes on without the music
    }
  }
}
