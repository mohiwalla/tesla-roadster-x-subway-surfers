import { clamp01 } from "./utils";

/**
 * All sound is synthesized at runtime with the Web Audio API — no audio files.
 * Engine whine, wind, cold-gas thrusters, police siren, UI blips and a small
 * synthwave music sequencer.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;

  // engine / wind
  private engOsc1: OscillatorNode | null = null;
  private engOsc2: OscillatorNode | null = null;
  private engSub: OscillatorNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private engGain: GainNode | null = null;
  private windGain: GainNode | null = null;

  // thrusters
  private thrFilter: BiquadFilterNode | null = null;
  private thrGain: GainNode | null = null;

  // siren
  private sirenOsc: OscillatorNode | null = null;
  private sirenOsc2: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenPan: StereoPannerNode | null = null;

  private noiseBuf: AudioBuffer | null = null;
  private muted = false;

  // music
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicNextTime = 0;
  private musicPlaying = false;
  private musicDuck = false;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async init(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    // noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // ----- engine -----
    const engGain = ctx.createGain();
    engGain.gain.value = 0;
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = "lowpass";
    engFilter.frequency.value = 320;
    engFilter.Q.value = 0.8;
    engFilter.connect(engGain);
    engGain.connect(master);

    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.value = 60;
    const osc2 = ctx.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.value = 63;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 30;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.6;
    osc1.connect(engFilter);
    osc2.connect(engFilter);
    sub.connect(subGain);
    subGain.connect(engGain);
    osc1.start();
    osc2.start();
    sub.start();
    this.engOsc1 = osc1;
    this.engOsc2 = osc2;
    this.engSub = sub;
    this.engFilter = engFilter;
    this.engGain = engGain;

    // ----- wind -----
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 900;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start();
    this.windGain = windGain;

    // ----- thrusters -----
    const thrSrc = ctx.createBufferSource();
    thrSrc.buffer = buf;
    thrSrc.loop = true;
    const thrFilter = ctx.createBiquadFilter();
    thrFilter.type = "bandpass";
    thrFilter.frequency.value = 700;
    thrFilter.Q.value = 0.9;
    const thrGain = ctx.createGain();
    thrGain.gain.value = 0;
    thrSrc.connect(thrFilter);
    thrFilter.connect(thrGain);
    thrGain.connect(master);
    thrSrc.start();
    this.thrFilter = thrFilter;
    this.thrGain = thrGain;

    // ----- siren -----
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const sirenPan = ctx.createStereoPanner();
    sirenPan.connect(master);
    sirenGain.connect(sirenPan);

    const s1 = ctx.createOscillator();
    s1.type = "triangle";
    s1.frequency.value = 760;
    const s2 = ctx.createOscillator();
    s2.type = "triangle";
    s2.frequency.value = 772;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.42;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 170;
    lfo.connect(lfoGain);
    lfoGain.connect(s1.frequency);
    lfoGain.connect(s2.frequency);
    s1.connect(sirenGain);
    s2.connect(sirenGain);
    s1.start();
    s2.start();
    lfo.start();
    this.sirenOsc = s1;
    this.sirenOsc2 = s2;
    this.sirenGain = sirenGain;
    this.sirenPan = sirenPan;
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  // ------------------------------------------------------------------ engine
  /** speed01: 0..1 of top speed. Idle when the run is not active. */
  setEngine(speed01: number, flying: boolean, active: boolean): void {
    if (!this.ctx || !this.engOsc1 || !this.engOsc2 || !this.engSub || !this.engFilter || !this.engGain || !this.windGain) return;
    const t = this.ctx.currentTime;
    const spd = clamp01(speed01);
    const f = 52 + spd * 105 * (flying ? 1.3 : 1);
    this.engOsc1.frequency.setTargetAtTime(f, t, 0.08);
    this.engOsc2.frequency.setTargetAtTime(f + 3.5, t, 0.08);
    this.engSub.frequency.setTargetAtTime(f * 0.5, t, 0.1);
    this.engFilter.frequency.setTargetAtTime(240 + spd * 1150, t, 0.1);
    this.engGain.gain.setTargetAtTime(active ? 0.055 + spd * 0.075 : 0.012, t, 0.12);
    this.windGain.gain.setTargetAtTime(active ? Math.max(0, spd - 0.35) * 0.17 : 0.0, t, 0.15);
  }

  // ---------------------------------------------------------------- thruster
  setThruster(active: boolean, intensity: number): void {
    if (!this.ctx || !this.thrGain || !this.thrFilter) return;
    const t = this.ctx.currentTime;
    this.thrGain.gain.setTargetAtTime(active ? 0.14 * clamp01(intensity) : 0, t, active ? 0.03 : 0.1);
    if (active) this.thrFilter.frequency.setTargetAtTime(600 + 500 * Math.random(), t, 0.2);
  }

  /** The signature cold-gas "psssshh" burst. */
  psst(intensity = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(380, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * intensity, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.7);
  }

  // ------------------------------------------------------------------- siren
  setSiren(distance: number, pan: number, far: number): void {
    if (!this.ctx || !this.sirenGain || !this.sirenPan) return;
    const t = this.ctx.currentTime;
    const closeness = clamp01(1 - distance / far);
    this.sirenGain.gain.setTargetAtTime(Math.pow(closeness, 1.5) * 0.24, t, 0.15);
    this.sirenPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.2);
  }

  sirenOff(): void {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  // --------------------------------------------------------------------- sfx
  private blip(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, freqEnd?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, filterFreq: number, gain: number, type: BiquadFilterType = "lowpass", delay = 0, sweepTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  coin(): void {
    this.blip(1318, 0.07, "sine", 0.16);
    this.blip(1760, 0.12, "sine", 0.14, 0.06);
  }

  cell(): void {
    this.blip(420, 0.22, "sine", 0.16, 0, 1250);
    this.blip(1660, 0.18, "triangle", 0.1, 0.12);
  }

  crash(): void {
    this.noiseBurst(0.32, 900, 0.5, "lowpass", 0, 160);
    this.blip(150, 0.25, "square", 0.28, 0, 60);
    this.blip(97, 0.3, "sawtooth", 0.2, 0.01, 45);
  }

  hop(): void {
    this.noiseBurst(0.22, 300, 0.22, "bandpass", 0, 1500);
  }

  land(hard: boolean): void {
    this.noiseBurst(hard ? 0.25 : 0.12, hard ? 400 : 700, hard ? 0.3 : 0.14, "lowpass");
    this.blip(120, 0.1, "sine", hard ? 0.22 : 0.1, 0, 70);
  }

  takeoff(): void {
    this.psst(1);
    this.blip(220, 0.4, "sawtooth", 0.1, 0, 660);
  }

  laneSwitch(): void {
    this.noiseBurst(0.08, 2600, 0.1, "highpass");
  }

  countdownBeep(go: boolean): void {
    if (go) {
      this.blip(1320, 0.4, "square", 0.2);
    } else {
      this.blip(880, 0.14, "square", 0.16);
    }
  }

  busted(): void {
    // siren sting + descending chord
    this.noiseBurst(0.5, 1600, 0.3, "bandpass");
    this.blip(523, 0.5, "sawtooth", 0.14, 0, 260);
    this.blip(415, 0.55, "sawtooth", 0.12, 0.12, 200);
    this.blip(311, 0.7, "sawtooth", 0.12, 0.24, 150);
    this.noiseBurst(0.8, 300, 0.3, "lowpass", 0.3);
  }

  newBest(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.blip(n, 0.16, "triangle", 0.16, i * 0.09));
  }

  uiClick(): void {
    this.blip(660, 0.06, "square", 0.1);
  }

  // -------------------------------------------------------------------- music
  startMusic(): void {
    if (!this.ctx || !this.master || this.musicPlaying) return;
    if (!this.musicBus) {
      const bus = this.ctx.createGain();
      bus.gain.value = 0.5;
      bus.connect(this.master);
      this.musicBus = bus;
    }
    this.musicPlaying = true;
    this.musicStep = 0;
    this.musicNextTime = this.ctx.currentTime + 0.08;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicPlaying = false;
  }

  setMusicDuck(duck: boolean): void {
    this.musicDuck = duck;
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(duck ? 0.14 : 0.5, this.ctx.currentTime, 0.25);
    }
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicPlaying) return;
    const spb = 60 / 112 / 4; // 16th note
    while (this.musicNextTime < ctx.currentTime + 0.14) {
      this.playStep(this.musicStep, this.musicNextTime);
      this.musicStep++;
      this.musicNextTime += spb;
    }
  }

  private playStep(step: number, t: number): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;

    const roots = [110.0, 87.31, 130.81, 98.0]; // Am F C G
    const chords = [
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [261.63, 329.63, 392.0],
      [196.0, 246.94, 293.66],
    ];
    const arpNotes = [
      [220.0, 261.63, 329.63, 440.0],
      [174.61, 220.0, 261.63, 349.23],
      [261.63, 329.63, 392.0, 523.25],
      [196.0, 246.94, 293.66, 392.0],
    ];
    const root = roots[bar];

    // kick: four on the floor
    if (s % 4 === 0) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(130, t);
      osc.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(g);
      g.connect(bus);
      osc.start(t);
      osc.stop(t + 0.2);
    }
    // snare 2 & 4
    if (s === 4 || s === 12) {
      this.musicNoise(t, 1900, "bandpass", 0.2, 0.12, bus);
    }
    // hat offbeats
    if (s % 4 === 2) {
      this.musicNoise(t, 7800, "highpass", 0.05, 0.035, bus);
    }
    // bass 8ths
    if (s % 2 === 0) {
      const f = s === 14 ? root * 1.5 : root;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(lp);
      lp.connect(g);
      g.connect(bus);
      osc.start(t);
      osc.stop(t + 0.2);
    }
    // arp on 8ths
    if (s % 2 === 0) {
      const idx = [0, 1, 2, 3, 2, 1, 2, 3][(s / 2) % 8];
      const f = arpNotes[bar][idx];
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      const osc2 = ctx.createOscillator();
      osc2.type = "triangle";
      osc2.frequency.value = f * 1.005;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      osc.connect(lp);
      osc2.connect(lp);
      lp.connect(g);
      g.connect(bus);
      osc.start(t);
      osc2.start(t);
      osc.stop(t + 0.24);
      osc2.stop(t + 0.24);
    }
    // pad at bar start
    if (s === 0) {
      const dur = (60 / 112) * 4;
      for (const f of chords[bar]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        const osc2 = ctx.createOscillator();
        osc2.type = "sawtooth";
        osc2.frequency.value = f * 1.01;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 800;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.018, t + 0.9);
        g.gain.setValueAtTime(0.018, t + dur - 0.7);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        osc.connect(lp);
        osc2.connect(lp);
        lp.connect(g);
        g.connect(bus);
        osc.start(t);
        osc2.start(t);
        osc.stop(t + dur + 0.1);
        osc2.stop(t + dur + 0.1);
      }
    }
  }

  private musicNoise(t: number, freq: number, type: BiquadFilterType, gain: number, dur: number, bus: GainNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}
