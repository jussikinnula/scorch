/**
 * The sound effects, made in the browser: a thump for a shot, a rumble for an explosion and a click
 * for what lands without exploding. They are the first, general ones (docs/PLAN.md, 3.7).
 */

/** How loud the effects are all together, from 0 to 1. */
export const EFFECTS_VOLUME = 0.3;
/** The least time between two clicks, in milliseconds: many things that land at once are one click. */
const CLICK_GAP = 80;

type AudioContextClass = typeof AudioContext;

export class Effects {
  private enabled = false;
  private context: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private clicked = 0;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) this.touched();
  }

  /** The user touched the page: a browser lets sound be made only after that. */
  touched() {
    if (this.enabled && this.context?.state === "suspended") void this.context.resume();
  }

  /** A tank fires: a short thump that falls in pitch, with a puff of noise. */
  fire() {
    const audio = this.audio();
    if (!audio) return;
    const { context, out } = audio;
    const now = context.currentTime;
    this.tone(context, out, "triangle", 180, 45, now, 0.22, 0.9);
    this.rumble(context, out, 1800, 300, now, 0.18, 0.5);
  }

  /** Something explodes: a rumble that is longer and deeper the larger the explosion. */
  explode(radius: number) {
    const audio = this.audio();
    if (!audio) return;
    const { context, out } = audio;
    const now = context.currentTime;
    const size = Math.min(1, Math.max(0, (radius - 10) / 140));
    const time = 0.35 + 0.9 * size;
    this.rumble(context, out, 1400 - 700 * size, 80, now, time, 0.9);
    this.tone(context, out, "sine", 110 - 50 * size, 30, now, time * 0.8, 0.8);
  }

  /** Something lands without exploding: a small click. */
  click() {
    const audio = this.audio();
    if (!audio) return;
    const { context, out } = audio;
    const now = performance.now();
    if (now - this.clicked < CLICK_GAP) return;
    this.clicked = now;
    this.tone(context, out, "square", 1100, 500, context.currentTime, 0.04, 0.25);
  }

  /** What the sounds are made with, when the effects are on and the browser can make sound. */
  private audio() {
    if (!this.enabled) return null;
    try {
      if (!this.context) {
        const Context: AudioContextClass | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
        if (!Context) return null;
        this.context = new Context();
        this.out = this.context.createGain();
        this.out.gain.value = EFFECTS_VOLUME;
        // Loud sounds on top of each other are pressed together and not let through as they are
        const limiter = this.context.createDynamicsCompressor();
        this.out.connect(limiter).connect(this.context.destination);
        // A second of noise, to cut the rumbles from
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (this.context.state === "suspended") void this.context.resume();
      return this.out ? { context: this.context, out: this.out } : null;
    } catch {
      return null;
    }
  }

  /** A tone that slides from one pitch to another and dies away. */
  private tone(
    context: AudioContext,
    out: AudioNode,
    type: OscillatorType,
    from: number,
    to: number,
    at: number,
    time: number,
    volume: number
  ) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + time);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + time);
    oscillator.connect(gain).connect(out);
    oscillator.start(at);
    oscillator.stop(at + time + 0.02);
  }

  /** Noise through a filter that closes: bright at first, then dull, dying away. */
  private rumble(
    context: AudioContext,
    out: AudioNode,
    from: number,
    to: number,
    at: number,
    time: number,
    volume: number
  ) {
    if (!this.noise) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + time);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + time);
    source.connect(filter).connect(gain).connect(out);
    source.start(at);
    source.stop(at + time + 0.02);
  }
}
