// 键盘输入（QQ飞车式键位）
const MAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'drift', ShiftRight: 'drift', Space: 'drift',
  ControlLeft: 'nitro', ControlRight: 'nitro', KeyJ: 'nitro', KeyE: 'nitro',
  KeyR: 'reset',
  KeyC: 'camera',
  KeyM: 'mute',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'confirm', NumpadEnter: 'confirm',
  KeyH: 'help',
};

export class Input {
  constructor() {
    this.down = new Set();
    this.just = new Set();
    this.codes = new Map(); // 动作 → 仍按着的物理键（W 和 ↑ 都是 up，松开一个不能把另一个的油门清掉）
    this.blocked = new Set(['up', 'down', 'left', 'right', 'drift', 'nitro', 'pause']);
    window.addEventListener('keydown', (e) => {
      const act = MAP[e.code];
      if (!act) return;
      if (this.blocked.has(act)) e.preventDefault();
      if (!this.down.has(act)) this.just.add(act);
      this.down.add(act);
      if (!this.codes.has(act)) this.codes.set(act, new Set());
      this.codes.get(act).add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      const act = MAP[e.code];
      if (!act) return;
      if (this.blocked.has(act)) e.preventDefault();
      const held = this.codes.get(act);
      if (held) held.delete(e.code);
      if (!held || held.size === 0) this.down.delete(act);
      if (held && held.size === 0) this.codes.delete(act);
    });
    window.addEventListener('blur', () => this.clear());
  }

  clear() { this.down.clear(); this.just.clear(); this.codes.clear(); }

  has(a) { return this.down.has(a); }

  take(a) {
    if (this.just.has(a)) { this.just.delete(a); return true; }
    return false;
  }

  endFrame() { this.just.clear(); }

  get steer() {
    return (this.has('right') ? 1 : 0) - (this.has('left') ? 1 : 0);
  }

  get throttle() { return this.has('up'); }
  get brake() { return this.has('down'); }
  get drift() { return this.has('drift'); }
  get nitro() { return this.has('nitro'); }

  state() {
    return {
      throttle: this.throttle,
      brake: this.brake,
      steer: this.steer,
      drift: this.drift,
    };
  }
}