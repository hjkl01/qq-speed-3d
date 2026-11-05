// 卡丁车物理：街机式漂移、集气、小喷 / 双喷 / 氮气
import * as THREE from '../vendor/three.module.js';
import { createKartModel } from './kartModel.js';

export const CFG = {
  maxSpeed: 66,          // m/s ≈ 238 km/h
  engine: 30,
  brake: 42,
  coast: 2.4,
  gripNormal: 8.2,
  gripDrift: 3.0,
  steerLow: 2.55,        // rad/s
  steerHigh: 1.28,
  steerRamp: 0.32,       // s，键盘是开关量：给转向输入一个爬升时间，轻点方向键只微调车头
  driftYaw: 0.85,        // 漂移基础角速度
  driftYawSteer: 0.75,
  maxSlip: 0.70,
  wallLimitPad: 0.85,
  gravity: 26,
  nitroMax: 1,
  miniTurbo: { len: 0.34, mul: 1.15 },
  perfectTurbo: { len: 0.62, mul: 1.22 },
  doubleTurbo: { len: 0.42, mul: 1.18 },
  nitroBoost: { mul: 1.31 },
};

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Kart {
  constructor(track, { name = 'PLAYER', scheme, isPlayer = false, skill = 1 } = {}) {
    this.track = track;
    this.name = name;
    this.isPlayer = isPlayer;
    this.skill = skill;
    this.model = createKartModel(scheme);
    this.root = this.model.root;
    this.pos = new THREE.Vector3();
    this.th = 0;
    this.course = 0;
    this.speed = 0;
    this.vy = 0;
    this.steer = 0;
    this.slip = 0;
    this.drifting = false;
    this.driftDir = 0;
    this.driftTime = 0;
    this.driftEnergy = 0;
    this.nitro = 0;
    this.boostTime = 0;
    this.boostMul = 1;
    this.boostKind = '';
    this.airborne = false;
    this.grounded = true;
    this.hint = -1;
    this.lap = 1;
    this.sPrev = 0;
    this.progress = 0;
    this.lapDist = 0;
    this.finished = false;
    this.finishTime = 0;
    this.bestLap = Infinity;
    this.lapStart = 0;
    this.lapTimes = [];
    this.score = 0;
    this.hitFlash = 0;
    this.lastMiniTime = -10;
    this.pendingDouble = false;
    this.wheelSpin = 0;
    this.roll = 0;
    this.pitch = 0;
    this.events = [];
    this.maxSpeedMul = 1;
    this.rbMul = 1;          // 橡皮筋
    this.touchBoostPad = false;
    this.padCooldown = 0;
  }

  emit(type, data = {}) {
    this.events.push({ type, data });
  }

  placeAt(slot) {
    this.pos.set(slot.x, slot.y, slot.z);
    this.th = slot.th;
    this.course = slot.th;
    this.speed = 0;
    this.vy = 0;
    this.hint = -1;
    this.sPrev = slot.s;
    this.lastSurf = undefined;
    // 起跑格在终点线之前：用累计里程计圈，progress 为负表示尚未过线
    let d = slot.s - this.track.startS * this.track.total;
    const total = this.track.total;
    if (d > total / 2) d -= total;
    else if (d < -total / 2) d += total;
    this.lapDist = d;
    this.progress = d;
    this.lap = 1;
    this.lapStart = 0;
    this.bestLap = Infinity;
    this.lapTimes = [];
    this.finished = false;
    this.nitro = 0;
    this.driftEnergy = 0;
    this.boostTime = 0;
    this.boostMul = 1;
    this.syncModel(0);
  }

  resetToTrack() {
    const q = this.track.query(this.pos.x, this.pos.z, this.hint);
    this.pos.set(q.x ?? this.pos.x, q.y + 0.6, q.z ?? this.pos.z);
    const p = this.track.at(q.s);
    this.th = p.th;
    this.course = p.th;
    this.pos.x = p.x;
    this.pos.z = p.z;
    this.pos.y = p.y + 0.6;
    this.speed = 0;
    this.vy = 0;
    this.drifting = false;
    this.driftEnergy = 0;
    this.boostTime = 0;
    this.boostMul = 1;
    this.hint = -1;
    this.lastSurf = undefined;
  }

  get speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  get maxSpeed() {
    return CFG.maxSpeed * this.maxSpeedMul * this.rbMul * this.boostMul;
  }

  activateBoost(kind, seconds, mul, kick = 0) {
    this.boostTime = Math.max(this.boostTime, seconds);
    this.boostMul = Math.max(this.boostMul, mul);
    this.boostKind = kind;
    if (kick > 0) {
      this.speed = Math.min(this.maxSpeed, Math.max(this.speed, this.speed + kick));
    }
  }

  // ---------------------------------------------------------------- 漂移
  _enterDrift(dir) {
    this.drifting = true;
    this.driftDir = dir;
    this.driftTime = 0;
    this.driftEnergy = 0;
    // 双喷：小喷后短时间再打漂
    this.pendingDouble = this.isPlayer && (this.now - this.lastMiniTime) < 0.5;
    this.emit('driftStart', { dir });
  }

  _exitDrift() {
    const e = this.driftEnergy;
    this.drifting = false;
    this.driftDir = 0;
    const now = this.now;
    if (e > 0.42) {
      // 小喷 / 完美漂移
      const perfect = e >= 1.28;
      if (this.pendingDouble) {
        this.activateBoost('double', CFG.doubleTurbo.len, CFG.doubleTurbo.mul, 3.0);
        this.emit('double', { energy: e });
        this.score += 260;
      } else if (perfect) {
        this.activateBoost('perfect', CFG.perfectTurbo.len, CFG.perfectTurbo.mul, 2.4);
        this.emit('perfect', { energy: e });
        this.score += 180;
      } else {
        this.activateBoost('mini', CFG.miniTurbo.len, CFG.miniTurbo.mul, 1.6);
        this.emit('mini', { energy: e });
        this.score += 60;
      }
      this.lastMiniTime = now;
      // 完美/双喷额外补气
      this.nitro = clamp(this.nitro + (perfect ? 0.16 : 0.06), 0, CFG.nitroMax);
    } else if (e > 0.12) {
      this.emit('driftEndWeak', { energy: e });
    }
    this.driftEnergy = 0;
    this.pendingDouble = false;
    this.emit('driftEnd', { energy: e });
  }

  useNitro() {
    if (this.nitro < 0.22 || this.boostKind === 'nitro' && this.boostTime > 0) return false;
    const power = this.nitro;
    this.nitro = 0;
    this.activateBoost('nitro', 0.9 + 1.7 * power, 1 + 0.13 * power + 0.16);
    this.speed += 3.2 + 4 * power;
    this.emit('nitro', { power });
    return true;
  }

  // ---------------------------------------------------------------- 每帧
  update(dt, input, time) {
    this.now = time;
    dt = Math.min(dt, 1 / 30);
    const track = this.track;

    const throttle = input.throttle ? 1 : 0;
    const brake = input.brake ? 1 : 0;
    const steerIn = clamp(input.steer ?? 0, -1, 1);
    this.steer = lerp(this.steer, steerIn, 1 - Math.exp(-dt / CFG.steerRamp));

    // 计时器
    if (this.boostTime > 0) {
      this.boostTime -= dt;
      if (this.boostTime <= 0) { this.boostTime = 0; this.boostMul = 1; this.boostKind = ''; }
    }
    if (this.padCooldown > 0) this.padCooldown -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    const sp = this.speed;
    const asp = Math.abs(sp);
    const speedFactor = clamp(asp / CFG.maxSpeed, 0, 1);
    const grounded = !this.airborne;

    // ---- 转向 / 漂移姿态
    if (this.drifting) {
      this.driftTime += dt;
      const along = steerIn * this.driftDir;            // >0 内打，<0 反打
      let rate = this.driftDir * (CFG.driftYaw + CFG.driftYawSteer * Math.max(0, along))
        * (0.55 + 0.45 * speedFactor);
      if (along < 0) rate *= 1 + along * 0.55;           // 反打收窄
      // 限制滑移角
      this.th += rate * (grounded ? 1 : 0.55) * dt;
    } else {
      const turn = lerp(CFG.steerLow, CFG.steerHigh, speedFactor);
      const gripTurn = Math.min(1, asp / 5) * (sp < 0 ? -1 : 1);
      this.th += this.steer * turn * gripTurn * dt;   // 用平滑后的 steer：轻点方向键只微调车头
    }

    // ---- 抓地：速度方向追随车头
    const slip = angleDiff(this.th, this.course);
    this.slip = slip;
    // 漂移时滑移角越大越抓地，自动收敛到稳定漂移角（约 0.4 rad），不会一路打转
    const slipRatio = Math.abs(slip) / CFG.maxSlip;
    const grip = this.drifting
      ? CFG.gripDrift * (1 + Math.max(0, slipRatio - 0.62) * 4.5)
      : CFG.gripNormal;
    if (asp > 0.5) {
      // 速度方向向车头收敛（slip = course - th，故用减号）
      this.course -= slip * Math.min(1, grip * dt);
    } else {
      this.course = this.th;
    }

    // ---- 纵向速度
    const maxS = this.maxSpeed;
    if (throttle && !brake) {
      const a = CFG.engine * (1 - clamp(asp / maxS, 0, 1) ** 1.5);
      this.speed += a * dt;
      if (this.drifting) this.speed -= 0.8 * dt;
    } else if (brake) {
      if (this.speed > 0.4) this.speed -= CFG.brake * dt;
      else this.speed = Math.max(-11, this.speed - 14 * dt);
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(asp, CFG.coast * dt + asp * 0.25 * dt);
    }
    // 漂移横向摩擦损耗
    if (this.drifting) {
      this.speed -= (0.9 + 3.4 * Math.abs(slip)) * dt;
    }
    // 超速回收（喷结束）
    if (asp > maxS) this.speed -= Math.sign(this.speed) * Math.min(asp - maxS, 22 * dt);
    this.speed = clamp(this.speed, -12, 120);

    // ---- 漂移进出
    const wantDrift = !!input.drift;
    if (!this.drifting && wantDrift && asp > 13 && Math.abs(steerIn) > 0.15) {
      this._enterDrift(Math.sign(steerIn));
    } else if (this.drifting && (!wantDrift || asp < 7)) {
      this._exitDrift();
    }

    // ---- 集气
    if (this.drifting) {
      const quality = clamp(Math.abs(slip) / 0.62, 0, 1);
      const gain = (0.55 + 1.05 * quality) * (0.55 + 0.45 * speedFactor);
      this.driftEnergy = Math.min(2.0, this.driftEnergy + gain * dt);
      this.nitro = Math.min(CFG.nitroMax, this.nitro + (0.028 + 0.085 * quality) * (0.5 + 0.5 * speedFactor) * dt);
      if (this.isPlayer) this.score += quality * 26 * dt * (1 + this.nitro);
    }

    // ---- 位移
    const vx = Math.cos(this.course) * this.speed;
    const vz = Math.sin(this.course) * this.speed;
    let nx = this.pos.x + vx * dt;
    let nz = this.pos.z + vz * dt;

    // ---- 赛道查询 / 护栏
    const q = track.query(nx, nz, this.hint);
    this.hint = q.idx;
    this.trackQ = q;
    this.offset = q.offset;
    const limit = q.half + CFG.wallLimitPad;
    if (Math.abs(q.offset) > limit) {
      const over = Math.abs(q.offset) - limit;
      const sgn = Math.sign(q.offset);
      nx -= q.rightx * sgn * over;
      nz -= q.rightz * sgn * over;
      // 反弹
      const vn = vx * q.rightx * sgn + vz * q.rightz * sgn;
      let rvx = vx, rvz = vz;
      if (vn > 0) {
        rvx -= 1.5 * vn * q.rightx * sgn;
        rvz -= 1.5 * vn * q.rightz * sgn;
      }
      const mag = Math.hypot(rvx, rvz);
      // 贴墙摩擦按撞角给固定减速度（与帧率无关）：擦墙几乎不掉速，正面顶墙才重罚
      const head = clamp(vn / Math.max(asp, 1), 0, 1);
      this.speed = Math.sign(this.speed) * Math.max(0, mag - (12 + 24 * head) * dt);
      if (mag > 0.4) this.course = Math.atan2(rvz, rvx);
      // 车身被墙推正：否则车头一直斜插在墙里，抓地力每帧把速度方向压回墙内，
      // 油门再大也顶不过撞墙减速，看起来像“W 失效”
      this.th += angleDiff(this.th, this.course) * Math.min(1, 6 * dt);
      if (vn > 2.5 && this.hitFlash <= 0) {
        this.hitFlash = 0.35;
        this.emit('wallHit', { power: Math.min(1, vn / 26) });
        this.speed *= 0.94;
      }
    }
    this.pos.x = nx;
    this.pos.z = nz;

    // ---- 加速带
    if (this.padCooldown <= 0) {
      const pad = track.padAt(q.s, q.offset);
      if (pad) {
        this.padCooldown = 0.55;
        this.activateBoost('pad', 0.9, 1.2, 4.5);
        this.emit('pad', {});
      }
    }

    // ---- 垂直（坡道 / 腾空）
    const surf = q.y - (q.offset * Math.tan(q.bank));
    this.surfY = surf;
    const surfRate = this.lastSurf === undefined
      ? 0 : clamp((surf - this.lastSurf) / Math.max(dt, 1e-3), -40, 40);
    this.lastSurf = surf;
    if (this.airborne) {
      this.vy -= CFG.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= surf) {
        this.pos.y = surf;
        const hitPower = Math.min(1, Math.abs(this.vy) / 20);
        this.vy = surfRate;
        this.airborne = false;
        this.emit('land', { power: hitPower });
      }
    } else if (this.pos.y - surf > 0.14) {
      // 地面掉落太快 → 腾空
      this.airborne = true;
      this.vy = Math.min(0, surfRate);
    } else {
      this.pos.y = surf;
      this.vy = surfRate;
    }
    this.grounded = !this.airborne;

    // ---- 圈数 / 进度
    const total = track.total;
    let ds = q.s - this.sPrev;
    if (ds > total * 0.5) ds -= total;
    else if (ds < -total * 0.5) ds += total;
    this.lapDist += ds;
    if (this.lapDist >= total) {
      this.lapDist -= total;
      this.lap += 1;
      const lt = time - this.lapStart;
      if (lt > 5) {
        this.lapTimes.push(lt);
        if (lt < this.bestLap) this.bestLap = lt;
        this.emit('lap', { lap: this.lap - 1, time: lt });
      }
      this.lapStart = time;
    }
    this.sPrev = q.s;
    this.progress = (this.lap - 1) * total + this.lapDist;

    this.syncModel(dt);
  }

  // 视觉同步
  syncModel(dt) {
    const m = this.model;
    this.root.position.copy(this.pos);
    this.root.rotation.y = -this.th;
    // 车身姿态：坡度 + 侧倾 + 漂移压车
    const lean = clamp(-this.slip * 0.34, -0.22, 0.22);
    const targetRoll = lean * (this.drifting ? 1 : 0.5);
    this.roll = lerp(this.roll, targetRoll, 1 - Math.pow(0.0015, dt || 1));
    this.pitch = lerp(this.pitch, this.airborne ? -0.12 : 0, 1 - Math.pow(0.01, dt || 1));
    m.bodyGroup.rotation.x = this.roll;
    m.bodyGroup.rotation.z = this.pitch;
    // 车轮
    const wheelR = m.wheelR || 0.44;
    this.wheelSpin += (this.speed * (dt || 0)) / wheelR;
    for (const w of m.wheels) {
      w.spin.rotation.z = -this.wheelSpin;
      if (w.front) w.pivot.rotation.y = this.steer * 0.42;
    }
    // 尾焰
    const boosting = this.boostTime > 0;
    for (const f of m.flames) {
      f.visible = boosting;
      if (boosting) {
        const s = 0.7 + Math.random() * 0.5 + (this.boostKind === 'nitro' ? 0.7 : 0);
        f.scale.set(0.8 + s * 0.4, 0.6 + s, 0.8 + s * 0.4);
        f.material.opacity = 0.55 + Math.random() * 0.4;
        f.material.color.setHex(this.boostKind === 'nitro' ? 0x7fe3ff : 0xffb347);
      }
    }
    // 氮气时车身发光
    m.mats.glow.opacity = boosting ? 0.9 : 0.4;
    m.mats.glow.color.setHex(this.boostKind === 'nitro' ? 0x64e9ff : 0x3aa0ff);
  }

  sampleWheelWorld(i, out = new THREE.Vector3()) {
    const w = this.model.wheels[i];
    return out.setFromMatrixPosition(w.pivot.matrixWorld);
  }
}