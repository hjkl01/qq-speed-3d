// AI 车手：纯追踪循迹 + 弯前减速 + 内线 + 橡皮筋 + 脱困
import { angleDiff } from './kart.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export class AIDriver {
  constructor(kart, track, { skill = 1, lineBias = 0 } = {}) {
    this.kart = kart;
    this.track = track;
    this.skill = skill;
    this.lineBias = lineBias;
    this.noiseT = 0;
    this.noiseVal = 0;
    this.wobble = 0;
    this.wobbleT = 0;
    this.stuckT = 0;
    this.reverseT = 0;
    this.dbg = null;
  }

  inputs(dt, time, player) {
    const k = this.kart, tr = this.track;
    const sp = Math.abs(k.speed);

    // ---- 脱困：撞墙/卡住 → 倒车
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      k.update(dt, { throttle: false, brake: true, steer: 0, drift: false }, time);
      return null;
    }
    if (sp < 3.2) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 1.5);
    if (this.stuckT > 1.4) {
      this.stuckT = 0;
      this.reverseT = 1.0 + Math.random() * 0.5;
      k.update(dt, { throttle: false, brake: true, steer: 0, drift: false }, time);
      return null;
    }

    if (k.finished) return { throttle: 0.3, brake: false, steer: 0, drift: false };

    const q = tr.query(k.pos.x, k.pos.z, k.hint);
    const half = q.half;

    // ---- 前方曲率（用于减速与前视）
    const look = 11 + sp * 0.62;
    let maxCurv = 0;
    for (let i = 0; i < 8; i++) {
      const p = tr.at(q.s + look * (0.4 + i * 0.36));
      if (Math.abs(p.curv) > Math.abs(maxCurv)) maxCurv = p.curv;
    }

    // ---- 目标点：中心线 + 内线偏移
    const tex = tr.at(q.s + look);
    const apex = clamp(maxCurv * 190, -1, 1) * (half - 5.5);
    let lateral = clamp(apex + this.lineBias, -(half - 3.4), half - 3.4);
    if (Math.abs(q.offset) > half - 3.0) {
      // 太靠边：先回中线
      lateral = lerp(lateral, 0, 0.7);
    }
    const tx = tex.x - Math.sin(tex.th) * lateral;
    const tz = tex.z + Math.cos(tex.th) * lateral;

    // ---- 随机抖动（让 AI 不那么完美）
    this.noiseT -= dt;
    if (this.noiseT <= 0) {
      this.noiseT = 0.8 + Math.random() * 1.8;
      this.noiseVal = (Math.random() - 0.5) * (1.4 - this.skill) * 0.16;
    }
    this.wobbleT -= dt;
    if (this.wobbleT <= 0) {
      this.wobbleT = 3.5 + Math.random() * 5;
      this.wobble = (Math.random() - 0.5) * (1.3 - this.skill) * 0.22;
    }

    const dx = tx - k.pos.x, dz = tz - k.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    let err = angleDiff(k.th, Math.atan2(dz, dx)) + this.noiseVal + this.wobble;

    // ---- 纯追踪转向：由需要的角速度反解方向盘
    const kappa = (2 * Math.sin(clamp(err, -1.4, 1.4))) / Math.max(7, dist);
    const omega = clamp(sp * kappa, -2.6, 2.6);
    const turnRate = lerp(2.55, 1.28, clamp(sp / 60, 0, 1));
    let steer = clamp(omega / turnRate * this.skill, -1, 1);
    if (sp < 2.2) steer = clamp(err * 1.6, -1, 1);

    // ---- 目标速度
    const absCurv = Math.max(1 / 900, Math.abs(maxCurv));
    const vTarget = Math.min(Math.sqrt(27 * this.skill / absCurv), 66 * k.maxSpeedMul * k.rbMul);
    const brake = sp > vTarget * 1.04 && sp > 9;
    const throttle = !brake && sp < vTarget * 1.02;

    // ---- 漂移
    const wantDrift = Math.abs(maxCurv) > 1 / 70 && sp > 32 && Math.abs(err) > 0.05;
    if (k.drifting) {
      if (!wantDrift) steer = 0;
      else steer = Math.sign(err) === k.driftDir ? 1 : -0.55;
    }

    // ---- 氮气
    if (k.nitro > 0.8 && Math.abs(maxCurv) < 1 / 300) k.useNitro();

    // ---- 橡皮筋
    if (player && !player.finished) {
      const gap = player.progress - k.progress;
      k.rbMul = gap > 130 ? 1.06 : gap < -220 ? 0.95 : 1;
    }

    this.dbg = { err, steer, throttle, brake, maxCurv, vTarget, look, sp, lat: lateral, off: q.offset };
    return { throttle, brake, steer, drift: wantDrift };
  }

  update(dt, time, player) {
    const inp = this.inputs(dt, time, player);
    // 倒车/脱离状态由 inputs 里返回 null 表示已接管
    if (!inp) return;
    this.kart.update(dt, inp, time);
  }
}