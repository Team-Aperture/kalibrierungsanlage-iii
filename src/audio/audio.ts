/**
 * Original synthesized sound (WebAudio, no files). Ambient hum layers plus short
 * effects. The context is created/resumed on the first user gesture to respect
 * autoplay rules. Sound is never required to solve anything.
 */

export type SfxName =
  | 'step'
  | 'terminal'
  | 'beep'
  | 'type'
  | 'switch'
  | 'relay'
  | 'clank'
  | 'door'
  | 'powerUp'
  | 'spark'
  | 'pickup'
  | 'deny'
  | 'rotate'
  | 'short'
  | 'solved'
  | 'tink'
  | 'ratchet'
  | 'gate'
  | 'signal'
  | 'ui';

export type Ambience = 'none' | 'hum' | 'humLit' | 'hall' | 'hallQuiet';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private amb: { stop: () => void; name: Ambience } | null = null;
  private wantAmb: Ambience = 'none';
  private stepAlt = false;
  volume = 0.7;
  muted = false;

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.ambBus = this.ctx.createGain();
      this.ambBus.gain.value = 0.55;
      this.ambBus.connect(this.master);
      this.noise = this.makeNoise();
      this.applyVolume();
      if (this.wantAmb !== 'none') this.ambience(this.wantAmb, true);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolume(v: number, muted: boolean): void {
    this.volume = v;
    this.muted = muted;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.master || !this.ctx) return;
    const v = this.muted ? 0 : this.volume * this.volume;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Lowers everything while menus are open. */
  duck(on: boolean): void {
    if (!this.ambBus || !this.ctx) return;
    this.ambBus.gain.setTargetAtTime(on ? 0.2 : 0.55, this.ctx.currentTime, 0.2);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    return buf;
  }

  private env(g: GainNode, t: number, a: number, peak: number, dec: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, dest: AudioNode, attack = 0.005): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  private burst(t: number, dur: number, peak: number, filterType: BiquadFilterType, freq: number, q: number, dest: AudioNode, f1?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.004, peak, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.1);
  }

  sfx(name: SfxName, opts: { volume?: number; rate?: number } = {}): void {
    if (!this.ctx || !this.sfxBus || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    const v = opts.volume ?? 1;
    const out = this.sfxBus;
    switch (name) {
      case 'step': {
        this.stepAlt = !this.stepAlt;
        this.burst(t, 0.07, 0.16 * v, 'bandpass', this.stepAlt ? 900 : 760, 1.4, out);
        this.tone('sine', 120, 70, t, 0.06, 0.08 * v, out);
        break;
      }
      case 'terminal': {
        this.tone('sawtooth', 15600, 15400, t, 1.2, 0.012 * v, out, 0.05);
        this.tone('square', 880, 880, t + 0.15, 0.08, 0.05 * v, out);
        this.tone('square', 1320, 1320, t + 0.3, 0.1, 0.05 * v, out);
        this.burst(t, 0.25, 0.06 * v, 'highpass', 3000, 0.7, out);
        break;
      }
      case 'beep':
        this.tone('square', 1040, 1040, t, 0.07, 0.05 * v, out);
        break;
      case 'type':
        this.burst(t, 0.02, 0.05 * v, 'highpass', 4000, 0.8, out);
        break;
      case 'switch':
        this.burst(t, 0.03, 0.25 * v, 'bandpass', 2400, 3, out);
        this.tone('square', 180, 90, t, 0.04, 0.08 * v, out);
        break;
      case 'relay':
        this.burst(t, 0.02, 0.3 * v, 'bandpass', 1800, 4, out);
        this.burst(t + 0.05, 0.02, 0.2 * v, 'bandpass', 1500, 4, out);
        break;
      case 'clank':
        this.tone('triangle', 220, 160, t, 0.25, 0.22 * v, out);
        this.tone('square', 410, 380, t, 0.12, 0.06 * v, out);
        this.burst(t, 0.12, 0.25 * v, 'bandpass', 1200, 2, out);
        break;
      case 'door':
        this.burst(t, 2.6, 0.22 * v, 'lowpass', 300, 1, out, 900);
        this.tone('sawtooth', 48, 62, t, 2.6, 0.08 * v, out, 0.3);
        this.burst(t + 2.55, 0.25, 0.35 * v, 'bandpass', 700, 1.5, out);
        break;
      case 'powerUp':
        this.tone('sawtooth', 40, 120, t, 2.2, 0.12 * v, out, 0.4);
        this.tone('sine', 80, 240, t, 2.2, 0.12 * v, out, 0.4);
        this.burst(t, 1.5, 0.08 * v, 'bandpass', 200, 2, out, 1600);
        break;
      case 'spark':
        this.burst(t, 0.09, 0.22 * v * (0.6 + Math.random() * 0.4), 'highpass', 2500 + Math.random() * 2000, 0.9, out);
        break;
      case 'pickup':
        this.tone('square', 660, 660, t, 0.06, 0.05 * v, out);
        this.tone('square', 990, 990, t + 0.07, 0.1, 0.05 * v, out);
        break;
      case 'deny':
        this.tone('square', 160, 120, t, 0.12, 0.06 * v, out);
        break;
      case 'rotate':
        this.burst(t, 0.04, 0.25 * v, 'bandpass', 1600, 2.5, out);
        this.tone('triangle', 300, 260, t, 0.06, 0.08 * v, out);
        break;
      case 'short':
        this.burst(t, 0.35, 0.3 * v, 'highpass', 1800, 0.7, out);
        this.tone('sawtooth', 110, 60, t, 0.3, 0.1 * v, out);
        break;
      case 'solved':
        [523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f, t + i * 0.09, 0.14, 0.05 * v, out));
        break;
      case 'tink':
        this.tone('sine', 2600, 2400, t, 0.15, 0.06 * v, out);
        this.burst(t, 0.05, 0.1 * v, 'highpass', 5000, 0.8, out);
        break;
      case 'ratchet':
        for (let i = 0; i < 4; i++) this.burst(t + i * 0.07, 0.025, 0.22 * v, 'bandpass', 2000 + i * 120, 4, out);
        break;
      case 'gate':
        this.burst(t, 1.8, 0.2 * v, 'lowpass', 400, 1, out, 1200);
        this.tone('sawtooth', 55, 70, t, 1.8, 0.07 * v, out, 0.2);
        break;
      case 'signal': {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 523;
        lfo.frequency.value = 5.5;
        lg.gain.value = 9;
        lfo.connect(lg).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06 * v, t + 0.8);
        g.gain.setValueAtTime(0.06 * v, t + 4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
        o.connect(g).connect(out);
        o.start(t);
        lfo.start(t);
        o.stop(t + 6.1);
        lfo.stop(t + 6.1);
        [0, 0.5, 1.5, 2, 2.25, 3.5].forEach((d) => this.tone('square', 1568, 1568, t + 0.5 + d, 0.08, 0.03 * v, out));
        break;
      }
      case 'ui':
        this.tone('square', 1200, 1200, t, 0.03, 0.03 * v, out);
        break;
    }
  }

  /** Continuous background layers. */
  ambience(name: Ambience, force = false): void {
    this.wantAmb = name;
    if (!this.ctx || !this.ambBus) return;
    if (!force && this.amb?.name === name) return;
    this.amb?.stop();
    this.amb = null;
    if (name === 'none') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(1, t + 2.5);
    out.connect(this.ambBus);
    const nodes: AudioScheduledSourceNode[] = [];
    const osc = (type: OscillatorType, f: number, gain: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.value = gain;
      o.connect(g).connect(out);
      o.start();
      nodes.push(o);
    };
    const noise = (freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(out);
      src.start();
      nodes.push(src);
    };
    if (name === 'hum') {
      osc('sine', 50, 0.05);
      osc('sine', 100, 0.02);
      noise(180, 0.8, 0.04, 'lowpass');
    } else if (name === 'humLit') {
      osc('sine', 50, 0.07);
      osc('sine', 100, 0.04);
      osc('triangle', 150, 0.012);
      noise(220, 0.8, 0.05, 'lowpass');
      noise(2600, 6, 0.004);
    } else if (name === 'hall') {
      osc('sine', 41, 0.07);
      osc('sine', 82, 0.025);
      noise(120, 0.6, 0.07, 'lowpass');
      noise(900, 1.2, 0.012);
    } else if (name === 'hallQuiet') {
      osc('sine', 41, 0.02);
      noise(90, 0.6, 0.02, 'lowpass');
    }
    this.amb = {
      name,
      stop: () => {
        const tt = ctx.currentTime;
        out.gain.cancelScheduledValues(tt);
        out.gain.setValueAtTime(out.gain.value, tt);
        out.gain.exponentialRampToValueAtTime(0.0001, tt + 1.2);
        for (const n of nodes) n.stop(tt + 1.3);
      },
    };
  }
}
