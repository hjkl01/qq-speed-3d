// 程序化卡丁车模型（车头朝 +X，y=0 为地面）
import * as THREE from '../vendor/three.module.js';

const WHEEL_F = { r: 0.40, w: 0.30 };
const WHEEL_R = { r: 0.50, w: 0.44 };

// 接触阴影（径向渐变贴图）
let _blobTex = null;
function blobTexture() {
  if (_blobTex) return _blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  _blobTex = new THREE.CanvasTexture(c);
  return _blobTex;
}

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function createKartModel(scheme = {}) {
  const {
    body = 0x1c7bff, accent = 0xf2f7ff, dark = 0x22262e, rider = 0xffd166,
  } = scheme;

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();   // 车身俯仰/侧倾
  root.add(bodyGroup);

  const matBody = new THREE.MeshStandardMaterial({ color: body, roughness: 0.3, metalness: 0.55 });
  const matAccent = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.38, metalness: 0.35 });
  const matDark = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.6, metalness: 0.4 });
  const matChrome = new THREE.MeshStandardMaterial({ color: 0xdfe8f2, roughness: 0.3, metalness: 0.75 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x9fe0ff, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.5 });
  const matRider = new THREE.MeshStandardMaterial({ color: rider, roughness: 0.55, metalness: 0.05 });
  const matTire = new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.88, metalness: 0.05 });
  const matBrake = new THREE.MeshStandardMaterial({ color: 0xff2f22, emissive: 0xff2a1a, emissiveIntensity: 1.4, roughness: 0.4 });
  const matGlow = new THREE.MeshBasicMaterial({ color: body, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });

  // ---- 接触阴影
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(3.7, 2.5),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.9 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  blob.renderOrder = 2;
  root.add(blob);

  // ---- 底盘 / 车身
  box(2.95, 0.14, 0.88, matDark, 0.05, 0.25, 0, bodyGroup);          // 底盘板
  box(2.0, 0.34, 0.84, matBody, 0.12, 0.48, 0, bodyGroup);           // 主车身
  const nose = box(1.0, 0.26, 0.64, matBody, 1.42, 0.44, 0, bodyGroup);
  nose.rotation.z = -0.09;
  box(0.26, 0.2, 0.5, matAccent, 1.86, 0.36, 0, bodyGroup);          // 车鼻尖
  box(0.34, 0.07, 1.32, matAccent, 1.98, 0.24, 0, bodyGroup);        // 前翼
  for (const sgn of [-1, 1]) box(0.3, 0.16, 0.05, matBody, 1.98, 0.3, sgn * 0.66, bodyGroup); // 前翼端板

  // 侧箱（放在前轮内侧，避免穿插）
  for (const sgn of [-1, 1]) {
    box(1.15, 0.32, 0.26, matAccent, -0.08, 0.46, sgn * 0.55, bodyGroup);
    const strip = box(1.1, 0.045, 0.05, matGlow, -0.08, 0.62, sgn * 0.585, bodyGroup);
    strip.castShadow = false;
  }

  // ---- 座舱 / 座椅
  box(0.62, 0.34, 0.66, matDark, -0.46, 0.66, 0, bodyGroup);          // 座椅
  box(0.13, 0.46, 0.66, matDark, -0.76, 0.86, 0, bodyGroup);          // 靠背
  box(0.16, 0.06, 0.6, matAccent, -0.76, 1.09, 0, bodyGroup);         // 头枕
  const screen = box(0.1, 0.3, 0.62, matGlass, 0.62, 0.78, 0, bodyGroup);
  screen.rotation.z = 0.45;
  screen.castShadow = false;

  // ---- 车手
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.28, 4, 10), matRider);
  torso.position.set(-0.5, 0.92, 0);
  torso.rotation.z = -0.16;
  torso.castShadow = true;
  bodyGroup.add(torso);
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.36, 3, 10), matRider);
  shoulders.rotation.x = Math.PI / 2;
  shoulders.position.set(-0.48, 1.09, 0);
  shoulders.castShadow = true;
  bodyGroup.add(shoulders);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.215, 18, 14), matAccent);
  head.position.set(-0.42, 1.28, 0);
  head.castShadow = true;
  bodyGroup.add(head);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.218, 18, 14, -0.9, 1.8, 0.85, 0.85), matDark);
  visor.position.copy(head.position);
  bodyGroup.add(visor);
  box(0.3, 0.1, 0.44, matAccent, -0.38, 1.12, 0, bodyGroup);          // 头盔下沿
  // 手臂 → 方向盘
  for (const sgn of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.4, 3, 8), matRider);
    arm.position.set(-0.06, 0.95, sgn * 0.2);
    arm.rotation.z = -1.15;
    arm.rotation.x = sgn * 0.32;
    arm.castShadow = true;
    bodyGroup.add(arm);
  }
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.033, 8, 16), matDark);
  steering.position.set(0.3, 0.95, 0);
  steering.rotation.y = Math.PI / 2;
  steering.rotation.z = 0.32;
  bodyGroup.add(steering);
  box(0.06, 0.06, 0.4, matDark, 0.36, 0.94, 0, bodyGroup);            // 转向柱

  // ---- 尾翼
  for (const sgn of [-1, 1]) box(0.11, 0.4, 0.11, matBody, -1.36, 1.04, sgn * 0.44, bodyGroup);
  const rearWing = box(0.46, 0.07, 1.3, matAccent, -1.4, 1.26, 0, bodyGroup);
  rearWing.rotation.z = -0.12;
  for (const sgn of [-1, 1]) box(0.46, 0.24, 0.045, matBody, -1.4, 1.18, sgn * 0.66, bodyGroup);

  // ---- 引擎 / 排气 / 尾灯
  box(0.62, 0.34, 0.56, matDark, -1.0, 0.7, 0, bodyGroup);
  for (const sgn of [-1, 1]) box(0.5, 0.05, 0.05, matChrome, -1.0, 0.88, sgn * 0.16, bodyGroup);
  const exhausts = [];
  for (const sgn of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.42, 12, 1, true), matChrome);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-1.5, 0.62, sgn * 0.3);
    pipe.castShadow = true;
    bodyGroup.add(pipe);
    exhausts.push(pipe);
    box(0.05, 0.13, 0.27, matBrake, -1.66, 0.76, sgn * 0.3, bodyGroup).castShadow = false;
  }

  // ---- 车底光
  const under = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.7), matGlow);
  under.rotation.x = -Math.PI / 2;
  under.position.y = 0.075;
  under.renderOrder = 1;
  under.castShadow = false;
  bodyGroup.add(under);

  // ---- 车轮（后轮更大更宽）
  const makeWheel = (spec) => {
    const pivot = new THREE.Group();
    pivot.position.set(spec.x, spec.r, spec.z);
    const spin = new THREE.Group();
    const tread = new THREE.CylinderGeometry(spec.r, spec.r, spec.w, 20, 1, true);
    tread.rotateX(Math.PI / 2);
    const tire = new THREE.Mesh(tread, matTire);
    tire.castShadow = true;
    spin.add(tire);
    const side = new THREE.Mesh(new THREE.TorusGeometry(spec.r * 0.94, 0.035, 6, 20), matTire);
    for (const sgn of [-1, 1]) {
      const t = side.clone();
      t.position.z = sgn * spec.w * 0.5;
      spin.add(t);
    }
    const rimGeo = new THREE.CylinderGeometry(spec.r * 0.66, spec.r * 0.66, spec.w * 0.94, 14);
    rimGeo.rotateX(Math.PI / 2);
    spin.add(new THREE.Mesh(rimGeo, matChrome));
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(spec.r * 1.16, 0.075, spec.w * 0.58), matAccent);
      spoke.rotation.z = (i / 5) * Math.PI;
      spin.add(spoke);
    }
    pivot.add(spin);
    root.add(pivot);
    return { pivot, spin, front: spec.front };
  };
  const wheels = [
    makeWheel({ x: 1.22, r: WHEEL_F.r, w: WHEEL_F.w, z: -0.85, front: true }),
    makeWheel({ x: 1.22, r: WHEEL_F.r, w: WHEEL_F.w, z: 0.85, front: true }),
    makeWheel({ x: -1.16, r: WHEEL_R.r, w: WHEEL_R.w, z: -0.9, front: false }),
    makeWheel({ x: -1.16, r: WHEEL_R.r, w: WHEEL_R.w, z: 0.9, front: false }),
  ];

  // ---- 氮气尾焰
  const flames = exhausts.map((pipe) => {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 1.6, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x62e6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    f.rotation.z = Math.PI / 2;
    f.position.set(pipe.position.x - 0.9, pipe.position.y, pipe.position.z);
    f.visible = false;
    bodyGroup.add(f);
    return f;
  });

  return {
    root, bodyGroup, wheels, flames, exhausts, wheelR: WHEEL_R.r,
    mats: { body: matBody, accent: matAccent, glow: matGlow },
  };
}