// 主循环：场景 / 相机 / 比赛流程 / 特效接线
import * as THREE from '../vendor/three.module.js';
import { TRACK } from './trackData.js';
import { Track } from './track.js';
import { Kart, CFG, angleDiff } from './kart.js';
import { AIDriver } from './ai.js';
import { Effects } from './effects.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { HUD, fmtTime } from './hud.js';
import { skyTexture, skyEnvTexture } from './textures.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const SKY_COLOR = 0xc3dcee;
scene.fog = new THREE.Fog(SKY_COLOR, 220, 2350);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.4, 7000);

// 天空
{
  const geo = new THREE.SphereGeometry(3400, 40, 24);
  const mat = new THREE.MeshBasicMaterial({
    map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  scene.add(sky);
}

// 光照
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
sun.position.set(-150, 105, 78);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 520;
sun.shadow.camera.left = -130;
sun.shadow.camera.right = 130;
sun.shadow.camera.top = 130;
sun.shadow.camera.bottom = -130;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.06;
scene.add(sun);
scene.add(sun.target);
// 环境反射：让金属（轮毂/护栏/排气）有反射，不至于纯黑
scene.environment = skyEnvTexture();
scene.environmentIntensity = 0.75;

const fill = new THREE.DirectionalLight(0x9ec8ff, 0.35);
fill.position.set(140, 90, -120);
scene.add(fill);

// ---------------------------------------------------------------- world
const track = new Track();
scene.add(track.group);

const effects = new Effects(scene);
const audio = new AudioEngine();
const input = new Input();

const SCHEMES = [
  { name: '你', body: 0x1c7bff, accent: 0xf2f7ff, rider: 0xffd166, uiColor: '#37e6ff', isPlayer: true },
  { name: '疾风', body: 0xff3b30, accent: 0xffe9e6, rider: 0xf2f2f2, uiColor: '#ff5f52' },
  { name: '雷影', body: 0x28d17c, accent: 0xe8fff2, rider: 0x2c2c2c, uiColor: '#3ce08c' },
  { name: '小橘', body: 0xffb020, accent: 0xfff4dd, rider: 0x8b4a00, uiColor: '#ffb020' },
];

const karts = [];
const drivers = [];
let _aiSlot = 0;
SCHEMES.forEach((s, i) => {
  const k = new Kart(track, {
    name: s.name, scheme: s, isPlayer: !!s.isPlayer, skill: 1,
  });
  k.uiColor = s.uiColor;
  k.slotIndex = s.isPlayer ? SCHEMES.length - 1 : _aiSlot++;
  scene.add(k.root);
  karts.push(k);
  drivers.push(new AIDriver(k, track, {
    skill: s.isPlayer ? 1 : [0.99, 1.02, 0.96][i % 3],
    lineBias: s.isPlayer ? 0 : [-1.4, 1.2, 0][i % 3],
  }));
});
const player = karts.find(k => k.isPlayer);
const playerDriver = drivers[karts.indexOf(player)];
let camKart = player;

const hud = new HUD(track, karts);

// ---------------------------------------------------------------- 相机
const cam = {
  mode: 0,
  yaw: 0,
  pos: new THREE.Vector3(),
  look: new THREE.Vector3(),
  fov: 62,
  shake: 0,
  orbit: 0,
  init: false,
};

function snapCamera() {
  const k = camKart;
  cam.yaw = k.th;
  cam.pos.set(k.pos.x - Math.cos(k.th) * 8.4, k.pos.y + 3.3, k.pos.z - Math.sin(k.th) * 8.4);
  cam.look.set(k.pos.x, k.pos.y + 1.4, k.pos.z);
  cam.init = true;
}

function updateCamera(dt, racing) {
  const k = camKart;
  const sp = Math.abs(k.speed);
  const spN = clamp(sp / CFG.maxSpeed, 0, 1);
  // 车头角先低通：漂移时车头会高频小幅摆动，镜头只跟它的“趋势”
  if (!cam.init || cam.thSmooth === undefined) cam.thSmooth = k.th;
  cam.thSmooth += angleDiff(cam.thSmooth, k.th) * (1 - Math.exp(-5 * dt));
  // 漂移时视线偏向行进方向；镜头再慢一档跟随，避免车头摆动带着画面甩
  const driftBlend = angleDiff(k.th, k.course);
  // 第一人称就在车头，必须紧跟；追尾视角才慢慢跟
  const fp = cam.mode === 2;
  const targetYaw = fp ? k.th : cam.thSmooth + driftBlend * (k.drifting ? 0.5 : 0.25);
  const yawStep = angleDiff(cam.yaw, targetYaw) * (1 - Math.exp(-(fp ? 16 : 2.2) * dt));
  // 再给镜头转向速度封顶，急打方向时画面不会跟着“抽”
  const cap = (fp ? 6 : 1.35) * dt;
  cam.yaw += clamp(yawStep, -cap, cap);

  let dist, height, lookAhead, lookHeight;
  if (cam.mode === 2) {
    dist = -0.2; height = 1.35; lookAhead = 26; lookHeight = 1.0;
  } else if (cam.mode === 1) {
    dist = 13 + spN * 2.6; height = 5.2 + spN * 0.8; lookAhead = 12 + spN * 8; lookHeight = 1.8;
  } else {
    dist = 8.0 + spN * 2.2; height = 3.15 + spN * 0.5; lookAhead = 10 + spN * 9; lookHeight = 1.5;
  }

  const fx = Math.cos(cam.yaw), fz = Math.sin(cam.yaw);
  const desired = new THREE.Vector3(
    k.pos.x - fx * dist,
    k.pos.y + height,
    k.pos.z - fz * dist,
  );
  // 注视方向以平滑后的镜头朝向为主，只留 18% 反映车头瞬时朝向
  const lookYaw = fp ? k.th : cam.yaw + angleDiff(cam.yaw, cam.thSmooth) * 0.15;
  const lookTarget = new THREE.Vector3(
    k.pos.x + Math.cos(lookYaw) * lookAhead,
    k.pos.y + lookHeight,
    k.pos.z + Math.sin(lookYaw) * lookAhead,
  );

  if (!cam.init) {
    cam.pos.copy(desired);
    cam.look.copy(lookTarget);
    cam.init = true;
  } else {
    const kp = cam.mode === 2 ? 1 : 1 - Math.exp(-11 * dt);
    const kl = 1 - Math.exp(-5.5 * dt);
    cam.pos.lerp(desired, kp);
    cam.look.lerp(lookTarget, kl);
  }

  // 菜单：环绕镜头
  if (!racing) {
    cam.orbit += dt * 0.28;
    const r = 17;
    cam.pos.set(
      k.pos.x + Math.cos(cam.orbit) * r,
      k.pos.y + 6.2 + Math.sin(cam.orbit * 0.7) * 1.4,
      k.pos.z + Math.sin(cam.orbit) * r,
    );
    cam.look.copy(k.pos).add(new THREE.Vector3(0, 1.1, 0));
  }

  // 抖动
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt * 2.6);
    const s = cam.shake * 0.35;
    cam.pos.x += (Math.random() - 0.5) * s;
    cam.pos.y += (Math.random() - 0.5) * s;
    cam.pos.z += (Math.random() - 0.5) * s;
  }

  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);

  const boost = k.boostTime > 0;
  const targetFov = (cam.mode === 2 ? 68 : 60) + spN * 9 + (boost ? 7 : 0);
  cam.fov = lerp(cam.fov, targetFov, 1 - Math.exp(-4 * dt));
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();

  // 阴影相机跟随
  sun.position.set(k.pos.x - 150, k.pos.y + 105, k.pos.z + 78);
  sun.target.position.copy(k.pos);
  sun.target.updateMatrixWorld();
}

