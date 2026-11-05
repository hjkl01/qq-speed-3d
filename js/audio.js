// WebAudio 合成音效：引擎、胎噪、风噪、氮气、撞击、倒计时
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // 噪声源
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // ---- 引擎
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 900;
    engFilter.Q.value = 1.2;
    this.engFilter = engFilter;
    this.osc = [];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sawtooth' : i === 1 ? 'square' : 'triangle';
      o.frequency.value = 60 + i * 7;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : i === 1 ? 0.22 : 0.3;
      o.connect(g).connect(engFilter);
      o.start();
      this.osc.push(o);
    }
    engFilter.connect(this.engGain).connect(this.master);

    // ---- 胎噪
    const tire = ctx.createBufferSource();
    tire.buffer = buf; tire.loop = true;
    this.tireFilter = ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 1700;
    this.tireFilter.Q.value = 0.9;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    tire.connect(this.tireFilter).connect(this.tireGain).connect(this.master);
    tire.start();

    // ---- 风噪
    const wind = ctx.createBufferSource();
    wind.buffer = buf; wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 520;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    this.ready = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  update({ speed = 0, slip = 0, throttle = 0, drifting = false, boost = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const gears = [0, 14, 27, 40, 53, 66, 90];
    const sp = Math.abs(speed);
    let gi = 0;
    while (gi < gears.length - 2 && sp > gears[gi + 1]) gi++;
    const lo = gears[gi], hi = gears[gi + 1];
    const frac = Math.min(1, (sp - lo) / (hi - lo));
    const rpm = 0.28 + frac * 0.72;
    const base = 52 + rpm * 78 + (boost > 0 ? 24 : 0);
    for (let i = 0; i < this.osc.length; i++) {
      this.osc[i].frequency.setTargetAtTime(base * (1 + i * 0.5) * (i === 2 ? 0.5 : 1), t, 0.05);
    }
    this.engFilter.frequency.setTargetAtTime(600 + rpm * 1700 + throttle * 500, t, 0.08);
    const engVol = 0.09 + throttle * 0.13 + sp / 400;
    this.engGain.gain.setTargetAtTime(engVol, t, 0.08);

    this.tireGain.gain.setTargetAtTime(
      Math.min(0.3, Math.abs(slip) * 0.75 * (drifting ? 1 : 0.4) + (drifting ? 0.05 : 0)), t, 0.05,
    );
    this.tireFilter.frequency.setTargetAtTime(1400 + Math.abs(slip) * 1600, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.13, sp / 520), t, 0.15);
  }

  _noiseBurst({ dur = 0.3, freq = 1200, q = 1, gain = 0.3, type = 'bandpass', sweepTo = null }) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  blip(freq = 880, dur = 0.12, type = 'square', gain = 0.16) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  boost(kind = 'mini') {
    if (kind === 'nitro') {
      this._noiseBurst({ dur: 0.75, freq: 380, sweepTo: 3400, gain: 0.34, q: 1.2 });
      this.blip(180, 0.5, 'sawtooth', 0.1);
    } else if (kind === 'perfect' || kind === 'double') {
      this._noiseBurst({ dur: 0.5, freq: 700, sweepTo: 4200, gain: 0.3 });
      this.blip(720, 0.18, 'triangle', 0.12);
    } else {
      this._noiseBurst({ dur: 0.3, freq: 900, sweepTo: 2600, gain: 0.2 });
    }
  }

  crash() {
    this._noiseBurst({ dur: 0.35, freq: 2400, gain: 0.34, type: 'bandpass', q: 0.6 });
    this.blip(90, 0.18, 'square', 0.12);
  }

  pad() {
    this._noiseBurst({ dur: 0.4, freq: 1500, sweepTo: 5200, gain: 0.22 });
  }

  land() {
    this._noiseBurst({ dur: 0.22, freq: 220, gain: 0.26, type: 'lowpass' });
  }
}