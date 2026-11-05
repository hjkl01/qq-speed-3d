// 赛道：中心线采样 / 路面几何 / 护栏 / 加速带 / 场景装饰 / 碰撞查询
import * as THREE from '../vendor/three.module.js';
import OPS from './trackOps.js';
import { TRACK } from './trackData.js';
import { buildCenterline } from './centerline.js';
import * as TX from './textures.js';

const ROAD_TEX_V = 12;   // 路面贴图纵向重复长度(m)
const KERB_TEX_V = 3;

function smooth(arr, radius, passes = 2) {
  const n = arr.length;
  let cur = arr.slice();
  for (let p = 0; p < passes; p++) {
    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += cur[(i + k + n) % n];
        cnt++;
      }
      next[i] = sum / cnt;
    }
    cur = next;
  }
  return cur;
}

export class Track {
  constructor() {
    const cl = buildCenterline(OPS, 2);
    this.total = cl.total;
    this.pts = cl.pts;
    this.n = this.pts.length;
    this.width = TRACK.width;
    this.half = this.width / 2;
    this.startS = TRACK.startS;
    this.laps = TRACK.laps;

    // 高程 / 曲率平滑（让坡道与倾斜更自然）
    const ys = smooth(this.pts.map(p => p.y), 6, 2);
    const cs = smooth(this.pts.map(p => p.curv), 5, 2);
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i];
      p.y = ys[i];
      p.curv = cs[i];
      p.th = ((p.th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      p.dirx = Math.cos(p.th);
      p.dirz = Math.sin(p.th);
      p.rightx = -Math.sin(p.th);
      p.rightz = Math.cos(p.th);
      p.bank = THREE.MathUtils.clamp(p.curv * 170, -0.15, 0.15);
    }

    this.group = new THREE.Group();
    this.group.name = 'track';
    this._build();
  }