// ---------------------------------------------------------------- 比赛状态
const game = {
  phase: 'menu',      // menu | countdown | racing | finished | results
  raceTime: 0,
  countdown: 0,
  lastBeep: -1,
  finishHold: 0,
  resultsShown: false,
  stats: { drifts: 0, perfect: 0, double: 0, nitro: 0, pads: 0, walls: 0, topSpeed: 0 },
  pausedPhase: null,
};

const el = {
  start: document.getElementById('startScreen'),
  pause: document.getElementById('pauseScreen'),
  result: document.getElementById('resultScreen'),
};

function resetRace() {
  karts.forEach((k) => {
    k.placeAt(track.gridSlot(k.slotIndex));
    k.rbMul = 1;
    k.maxSpeedMul = 1;
    k.events.length = 0;
  });
  game.raceTime = 0;
  game.countdown = 4.0;
  game.lastBeep = -1;
  game.finishHold = 0;
  game.resultsShown = false;
  game.stats = { drifts: 0, perfect: 0, double: 0, nitro: 0, pads: 0, walls: 0, topSpeed: 0 };
  cam.mode = 0;
  cam.init = false;
  snapCamera();
  hud.rankTimer = 0;
}

function toMenu() {
  el.result.classList.add('hidden');
  el.pause.classList.add('hidden');
  hud.hide();
  resetRace();
  game.phase = 'menu';
  el.start.classList.remove('hidden');
}

