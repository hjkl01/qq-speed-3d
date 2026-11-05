// 粒子特效：漂移烟、火花、落地尘土、胎痕
import * as THREE from '../vendor/three.module.js';

const SMOKE_MAX = 700;
const SKID_MAX = 480;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this._initSmoke();
    this._initSkid();
  }

  _initSmoke() {
    const n = SMOKE_MAX;
    this.smoke = {
      n, head: 0,
      pos: new Float32Array(n * 3),
      vel: new Float32Array(n * 3),
      size: new Float32Array(n),
      alpha: new Float32Array(n),
      color: new Float32Array(n * 3),
      life: new Float32Array(n),
      maxLife: new Float32Array(n),
      drag: new Float32Array(n),
      active: new Uint8Array(n),
    };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.smoke.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.smoke.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.smoke.alpha, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.smoke.color, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {},
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying float vA;
        varying vec3 vC;
        void main() {
          vA = aAlpha; vC = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vA;
        varying vec3 vC;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          float a = smoothstep(0.5, 0.12, r) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
        }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    sceneAdd(this.scene, pts);
    this.smokeMesh = pts;
    this.smokeGeo = g;
  }

  spawnPuff(x, y, z, vx, vy, vz, { size = 1, life = 1, color = [0.85, 0.85, 0.9], drag = 1.6 } = {}) {
    const s = this.smoke;
    const i = s.head = (s.head + 1) % s.n;
    s.pos[i * 3] = x; s.pos[i * 3 + 1] = y; s.pos[i * 3 + 2] = z;
    s.vel[i * 3] = vx; s.vel[i * 3 + 1] = vy; s.vel[i * 3 + 2] = vz;
    s.size[i] = size;
    s.alpha[i] = 0.55;
    s.color[i * 3] = color[0]; s.color[i * 3 + 1] = color[1]; s.color[i * 3 + 2] = color[2];
    s.life[i] = 0;
    s.maxLife[i] = life;
    s.drag[i] = drag;
    s.active[i] = 1;
  }

  burst(x, y, z, n, { speed = 6, color = [1, 0.8, 0.3], size = 0.5, life = 0.5 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 1.2;
      this.spawnPuff(
        x, y, z,
        Math.cos(a) * speed * Math.random(), up * speed * 0.5, Math.sin(a) * speed * Math.random(),
        { size: size * (0.6 + Math.random()), life: life * (0.6 + Math.random() * 0.8), color, drag: 2.4 },
      );
    }
  }

  updateSmoke(dt) {
    const s = this.smoke;
    let any = false;
    for (let i = 0; i < s.n; i++) {
      if (!s.active[i]) continue;
      any = true;
      s.life[i] += dt;
      const t = s.life[i] / s.maxLife[i];
      if (t >= 1) { s.active[i] = 0; s.alpha[i] = 0; continue; }
      const d = 1 - Math.min(1, s.drag[i] * dt);
      s.vel[i * 3] *= d;
      s.vel[i * 3 + 1] = s.vel[i * 3 + 1] * d + 0.6 * dt;
      s.vel[i * 3 + 2] *= d;
      s.pos[i * 3] += s.vel[i * 3] * dt;
      s.pos[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
      s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
      s.alpha[i] = 0.55 * (1 - t) ** 1.5;
      s.size[i] += dt * 2.2;
    }
    if (any) {
      this.smokeGeo.attributes.position.needsUpdate = true;
      this.smokeGeo.attributes.aSize.needsUpdate = true;
      this.smokeGeo.attributes.aAlpha.needsUpdate = true;
      this.smokeGeo.attributes.aColor.needsUpdate = true;
    }
  }

  _initSkid() {
    const n = SKID_MAX;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new Float32Array([
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(quad, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const pos = new Float32Array(n * 3);
    const yaw = new Float32Array(n);
    const scale = new Float32Array(n * 2);
    const alpha = new Float32Array(n);
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('aYaw', new THREE.InstancedBufferAttribute(yaw, 1));
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scale, 2));
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute vec3 aPos;
        attribute float aYaw;
        attribute vec2 aScale;
        attribute float aAlpha;
        varying float vA;
        void main() {
          vec3 p = position;
          vec3 q = vec3(p.x * aScale.x, 0.0, p.z * aScale.y);
          float c = cos(aYaw), s = sin(aYaw);
          vec3 r = vec3(q.x * c - q.z * s, 0.0, q.x * s + q.z * c);
          vA = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(aPos + r, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vA;
        void main() {
          if (vA < 0.01) discard;
          gl_FragColor = vec4(0.035, 0.035, 0.042, vA);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.skid = {
      n, head: 0, geo, pos, yaw, scale, alpha,
      life: new Float32Array(n),
    };
  }

  addSkid(x, y, z, th, width = 0.34, len = 0.5, alpha = 0.5) {
    const s = this.skid;
    const i = s.head = (s.head + 1) % s.n;
    s.pos[i * 3] = x; s.pos[i * 3 + 1] = y + 0.02; s.pos[i * 3 + 2] = z;
    s.yaw[i] = Math.PI / 2 - th;
    s.scale[i * 2] = width;
    s.scale[i * 2 + 1] = len;
    s.alpha[i] = alpha;
    s.life[i] = 0;
    s.geo.attributes.aPos.needsUpdate = true;
    s.geo.attributes.aYaw.needsUpdate = true;
    s.geo.attributes.aScale.needsUpdate = true;
    s.geo.attributes.aAlpha.needsUpdate = true;
  }

  updateSkid(dt) {
    const s = this.skid;
    let any = false;
    for (let i = 0; i < s.n; i++) {
      if (s.alpha[i] <= 0.001) continue;
      any = true;
      s.life[i] += dt;
      s.alpha[i] = Math.max(0, s.alpha[i] - dt * 0.075);
    }
    if (any) s.geo.attributes.aAlpha.needsUpdate = true;
  }

  update(dt) {
    this.updateSmoke(dt);
    this.updateSkid(dt);
  }
}

function sceneAdd(scene, obj) {
  scene.add(obj);
}