  // ---------- 查询 ----------
  nearestIndex(x, z, hint = -1) {
    const n = this.n, pts = this.pts;
    let best = -1, bestD = Infinity;
    if (hint >= 0) {
      for (let k = -50; k <= 50; k++) {
        const i = (hint + k + n) % n;
        const p = pts[i];
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (bestD < 900) return best;
    }
    for (let i = 0; i < n; i += 2) {
      const p = pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // 返回最近点信息：s / 横向偏移 / 路面高度 / 朝向 / 曲率
  query(x, z, hint = -1) {
    const idx = this.nearestIndex(x, z, hint);
    const n = this.n, pts = this.pts;
    const p = pts[idx];
    const a = pts[(idx - 1 + n) % n], b = pts[(idx + 1) % n];
    const tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    const dx = x - p.x, dz = z - p.z;
    const along = (dx * tx + dz * tz) / tl;
    const offset = dx * p.rightx + dz * p.rightz;
    const S = this.total;
    const s = ((p.s + along) % S + S) % S;
    const y = p.y - offset * Math.tan(p.bank);
    return {
      idx, s, offset, y,
      th: p.th, curv: p.curv, bank: p.bank,
      dirx: tx / tl, dirz: tz / tl,
      rightx: p.rightx, rightz: p.rightz,
      half: this.half,
    };
  }

  // 采样点（按里程）
  at(s) {
    const S = this.total;
    s = ((s % S) + S) % S;
    const n = this.n;
    const idx = Math.min(n - 1, Math.max(0, Math.floor((s / S) * n)));
    const p = this.pts[idx];
    const q = this.pts[(idx + 1) % n];
    const span = (q.s > p.s ? q.s - p.s : S - p.s + q.s) || 1e-3;
    const t = Math.min(1, Math.max(0, (s - p.s) / span));
    let dth = q.th - p.th;
    if (dth > Math.PI) dth -= Math.PI * 2;
    if (dth < -Math.PI) dth += Math.PI * 2;
    return {
      x: p.x + (q.x - p.x) * t,
      y: p.y + (q.y - p.y) * t,
      z: p.z + (q.z - p.z) * t,
      th: p.th + dth * t,
      curv: p.curv + (q.curv - p.curv) * t,
      bank: p.bank + (q.bank - p.bank) * t,
    };
  }

  surface(x, z, hint) {
    return this.query(x, z, hint).y;
  }

  // 是否压在加速带上
  padAt(s, offset) {
    for (const pad of this.pads) {
      const ps = pad.s * this.total;
      let ds = Math.abs(s - ps);
      if (ds > this.total / 2) ds = this.total - ds;
      if (ds < pad.len / 2 && Math.abs(offset - pad.offset) < 4.2) return pad;
    }
    return null;
  }

  // 起跑格位置
  gridSlot(i) {
    const P = TRACK.grid;
    const startS = TRACK.startS * this.total;
    const row = Math.floor(i / 2), col = i % 2;
    const s = startS - 6 - row * P.rowGap;
    const lat = (col === 0 ? -1 : 1) * P.latGap;
    const q = this.at(s);
    const rx = -Math.sin(q.th), rz = Math.cos(q.th);
    return {
      x: q.x + rx * lat,
      z: q.z + rz * lat,
      y: q.y - lat * Math.tan(q.bank),
      th: q.th,
      s,
    };
  }

  // ---------- 几何 ----------
  _strip(offsetA, offsetB, yA, yB, vScale, material, opts = {}) {
    const n = this.n, pts = this.pts;
    const pos = [], uv = [], idx = [];
    const step = opts.step || 1;
    let count = 0;
    const sMap = [];
    for (let i = 0; i < n; i += step) sMap.push({ i, sOff: 0 });
    // 闭合：追加起点，消除接缝
    sMap.push({ i: 0, sOff: this.total });
    for (let k = 0; k < sMap.length; k++) {
      const { i, sOff } = sMap[k];
      const p = pts[i];
      const tanB = Math.tan(p.bank);
      const oa = typeof offsetA === 'function' ? offsetA(p, i) : offsetA;
      const ob = typeof offsetB === 'function' ? offsetB(p, i) : offsetB;
      const ya = p.y - oa * tanB + (typeof yA === 'function' ? yA(p, i) : yA);
      const yb = p.y - ob * tanB + (typeof yB === 'function' ? yB(p, i) : yB);
      pos.push(p.x + p.rightx * oa, ya, p.z + p.rightz * oa);
      pos.push(p.x + p.rightx * ob, yb, p.z + p.rightz * ob);
      const v = (p.s + sOff) / vScale;
      uv.push(0, v, 1, v);
      count++;
    }
    for (let k = 0; k < count - 1; k++) {
      const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = !!opts.receiveShadow;
    m.castShadow = !!opts.castShadow;
    m.frustumCulled = false;
    return m;
  }

  _build() {
    const half = this.half;
    const roadTex = TX.asphaltTexture();
    roadTex.repeat.set(1, 1);
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex, roughness: 0.92, metalness: 0.02,
      polygonOffset: true, polygonOffsetFactor: 1,
    });
    // 路面
    this.road = this._strip(-half, half, 0, 0, ROAD_TEX_V, roadMat, { receiveShadow: true });
    // 路面 UV：u 需要 0..1 且 v 沿路重复
    this.group.add(this.road);

    // 路肩（红白路缘石）
    const kerbTex = TX.kerbTexture();
    kerbTex.repeat.set(1, 1);
    const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7, side: THREE.DoubleSide });
    for (const sgn of [-1, 1]) {
      const m = this._strip(
        sgn * (half - 1.9), sgn * (half + 0.15), 0.035, 0.05, KERB_TEX_V, kerbMat,
        { step: 1, receiveShadow: true },
      );
      this.group.add(m);
    }

    // 护栏（外侧连续金属带 + 立柱）
    const railTex = TX.railTexture();
    railTex.repeat.set(1, 1);
    const railMat = new THREE.MeshStandardMaterial({
      map: railTex, roughness: 0.42, metalness: 0.65, side: THREE.DoubleSide,
    });
    for (const sgn of [-1, 1]) {
      const edge = sgn * (half + 0.95);
      this.group.add(this._strip(edge, edge, 0.42, 1.05, 8, railMat, { step: 2, castShadow: true }));
    }
    // 立柱
    const postGeo = new THREE.BoxGeometry(0.16, 1.15, 0.16);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8d99a6, roughness: 0.6, metalness: 0.4 });
    const posts = new THREE.InstancedMesh(postGeo, postMat, Math.ceil(this.total / 9) * 2);
    const m4 = new THREE.Matrix4();
    let pi = 0;
    const qY = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let s = 0; s < this.total; s += 9) {
      const p = this.at(s);
      for (const sgn of [-1, 1]) {
        const o = sgn * (half + 0.95);
        const x = p.x + -Math.sin(p.th) * o;
        const z = p.z + Math.cos(p.th) * o;
        const y = p.y - o * Math.tan(p.bank);
        qY.setFromAxisAngle(up, -p.th);
        m4.compose(new THREE.Vector3(x, y + 0.55, z), qY, new THREE.Vector3(1, 1, 1));
        posts.setMatrixAt(pi++, m4);
      }
    }
    posts.count = pi;
    posts.castShadow = true;
    this.group.add(posts);

    // 护坡 + 地面
    const grassTex = TX.grassTexture();
    grassTex.repeat.set(1, 1);
    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, side: THREE.DoubleSide });
    for (const sgn of [-1, 1]) {
      const edge = sgn * (half + 1.0);
      const outFn = (p) => {
        const h = Math.max(0, p.y);
        return sgn * (half + 1.0 + 3.5 + h * 1.1);
      };
      const m = this._strip(edge, outFn, 0.02, (p, i) => -p.y - 0.05, 22, grassMat, { step: 1, receiveShadow: true });
      this.group.add(m);
    }
    const groundGeo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    groundGeo.rotateX(-Math.PI / 2);
    const gt = TX.grassTexture();
    gt.repeat.set(240, 240);
    const groundMat = new THREE.MeshStandardMaterial({ map: gt, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    this.group.add(ground);
    this.ground = ground;

    this._buildStart();
    this._buildPads();
    this._buildScenery();
  }

  _buildStart() {
    const p = this.at(TRACK.startS * this.total);
    const rightx = -Math.sin(p.th), rightz = Math.cos(p.th);
    const dirx = Math.cos(p.th), dirz = Math.sin(p.th);

    // 起点线（方格）
    const [c, g] = [document.createElement('canvas'), null];
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#f2f6ff' : '#15181d';
      ctx.fillRect(i * 16, j * 16, 16, 16);
    }
    const lineTex = new THREE.CanvasTexture(c);
    lineTex.colorSpace = THREE.SRGBColorSpace;
    const lineGeo = new THREE.PlaneGeometry(this.width, 3);
    const line = new THREE.Mesh(lineGeo, new THREE.MeshStandardMaterial({
      map: lineTex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -p.th;
    line.position.set(p.x, p.y + 0.02, p.z);
    this.group.add(line);

    // 龙门架
    const gantry = new THREE.Group();
    const pylonGeo = new THREE.BoxGeometry(1.0, 8.4, 1.0);
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x2b3b52, roughness: 0.5, metalness: 0.6 });
    for (const sgn of [-1, 1]) {
      const py = new THREE.Mesh(pylonGeo, pylonMat);
      py.position.set(
        p.x + rightx * sgn * (this.half + 1.6),
        p.y + 4.2,
        p.z + rightz * sgn * (this.half + 1.6),
      );
      py.castShadow = true;
      gantry.add(py);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.7, this.width + 5), pylonMat);
    beam.position.set(p.x + rightx * 0, p.y + 8.0, p.z + rightz * 0);
    beam.rotation.y = -p.th + Math.PI / 2;
    gantry.add(beam);
    // 横幅
    const bannerTex = TX.bannerTexture();
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width + 3.4, 2.4),
      new THREE.MeshBasicMaterial({ map: bannerTex, transparent: true, side: THREE.DoubleSide }),
    );
    banner.position.set(p.x, p.y + 7.0, p.z);
    banner.rotation.y = -p.th + Math.PI / 2;
    gantry.add(banner);
    // 霓虹灯管
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x39e6ff });
    const neon = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, this.width + 4.5), neonMat);
    neon.position.set(p.x, p.y + 8.9, p.z);
    neon.rotation.y = -p.th + Math.PI / 2;
    gantry.add(neon);
    this.group.add(gantry);
    this.startPos = { x: p.x, z: p.z, th: p.th, dirx, dirz };
  }

  _buildPads() {
    this.pads = TRACK.pads.map(p => ({ ...p }));
    const tex = TX.padTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.95,
    });
    this.padMeshes = this.pads.map((pad) => {
      const s = pad.s * this.total;
      const p = this.at(s);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(7.4, pad.len), mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -p.th;
      m.position.set(
        p.x + -Math.sin(p.th) * pad.offset,
        p.y + 0.03,
        p.z + Math.cos(p.th) * pad.offset,
      );
      m.renderOrder = 2;
      this.group.add(m);
      return m;
    });
    // 底部红白警示 + 两侧灯条
    const glowGeo = new THREE.PlaneGeometry(8.2, 2.2);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x1fd8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const pad of this.pads) {
      const s = pad.s * this.total;
      const p = this.at(s + pad.len / 2 - 0.6);
      const m = new THREE.Mesh(glowGeo, glowMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -p.th;
      m.position.set(
        p.x + -Math.sin(p.th) * pad.offset,
        p.y + 0.04,
        p.z + Math.cos(p.th) * pad.offset,
      );
      m.renderOrder = 2;
      this.group.add(m);
    }
  }

  _buildScenery() {
    // 采样点集合，用于避让
    const coarse = [];
    for (let i = 0; i < this.n; i += 6) coarse.push(this.pts[i]);
    const distToTrack = (x, z) => {
      let d = Infinity;
      for (let i = 0; i < coarse.length; i++) {
        const p = coarse[i];
        const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (dd < d) d = dd;
      }
      return Math.sqrt(d);
    };
    this.distToTrack = distToTrack;

    // 城市建筑
    const bTexs = [TX.buildingTexture(3, 205), TX.buildingTexture(9, 220), TX.buildingTexture(17, 190)];
    const bMats = bTexs.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, metalness: 0.02 }));
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const groups = bMats.map(m => ({ mat: m, list: [] }));
    let seed = 12345;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const placed = [];
    let tries = 0;
    while (placed.length < 190 && tries < 12000) {
      tries++;
      // 沿赛道取点，向两侧外扩
      const s = rand() * this.total;
      const p = this.at(s);
      const side = rand() < 0.5 ? -1 : 1;
      const off = side * (this.half + 34 + rand() * 130);
      const x = p.x + -Math.sin(p.th) * off;
      const z = p.z + Math.cos(p.th) * off;
      if (distToTrack(x, z) < this.half + 30) continue;
      let ok = true;
      for (const q of placed) {
        if ((q.x - x) ** 2 + (q.z - z) ** 2 < (q.r + 26) ** 2) { ok = false; break; }
      }
      if (!ok) continue;
      const w = 14 + rand() * 26, d = 14 + rand() * 26;
      const h = 16 + rand() * (rand() < 0.18 ? 110 : 52);
      const r = Math.max(w, d) / 2;
      placed.push({ x, z, r });
      const g = groups[Math.floor(rand() * groups.length)];
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      m.compose(new THREE.Vector3(x, h / 2 - 0.2, z), q, new THREE.Vector3(w, h, d));
      g.list.push(m);
    }
    for (const g of groups) {
      if (!g.list.length) continue;
      const im = new THREE.InstancedMesh(boxGeo, g.mat, g.list.length);
      g.list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = true;
      this.group.add(im);
    }

    // 远景山脉
    const mountMat = new THREE.MeshStandardMaterial({ color: 0x6f8ba0, roughness: 1, flatShading: true });
    const mountGeo = new THREE.ConeGeometry(1, 1, 5, 1);
    const mounts = new THREE.InstancedMesh(mountGeo, mountMat, 34);
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + rand() * 0.1;
      const r = 1500 + rand() * 500;
      const h = 180 + rand() * 320;
      const w = 260 + rand() * 380;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * r, h / 2 - 30, Math.sin(a) * r),
        new THREE.Quaternion(),
        new THREE.Vector3(w, h, w),
      );
      mounts.setMatrixAt(i, m);
    }
    this.group.add(mounts);

    // 行道树
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6d34, roughness: 1, flatShading: true });
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 3.2, 5);
    const leafGeo = new THREE.ConeGeometry(1.9, 6.5, 6);
    const nTree = 320;
    const trunkIM = new THREE.InstancedMesh(trunkGeo, trunkMat, nTree);
    const leafIM = new THREE.InstancedMesh(leafGeo, leafMat, nTree);
    let ti = 0;
    tries = 0;
    while (ti < nTree && tries < 20000) {
      tries++;
      const s = rand() * this.total;
      const p = this.at(s);
      const side = rand() < 0.5 ? -1 : 1;
      const off = side * (this.half + 12 + rand() * 40);
      const x = p.x + -Math.sin(p.th) * off;
      const z = p.z + Math.cos(p.th) * off;
      if (distToTrack(x, z) < this.half + 8) continue;
      const sc = 0.8 + rand() * 0.9;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      const m1 = new THREE.Matrix4().compose(new THREE.Vector3(x, 1.5 * sc, z), q, new THREE.Vector3(sc, sc, sc));
      const m2 = new THREE.Matrix4().compose(new THREE.Vector3(x, (3.2 + 3.2) * sc, z), q, new THREE.Vector3(sc, sc, sc));
      trunkIM.setMatrixAt(ti, m1);
      leafIM.setMatrixAt(ti, m2);
      ti++;
    }
    trunkIM.count = leafIM.count = ti;
    trunkIM.castShadow = leafIM.castShadow = true;
    this.group.add(trunkIM, leafIM);

    // 路灯
    const lampCount = Math.floor(this.total / 46) * 2;
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 8.5, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8d99a6, metalness: 0.6, roughness: 0.45 });
    const headGeo = new THREE.BoxGeometry(1.5, 0.24, 0.55);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    const poleIM = new THREE.InstancedMesh(poleGeo, poleMat, lampCount);
    const headIM = new THREE.InstancedMesh(headGeo, headMat, lampCount);
    let li = 0;
    for (let s = 0; s < this.total && li < lampCount; s += 46) {
      const p = this.at(s);
      for (const sgn of [-1, 1]) {
        const off = sgn * (this.half + 2.4);
        const x = p.x + -Math.sin(p.th) * off;
        const z = p.z + Math.cos(p.th) * off;
        const y = p.y - off * Math.tan(p.bank);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p.th);
        poleIM.setMatrixAt(li, new THREE.Matrix4().compose(new THREE.Vector3(x, y + 4.25, z), q, new THREE.Vector3(1, 1, 1)));
        headIM.setMatrixAt(li, new THREE.Matrix4().compose(
          new THREE.Vector3(x + -Math.sin(p.th) * -sgn * 1.1, y + 8.4, z + Math.cos(p.th) * -sgn * 1.1),
          q, new THREE.Vector3(1, 1, 1),
        ));
        li++;
      }
    }
    poleIM.count = headIM.count = li;
    poleIM.castShadow = true;
    this.group.add(poleIM, headIM);

    // 广告牌
    const ads = [
      [TX.adTexture('QQ SPEED', '极速漂移', '#122a4a', '#07101f'), 0.12],
      [TX.adTexture('氮气加速', 'NOS BOOST', '#3a1240', '#12061a'), 0.42],
      [TX.adTexture('完美漂移', 'PERFECT', '#0d3a2c', '#04160f'), 0.68],
      [TX.adTexture('城镇高速', 'HIGHWAY', '#3a2a0d', '#160f04'), 0.88],
    ];
    for (const [tex, frac] of ads) {
      const p = this.at(frac * this.total);
      const side = 1;
      const off = side * (this.half + 8);
      const x = p.x + -Math.sin(p.th) * off;
      const z = p.z + Math.cos(p.th) * off;
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 6.5),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
      );
      board.position.set(x, p.y + 8.5, z);
      board.rotation.y = -p.th - Math.PI / 2;
      const legs = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 8.5, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x555f6b, metalness: 0.5, roughness: 0.6 }),
      );
      legs.position.set(x, p.y + 4.2, z);
      this.group.add(board, legs);
    }
  }

  // 每帧更新加速带流光
  update(dt, time) {
    for (const m of this.padMeshes) {
      // 贴图 uv 偏移制造流动感（共享材质，统一偏移）
      m.material.map.offset.y = -time * 1.6;
    }
  }
}