function startRace() {
  audio.init();
  audio.resume();
  resetRace();
  el.start.classList.add('hidden');
  el.result.classList.add('hidden');
  el.pause.classList.add('hidden');
  hud.show();
  game.phase = 'countdown';
  hud.countdown('3');
  audio.blip(660, 0.16, 'square', 0.14);
}

function toResults() {
  game.phase = 'results';
  game.resultsShown = true;
  const sorted = [...karts].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  const rows = sorted.map(k => ({
    name: k.name,
    me: k.isPlayer,
    time: k.finished ? fmtTime(k.finishTime) : '未完赛',
    best: fmtTime(k.bestLap),
    bestNum: k.bestLap,
  }));
  const s = game.stats;
  hud.results(rows, [
    { k: '最快圈速', v: fmtTime(player.bestLap) },
    { k: '最高速度', v: `${Math.round(s.topSpeed)} km/h` },
    { k: '漂移次数', v: s.drifts },
    { k: '完美漂移', v: s.perfect },
    { k: '双喷', v: s.double },
    { k: '氮气', v: s.nitro },
    { k: '加速带', v: s.pads },
    { k: '撞墙', v: s.walls },
    { k: '技巧分', v: Math.round(player.score) },
  ]);
  hud.hide();
  el.result.classList.remove('hidden');
  el.result.style.pointerEvents = 'auto';
}

// ---------------------------------------------------------------- 事件处理
const wheelTmp = new THREE.Vector3();
let fxTick = 0;

function handleKartEvents(k, dt) {
  for (const ev of k.events) {
    const isP = k.isPlayer;
    switch (ev.type) {
      case 'driftStart':
        if (isP) { game.stats.drifts++; audio.blip(320, 0.06, 'sawtooth', 0.08); }
        break;
      case 'mini':
        if (isP) { hud.toast('小喷!', 'small'); audio.boost('mini'); cam.shake = Math.max(cam.shake, 0.18); }
        break;
      case 'perfect':
        if (isP) {
          hud.toast('完美漂移!', 'perfect');
          game.stats.perfect++;
          audio.boost('perfect');
          cam.shake = Math.max(cam.shake, 0.35);
        }
        break;
      case 'double':
        if (isP) {
          hud.toast('双 喷!!', 'double');
          game.stats.double++;
          audio.boost('double');
          cam.shake = Math.max(cam.shake, 0.4);
        }
        break;
      case 'nitro':
        if (isP) {
          hud.toast('氮气加速', 'nitro');
          game.stats.nitro++;
          audio.boost('nitro');
          cam.shake = Math.max(cam.shake, 0.45);
        }
        break;
      case 'pad':
        if (isP) { hud.toast('加速带', 'pad', 700); game.stats.pads++; audio.pad(); }
        break;
      case 'wallHit':
        if (isP) {
          game.stats.walls++;
          audio.crash();
          cam.shake = Math.max(cam.shake, 0.55 * (0.4 + ev.data.power));
          hud.toast('撞墙 -', 'bad small', 600);
        }
        effects.burst(
          k.pos.x + Math.cos(k.th) * 1.2, k.pos.y + 0.8, k.pos.z + Math.sin(k.th) * 1.2,
          10, { speed: 7, color: [1, 0.8, 0.35], size: 0.3, life: 0.4 },
        );
        break;
      case 'land':
        if (isP) { cam.shake = Math.max(cam.shake, 0.5 * ev.data.power); audio.land(); }
        effects.burst(k.pos.x, k.pos.y + 0.25, k.pos.z, 8,
          { speed: 4.5, color: [0.85, 0.82, 0.75], size: 0.5, life: 0.5 });
        break;
      case 'lap':
        if (isP) {
          const lt = ev.data.time;
          hud.toast(`第 ${ev.data.lap} 圈  ${fmtTime(lt)}`, 'small', 1400);
          audio.blip(880, 0.1, 'triangle', 0.12);
          if (player.lap > TRACK.laps) { /* 已在 finish 处理 */ }
        } else if (k.lap > TRACK.laps && !k.finished) {
          // ignore
        }
        break;
      default:
        break;
    }
  }
  k.events.length = 0;
}

