// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FADE_TIME, Music, MUSIC_VOLUME, Player, trackOf, tracksOf } from "./music";

/** An audio element of a test: it remembers what was done to it. */
class FakePlayer implements Player {
  volume = 1;
  currentTime = 0;
  duration = 120;
  playing = false;
  ended: (() => void) | null = null;
  constructor(public url: string) {}
  play() {
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  addEventListener(_type: "ended", listener: () => void) {
    this.ended = listener;
  }
}

describe("the music", () => {
  const tracks = tracksOf({
    "../assets/music/title.mp3": "title",
    "../assets/music/game02.mp3": "game2",
    "../assets/music/game01.mp3": "game1",
    "../assets/music/game03.mp3": "game3",
    "../assets/music/market.mp3": "market",
    "../assets/music/victory.mp3": "victory",
    "../assets/music/readme.mp3": "readme"
  });
  let players: FakePlayer[];
  let music: Music;
  const playing = () => players.filter((player) => player.playing);

  beforeEach(() => {
    vi.useFakeTimers();
    players = [];
    music = new Music(
      tracks,
      (url) => {
        const player = new FakePlayer(url);
        players.push(player);
        return player;
      },
      () => 0
    );
  });
  afterEach(() => vi.useRealTimers());

  it("finds its pieces by the names of the files: the numbered ones are of the same track, in order", () => {
    expect(tracks).toEqual({
      title: ["title"],
      game: ["game1", "game2", "game3"],
      market: ["market"],
      victory: ["victory"],
      defeat: []
    });
  });

  it("is silent until it is turned on, and then fades in what was asked for: never loud", () => {
    music.want("title");
    vi.advanceTimersByTime(5000);
    expect(players).toEqual([]);

    music.setEnabled(true);
    expect(playing().map((player) => player.url)).toEqual(["title"]);
    expect(players[0].volume).toBeLessThan(0.02);
    vi.advanceTimersByTime(FADE_TIME / 2);
    expect(players[0].volume).toBeGreaterThan(MUSIC_VOLUME * 0.4);
    expect(players[0].volume).toBeLessThan(MUSIC_VOLUME * 0.6);
    vi.advanceTimersByTime(FADE_TIME);
    expect(players[0].volume).toBeCloseTo(MUSIC_VOLUME);
    expect(MUSIC_VOLUME).toBeLessThanOrEqual(0.3);
    // Asking for the same again changes nothing
    music.want("title");
    vi.advanceTimersByTime(FADE_TIME);
    expect(players).toHaveLength(1);
  });

  it("fades the old piece out before the new one starts: never two at once", () => {
    music.setEnabled(true);
    music.want("title");
    vi.advanceTimersByTime(FADE_TIME * 2);
    music.want("market");
    for (let time = 0; time < FADE_TIME * 3; time += 50) {
      vi.advanceTimersByTime(50);
      expect(playing().length).toBeLessThanOrEqual(1);
      // The new one does not start while the old one is still heard
      if (players.length > 1) expect(players[0].playing).toBe(false);
    }
    expect(playing().map((player) => player.url)).toEqual(["market"]);
    expect(players[1].volume).toBeCloseTo(MUSIC_VOLUME);
    expect(players[0].volume).toBe(0);
  });

  it("goes where it is asked to last when the mind changes in the middle of a fade", () => {
    music.setEnabled(true);
    music.want("title");
    vi.advanceTimersByTime(FADE_TIME * 2);
    music.want("market");
    vi.advanceTimersByTime(FADE_TIME / 2);
    music.want("title");
    vi.advanceTimersByTime(FADE_TIME * 2);
    // The title music was not started again: it came back up
    expect(players).toHaveLength(1);
    expect(music.heard).toMatchObject({ track: "title" });
    expect(players[0].volume).toBeCloseTo(MUSIC_VOLUME);
  });

  it("plays the pieces of the game one after another, and the music of the end once", () => {
    music.setEnabled(true);
    music.want("game");
    vi.advanceTimersByTime(FADE_TIME * 2);
    expect(music.heard).toMatchObject({ track: "game", piece: 0 });
    players[0].playing = false;
    players[0].ended?.();
    vi.advanceTimersByTime(FADE_TIME * 2);
    expect(playing().map((player) => player.url)).toEqual(["game2"]);
    expect(players[1].volume).toBeCloseTo(MUSIC_VOLUME);

    music.want("victory");
    vi.advanceTimersByTime(FADE_TIME * 3);
    expect(playing().map((player) => player.url)).toEqual(["victory"]);
    // The music of the end is played once: when it is over there is silence
    players[2].playing = false;
    players[2].ended?.();
    vi.advanceTimersByTime(FADE_TIME * 2);
    expect(playing()).toEqual([]);
    expect(players).toHaveLength(3);
  });

  it("fades out towards the end of a piece and starts it again with a fade in: no cut where it loops", () => {
    music.setEnabled(true);
    music.want("title");
    vi.advanceTimersByTime(FADE_TIME * 2);
    expect(players[0].volume).toBeCloseTo(MUSIC_VOLUME);

    // Half a fade from its end it is half as loud, and at the end silent
    players[0].currentTime = players[0].duration - FADE_TIME / 2000;
    vi.advanceTimersByTime(100);
    expect(players[0].volume).toBeCloseTo(MUSIC_VOLUME / 2, 1);
    players[0].currentTime = players[0].duration;
    vi.advanceTimersByTime(100);
    expect(players[0].volume).toBe(0);
    players[0].playing = false;
    players[0].ended?.();

    // The same piece again, from silence
    expect(playing().map((player) => player.url)).toEqual(["title"]);
    expect(players).toHaveLength(2);
    expect(players[1].volume).toBeLessThan(0.02);
    vi.advanceTimersByTime(FADE_TIME * 2);
    expect(players[1].volume).toBeCloseTo(MUSIC_VOLUME);
  });

  it("fades out when it is turned off or silence is asked for, and is silent for a track that has no files", () => {
    music.setEnabled(true);
    music.want("title");
    vi.advanceTimersByTime(FADE_TIME * 2);
    music.setEnabled(false);
    vi.advanceTimersByTime(FADE_TIME / 2);
    expect(players[0].playing).toBe(true);
    expect(players[0].volume).toBeLessThan(MUSIC_VOLUME * 0.6);
    vi.advanceTimersByTime(FADE_TIME);
    expect(playing()).toEqual([]);

    music.setEnabled(true);
    vi.advanceTimersByTime(FADE_TIME * 2);
    expect(playing().map((player) => player.url)).toEqual(["title"]);
    music.want("defeat");
    vi.advanceTimersByTime(FADE_TIME * 3);
    expect(playing()).toEqual([]);
    music.want(null);
    vi.advanceTimersByTime(FADE_TIME * 3);
    expect(music.heard).toBeNull();
  });

  it("starts when the page is touched, if the browser did not let it start before that", async () => {
    let allowed = false;
    const blocked = new Music(tracks, (url) => {
      const player = new FakePlayer(url);
      player.play = () => {
        player.playing = allowed;
        return allowed ? Promise.resolve() : Promise.reject(new Error("not allowed"));
      };
      players.push(player);
      return player;
    });
    blocked.setEnabled(true);
    blocked.want("title");
    await vi.advanceTimersByTimeAsync(FADE_TIME);
    expect(playing()).toEqual([]);
    allowed = true;
    blocked.touched();
    expect(playing().map((player) => player.url)).toEqual(["title"]);
  });
});

describe("the track of a view", () => {
  it("is by the phase of the game, and at the end by how it went", () => {
    expect(trackOf(undefined)).toBe("title");
    expect(trackOf("lobby")).toBe("title");
    expect(trackOf("playing")).toBe("game");
    expect(trackOf("shop")).toBe("market");
    expect(trackOf("finished")).toBe("victory");
    expect(trackOf("finished", true)).toBe("victory");
    expect(trackOf("finished", false)).toBe("defeat");
  });
});
