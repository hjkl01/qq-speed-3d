// HUD：圈速面板 / 速度表 / 氮气 / 小地图 / 提示
const $ = (id) => document.getElementById(id);

export function fmtTime(t) {
  if (!isFinite(t) || t <= 0) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export class HUD {
  constructor(track, karts) {
    this.track = track;
    this.karts = karts;
    this.els = {
      hud: $('hud'),
      lap: $('lap'), lapTotal: $('lapTotal'),
      time: $('time'), curLap: $('curlap'), best: $('best'),
      pos: $('position'), totalKarts: $('totalKarts'),
      rank: $('ranklist'),
      nos: document.querySelector('.nos'), nosFill: $('nosFill'),
      nosPct: $('nosPct'), nosTip: $('nosTip'),
      driftWrap: $('driftWrap'), driftFill: $('driftFill'),
      driftTier: $('driftTier'), driftHint: $('driftHint'),
      toasts: $('toasts'), countdown: $('countdown'),
      boostFx: $('boostFx'),
      hintbar: document.querySelector('.hintbar'),
      minimap: $('minimap'),
      speedo: $('speedo'),
    };
    this.els.lapTotal.textContent = track.laps ?? 3;
    this.els.totalKarts.textContent = karts.length;

    // 小地图坐标映射
    const pts = track.pts.filter((_, i) => i % 3 === 0);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const pad = 16;
    const sc = Math.min((200 - pad * 2) / (maxX - minX), (200 - pad * 2) / (maxZ - minZ));
    this.mm = {
      pts,
      sc,
      ox: (200 - (maxX - minX) * sc) / 2 - minX * sc,
      oz: (200 - (maxZ - minZ) * sc) / 2 - minZ * sc,
    };
    this.mmCtx = this.els.minimap.getContext('2d');
    this.spCtx = this.els.speedo.getContext('2d');
    this.rankTimer = 0;
    this.lastDriftTier = '';
    this.smoothedSpeed = 0;
    this.nosShown = 0;
    this.boostVisual = 0;
  }

  show() { this.els.hud.classList.remove('hidden'); }
  hide() { this.els.hud.classList.add('hidden'); }

  toast(text, cls = '', ttl = 950) {
    const d = document.createElement('div');
    d.className = `toast ${cls}`;
    d.textContent = text;
    this.els.toasts.appendChild(d);
    setTimeout(() => {
      d.classList.add('out');
      setTimeout(() => d.remove(), 420);
    }, ttl);
    // 限制数量
    while (this.els.toasts.children.length > 5) this.els.toasts.firstChild.remove();
  }

  countdown(text, go = false) {
    const el = this.els.countdown;
    el.textContent = text;
    el.classList.remove('show', 'go');
    void el.offsetWidth;
    el.classList.add('show');
    if (go) el.classList.add('go');
    clearTimeout(this._cdT);
    this._cdT = setTimeout(() => { el.textContent = ''; el.classList.remove('show', 'go'); }, 1000);
  }

  update(dt, s) {
    const { player, raceTime, position, boost } = s;
    const e = this.els;
    if (!this._hintDim && raceTime > 15 && e.hintbar) { e.hintbar.classList.add('dim'); this._hintDim = true; }

    // 速度表
    this.smoothedSpeed += (player.speedKmh - this.smoothedSpeed) * Math.min(1, dt * 9);
    this.boostVisual += ((boost ? 1 : 0) - this.boostVisual) * Math.min(1, dt * 8);
    this.drawSpeedo(this.smoothedSpeed, player, boost, dt);

    // 氮气
    this.nosShown += (player.nitro - this.nosShown) * Math.min(1, dt * 10);
    const pct = Math.round(this.nosShown * 100);
    e.nosFill.style.width = `${pct}%`;
    e.nosPct.textContent = `${pct}%`;
    e.nos.classList.toggle('full', player.nitro >= 0.999);
    e.nosTip.textContent = player.nitro >= 0.999
      ? '氮气就绪 · Ctrl'
      : player.drifting ? '漂移集气中…' : '漂移集气';

    // 漂移集气槽
    const active = player.drifting;
    e.driftWrap.classList.toggle('active', active);
    const er = Math.min(1, player.driftEnergy / 1.28);
    e.driftFill.style.width = `${(er * 100).toFixed(1)}%`;
    e.driftWrap.classList.toggle('perfect', player.driftEnergy >= 1.28);
    const tier = !active ? '—'
      : player.driftEnergy >= 1.28 ? '完美 · 松手'
        : player.driftEnergy >= 0.42 ? '可小喷'
          : '集气中';
    if (tier !== this.lastDriftTier) {
      e.driftTier.textContent = tier;
      this.lastDriftTier = tier;
    }
    e.driftHint.textContent = active
      ? (player.driftEnergy >= 1.28 ? '现在松手 → 完美漂移！' : '松手触发小喷')
      : (player.nitro >= 0.999 ? '按 Ctrl 释放氮气' : 'Shift + 方向键 起漂');

    // 圈数 / 时间
    e.lap.textContent = Math.min(player.lap, this.track.laps ?? 3);
    e.time.textContent = fmtTime(raceTime);
    e.curLap.textContent = fmtTime(player.lapTimes.length
      ? (player.finished ? player.lapTimes.at(-1) : raceTime - player.lapStart)
      : (raceTime - player.lapStart));
    e.best.textContent = fmtTime(player.bestLap);
    e.pos.textContent = position;

    // 名次列表
    this.rankTimer -= dt;
    if (this.rankTimer <= 0) {
      this.rankTimer = 0.25;
      this.drawRank();
    }

    // 屏幕效果
    e.boostFx.classList.toggle('on', !!boost);
    e.boostFx.classList.toggle('nitro', boost);

    this.drawMinimap(player);
  }

  drawRank() {
    const sorted = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    const html = sorted.map((k, i) => {
      const gap = i === 0 ? '' : `+${((sorted[0].progress - k.progress) / 10).toFixed(0)}m`;
      return `<div class="rankrow ${k.isPlayer ? 'me' : ''}">
        <span class="dot" style="background:${k.uiColor}"></span>
        <span class="nm">${k.name}</span>
        <span class="gp">${k.finished ? 'FIN' : gap}</span>
      </div>`;
    }).join('');
    this.els.rank.innerHTML = html;
  }

  drawSpeedo(kmh, player, boost, dt) {
    const c = this.spCtx;
    const W = 240, H = 240;
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = 132, R = 92;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;   // 270°
    const maxKmh = 360;
    const t = Math.min(1, kmh / maxKmh);

    // 底盘光
    const g = c.createRadialGradient(cx, cy, 20, cx, cy, R + 16);
    g.addColorStop(0, 'rgba(6,24,40,0.94)');
    g.addColorStop(0.72, 'rgba(4,14,24,0.86)');
    g.addColorStop(1, 'rgba(4,14,24,0.12)');
    c.fillStyle = g;
    c.beginPath(); c.arc(cx, cy, R + 16, 0, Math.PI * 2); c.fill();

    // 刻度
    c.save();
    for (let v = 0; v <= maxKmh; v += 20) {
      const a = a0 + (v / maxKmh) * (a1 - a0);
      const major = v % 60 === 0;
      const r1 = major ? R - 16 : R - 9;
      const x1 = cx + Math.cos(a) * R, y1 = cy + Math.sin(a) * R;
      const x2 = cx + Math.cos(a) * r1, y2 = cy + Math.sin(a) * r1;
      c.strokeStyle = major ? 'rgba(160,230,255,0.9)' : 'rgba(110,180,210,0.45)';
      c.lineWidth = major ? 2.2 : 1.2;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      if (major && v % 60 === 0) {
        c.fillStyle = 'rgba(170,225,245,0.9)';
        c.font = '600 11px system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        const rt = R - 30;
        c.fillText(String(v), cx + Math.cos(a) * rt, cy + Math.sin(a) * rt);
      }
    }
    c.restore();

    // 进度弧
    c.lineCap = 'round';
    c.lineWidth = 7;
    c.strokeStyle = 'rgba(30,90,130,0.35)';
    c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke();
    const grad = c.createLinearGradient(cx - R, cy, cx + R, cy);
    if (boost) {
      grad.addColorStop(0, '#ffd24a'); grad.addColorStop(0.5, '#ff9c2b'); grad.addColorStop(1, '#fff4c2');
    } else {
      grad.addColorStop(0, '#1f7bff'); grad.addColorStop(0.6, '#37e6ff'); grad.addColorStop(1, '#c8fbff');
    }
    c.strokeStyle = grad;
    c.shadowColor = boost ? 'rgba(255,180,70,0.9)' : 'rgba(55,230,255,0.85)';
    c.shadowBlur = 16;
    if (t > 0.002) {
      c.beginPath(); c.arc(cx, cy, R, a0, a0 + t * (a1 - a0)); c.stroke();
    }
    c.shadowBlur = 0;

    // 指针
    const ang = a0 + t * (a1 - a0);
    c.save();
    c.translate(cx, cy); c.rotate(ang);
    c.beginPath();
    c.moveTo(-6, 0); c.lineTo(0, -5); c.lineTo(R - 22, 0); c.lineTo(0, 5);
    c.closePath();
    c.fillStyle = boost ? '#ffb347' : '#eafcff';
    c.shadowColor = boost ? 'rgba(255,180,70,0.95)' : 'rgba(55,230,255,0.95)';
    c.shadowBlur = 14;
    c.fill();
    c.restore();
    c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2);
    c.fillStyle = '#0a1c2a'; c.fill();
    c.strokeStyle = boost ? '#ffb347' : '#37e6ff'; c.lineWidth = 2.4; c.stroke();

    // 数字
    c.textAlign = 'center';
    c.fillStyle = boost ? '#ffd58a' : '#eafcff';
    c.font = 'italic 900 44px system-ui, "PingFang SC", sans-serif';
    c.shadowColor = boost ? 'rgba(255,180,70,0.9)' : 'rgba(55,230,255,0.8)';
    c.shadowBlur = 20;
    c.fillText(String(Math.round(kmh)), cx, cy + 34);
    c.shadowBlur = 0;
    c.font = '600 12px system-ui, sans-serif';
    c.fillStyle = 'rgba(160,215,235,0.85)';
    c.fillText('km/h', cx, cy + 56);
  }

  drawMinimap(player) {
    const c = this.mmCtx;
    c.clearRect(0, 0, 200, 200);
    const { pts, sc, ox, oz } = this.mm;
    const X = (x) => ox + x * sc;
    const Y = (z) => oz + z * sc;

    // 赛道底
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(X(pts[0].x), Y(pts[0].z));
    for (let i = 1; i < pts.length; i++) c.lineTo(X(pts[i].x), Y(pts[i].z));
    c.closePath();
    c.strokeStyle = 'rgba(8, 40, 62, 0.9)';
    c.lineWidth = 9;
    c.stroke();
    c.strokeStyle = 'rgba(55, 230, 255, 0.55)';
    c.lineWidth = 2.2;
    c.shadowColor = 'rgba(55,230,255,0.8)';
    c.shadowBlur = 6;
    c.stroke();
    c.shadowBlur = 0;

    // 加速带
    c.fillStyle = 'rgba(255,178,60,0.85)';
    for (const pad of this.track.pads) {
      const p = this.track.at(pad.s * this.track.total);
      c.beginPath();
      c.arc(X(p.x), Y(p.z), 2.2, 0, Math.PI * 2);
      c.fill();
    }

    // 起点
    const sp = this.track.at(this.track.startS * this.track.total);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    c.beginPath();
    const dx = -Math.sin(sp.th) * 5, dz = Math.cos(sp.th) * 5;
    c.moveTo(X(sp.x + dx), Y(sp.z + dz));
    c.lineTo(X(sp.x - dx), Y(sp.z - dz));
    c.stroke();

    // 车
    for (const k of this.karts) {
      const px = X(k.pos.x), py = Y(k.pos.z);
      c.beginPath();
      if (k.isPlayer) {
        c.fillStyle = '#eafcff';
        c.arc(px, py, 4, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#37e6ff';
        c.lineWidth = 2.5;
        c.beginPath();
        c.arc(px, py, 7, 0, Math.PI * 2);
        c.stroke();
      } else {
        c.fillStyle = k.uiColor;
        c.arc(px, py, 3.2, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  results(rows, stats) {
    const t = $('resultTable');
    t.innerHTML = `<div class="rrow head"><span>名次</span><span>车手</span><span>总时间</span><span>最快圈</span></div>`
      + rows.map((r, i) => `<div class="rrow ${r.me ? 'me' : ''}">
        <span class="rk">${i + 1}</span>
        <span>${r.name}</span>
        <span class="tm">${r.time}</span>
        <span class="bl ${r.bestNum > 0 && r.bestNum === Math.min(...rows.map(x => x.bestNum || Infinity)) ? 'best' : ''}">${r.best}</span>
      </div>`).join('');
    $('resultStats').innerHTML = stats.map(s => `<div><b>${s.v}</b>${s.k}</div>`).join('');
    $('resultTitle').textContent = rows[0]?.me ? '冠军！' : '比赛完成';
  }
}