function spawnDriftFx(k) {
  const fx = Math.cos(k.th), fz = Math.sin(k.th);
  const rx = -Math.sin(k.th), rz = Math.cos(k.th);
  const slip = Math.abs(k.slip);
  if (k.drifting && k.grounded) {
    for (const side of [-1, 1]) {
      const wx = k.pos.x + fx * -1.35 + rx * (side * 0.95);
      const wz = k.pos.z + fz * -1.35 + rz * (side * 0.95);
      if (fxTick % 2 === 0) {
        effects.spawnPuff(
          wx, k.surfY + 0.16, wz,
          rx * side * 1.6 - fx * 1.2, 0.7 + Math.random(), rz * side * 1.6 - fz * 1.2,
          {
            size: 0.55 + slip * 0.9,
            life: 0.55 + slip * 0.5,
            color: k.boostTime > 0 && k.boostKind === 'nitro' ? [0.75, 0.93, 1] : [0.84, 0.85, 0.9],
          },
        );
      }
      effects.addSkid(wx, k.surfY, wz, k.th, 0.3, 0.42, k.drifting ? 0.55 : 0.28);
    }
  }
  if (k.boostTime > 0 && k.grounded) {
    const bx = k.pos.x - fx * 1.8, bz = k.pos.z - fz * 1.8;
    if (fxTick % 2 === 0) {
      effects.spawnPuff(bx, k.pos.y + 0.55, bz,
        -fx * 4, 0.5, -fz * 4,
        {
          size: k.boostKind === 'nitro' ? 0.75 : 0.5,
          life: 0.3,
          color: k.boostKind === 'nitro' ? [0.6, 0.9, 1] : [1, 0.75, 0.3],
          drag: 3,
        });
    }
  }
}

// ---------------------------------------------------------------- 主循环
let last = performance.now();
let simMode = false;
const __perf = { tick: 0, render: 0, hudMs: 0, physMs: 0 };
window.__perf = __perf;

