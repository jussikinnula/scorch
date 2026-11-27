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

  /**
   * A nuclear weapon goes off: a sharp crack, then a deep roar that rolls on for seconds. The larger
   * the weapon, the deeper and the longer: a Baby Nuke is a small one of these, a Nuke a large one.
   */
  nuke(radius: number) {
    const audio = this.audio();
    if (!audio) return;
    const { context, out } = audio;
    const now = context.currentTime;
    const size = Math.min(1, Math.max(0, (radius - 60) / 100));
    const time = 1.8 + 1.8 * size;
    // The crack of the flash
    this.rumble(context, out, 6000, 1200, now, 0.12, 0.8);
    // The roar: noise that grows dull slowly, over a tone that sinks below hearing
    this.rumble(context, out, 900 - 300 * size, 50, now + 0.05, time, 1);
    this.tone(context, out, "sine", 70 - 20 * size, 22, now + 0.05, time, 1);
    // It rolls: a second, quieter wave comes after the first
    this.rumble(context, out, 400, 60, now + 0.5 + 0.3 * size, time * 0.8, 0.5);
  }

  /** A Plasma Blast: a rising hum of energy that breaks into a crackle. */
  plasma(radius: number) {
    const audio = this.audio();
    if (!audio) return;
    const { context, out } = audio;
    const now = context.currentTime;
    const time = 0.5 + Math.min(1, radius / 150) * 0.6;
    this.tone(context, out, "sawtooth", 90, 520, now, time, 0.35);
    this.tone(context, out, "square", 183, 1040, now, time, 0.12);
    this.crackle(context, out, now + time * 0.4, time * 0.9, 0.5);
  }

  /** Napalm burns: the roar and the crackle of flames, for about as long as they are shown. */
  burn(hot: boolean) {
    const audio = this.audio();
    if (!audio) return;
    const { context, out } = audio;
    const now = context.currentTime;
    const time = hot ? 4 : 3;
    // The whoosh as it catches fire, then the low roar of the flames with crackles on top
    this.rumble(context, out, 2500, 500, now, 0.5, hot ? 0.6 : 0.45);
    this.rumble(context, out, hot ? 700 : 500, 200, now + 0.1, time, hot ? 0.5 : 0.35);
    this.crackle(context, out, now + 0.2, time - 0.4, hot ? 0.5 : 0.35);
  }

  /** A beam: a short tone that falls from high to low. */
  zap() {
    const audio = this.audio();
    if (!audio) return;
    const { context, out } = audio;
    this.tone(context, out, "sawtooth", 1800, 220, context.currentTime, 0.3, 0.35);
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

  /** A crackle: many tiny bursts of bright noise at uneven moments, thinning out towards the end. */
  private crackle(context: AudioContext, out: AudioNode, at: number, time: number, volume: number) {
    if (!this.noise) return;
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1800;
    filter.connect(out);
    for (let moment = 0; moment < time; moment += 0.03 + Math.random() * 0.09) {
      const source = context.createBufferSource();
      source.buffer = this.noise;
      const gain = context.createGain();
      const start = at + moment;
      const loud = volume * (0.3 + 0.7 * Math.random()) * (1 - moment / time);
      gain.gain.setValueAtTime(loud, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.025);
      source.connect(gain).connect(filter);
      source.start(start, Math.random() * 0.9);
      source.stop(start + 0.04);
    }
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