function update(dt) {
  const nowSec = performance.now() / 1000;
  fxTick++;

  if (input.take('mute')) {
    const m = audio.toggleMute();
    hud.toast(m ? '静音' : '音效开', 'small', 700);
  }
  if (input.take('camera')) {
    cam.mode = (cam.mode + 1) % 3;
    cam.init = false;
    hud.toast(['近距视角', '远景视角', '车头视角'][cam.mode], 'small', 700);
  }

  if (game.phase === 'paused') {
    if (input.take('pause') || input.take('confirm')) resumeGame();
    return;
  }
  if (game.phase === 'menu' || game.phase === 'results') {
    if (input.take('pause') && game.phase === 'results') { toMenu(); return; }
    // 菜单里直接踩油门也能发车（按住 W 不该像按键没反应）
    if (input.take('confirm') || (game.phase === 'menu' && input.take('up'))) { startRace(); return; }
    track.update(dt, nowSec);
    updateCamera(dt, false);
    return;
  }
  if (input.take('pause')) { pauseGame(); return; }

  const racing = game.phase === 'racing' || game.phase === 'finished';

  // ---- 倒计时
  if (game.phase === 'countdown') {
    game.countdown -= dt;
    const stage = Math.ceil(game.countdown - 0.6);
    if (stage !== game.lastBeep && stage >= 0) {
      game.lastBeep = stage;
      if (stage === 0) {
        hud.countdown('GO!', true);
        audio.blip(1180, 0.4, 'square', 0.16);
        game.phase = 'racing';
        game.raceTime = 0;
        for (const k of karts) k.lapStart = 0;
        if (input.throttle) {
          player.activateBoost('start', 0.75, 1.14, 2.0);
          hud.toast('起步加速!', 'perfect', 900);
        }
      } else {
        hud.countdown(String(stage));
        audio.blip(660, 0.16, 'square', 0.14);
      }
    }
  }

  if (racing) game.raceTime += dt;
  const T0 = performance.now();

  // ---- 玩家
  if (game.phase === 'racing') {
    player.update(dt, input.state(), game.raceTime);
    if (input.take('reset')) {
      player.resetToTrack();
      hud.toast('回到赛道', 'small', 700);
    }
    if (input.nitro && player.nitro >= 0.999) player.useNitro();
  } else if (game.phase === 'finished') {
    player.update(dt, { throttle: 0.2, brake: false, steer: 0, drift: false }, game.raceTime);
  } else {
    for (const k of karts) k.syncModel(dt);
  }

  // ---- AI
  if (racing) {
    for (let i = 0; i < karts.length; i++) {
      if (karts[i].isPlayer) continue;
      drivers[i].update(dt, game.raceTime, player);
    }
  }

  // ---- 简易车车分离（防止互相穿模）
  if (racing) {
    for (let i = 0; i < karts.length; i++) {
      for (let j = i + 1; j < karts.length; j++) {
        const a = karts[i], b = karts[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 7.3 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (2.7 - d) * 0.5;
        const ux = dx / d, uz = dz / d;
        a.pos.x -= ux * push; a.pos.z -= uz * push;
        b.pos.x += ux * push; b.pos.z += uz * push;
      }
    }
  }

  // ---- 完赛判定
  if (game.phase === 'racing') {
    for (const k of karts) {
      if (!k.finished && k.lap > TRACK.laps) {
        k.finished = true;
        k.finishTime = game.raceTime;
        if (k.isPlayer) {
          game.finishHold = 3.2;
          game.phase = 'finished';
          hud.toast('完成比赛!', 'perfect', 1600);
          audio.blip(1320, 0.5, 'triangle', 0.18);
        }
      }
    }
    game.stats.topSpeed = Math.max(game.stats.topSpeed, player.speedKmh);
  }
  __perf.physMs = performance.now() - T0;

  // ---- 特效 / 音效
  for (const k of karts) {
    handleKartEvents(k);
    if (racing) spawnDriftFx(k);
  }
  if (racing) {
    audio.update({
      speed: player.speed,
      slip: player.slip,
      throttle: input.throttle ? 1 : 0,
      drifting: player.drifting,
      boost: player.boostTime,
    });
  }
  track.update(dt, nowSec);
  effects.update(dt);

  // ---- 名次
  const sorted = [...karts].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  const position = sorted.indexOf(player) + 1;

  if (game.phase === 'finished') {
    game.finishHold -= dt;
    if (game.finishHold <= 0 && !game.resultsShown) toResults();
  }

  if (!simMode) {
    hud.update(dt, {
      player,
      raceTime: game.raceTime,
      position,
      boost: player.boostTime > 0,
    });
  }
  updateCamera(dt, true);
  if (window.__camHook) window.__camHook(camera); // 调试/截图用相机钩子
}

// 自适应分辨率：连续掉帧就降 pixelRatio（只降不升，避免震荡）
let dprAcc = 0, dprN = 0, dprStep = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
  last = now;
  if (!simMode && !document.hidden) {
    dprAcc += dt; dprN++;
    if (dprAcc >= 2.5) {
      const fps = dprN / dprAcc;
      if (fps < 42 && dprStep < 2) {
        dprStep++;
        renderer.setPixelRatio(Math.max(0.8, renderer.getPixelRatio() * 0.78));
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
      dprAcc = 0; dprN = 0;
    }
  }
  const T0 = performance.now();
  update(dt);
  const T1 = performance.now();
  renderer.render(scene, camera);
  const T2 = performance.now();
  __perf.tick = __perf.tick * 0.9 + (T1 - T0) * 0.1;
  __perf.render = __perf.render * 0.9 + (T2 - T1) * 0.1;
  input.endFrame();
}

function pauseGame() {
  if (game.phase === 'paused' || game.phase === 'menu' || game.phase === 'results') return;
  game.pausedPhase = game.phase;
  game.phase = 'paused';
  el.pause.classList.remove('hidden');
  if (audio.ctx) audio.ctx.suspend();
}

function resumeGame() {
  if (game.phase !== 'paused') return;
  game.phase = game.pausedPhase || 'racing';
  el.pause.classList.add('hidden');
  if (audio.ctx) audio.ctx.resume();
  last = performance.now();
}

// ---------------------------------------------------------------- UI 绑定
document.getElementById('btnStart').addEventListener('click', startRace);
document.getElementById('btnResume').addEventListener('click', resumeGame);
document.getElementById('btnRestart').addEventListener('click', () => {
  el.pause.classList.add('hidden');
  startRace();
});
document.getElementById('btnMenu').addEventListener('click', toMenu);
document.getElementById('btnAgain').addEventListener('click', () => {
  el.result.classList.add('hidden');
  startRace();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});
// 窗口失焦（点地址栏 / 被别的窗口抢焦点）：浏览器不再补发按键事件，输入会被清空。
// 直接暂停并清空按键，避免“按住 W 却不再加速”且玩家毫无察觉
window.addEventListener('blur', () => pauseGame());

// ---------------------------------------------------------------- 启动
resetRace();
updateCamera(0.016, false);
requestAnimationFrame(frame);

// 调试 / 自动化入口：不开渲染直接推进逻辑
window.__race = {
  game, karts, player, track, cam, camera, scene, drivers, hud, effects, input,
  renderer, sun, hemi, THREE,
  update,
  step(seconds, hz = 60) {
    simMode = true;
    const n = Math.round(seconds * hz);
    for (let i = 0; i < n; i++) {
      update(1 / hz);
      input.endFrame();
    }
    simMode = false;
  },
  startRace, toResults, toMenu,
};
