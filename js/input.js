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
    this.blocked = new Set(['up', 'down', 'left', 'right', 'drift', 'nitro', 'pause']);
    window.addEventListener('keydown', (e) => {
      const act = MAP[e.code];
      if (!act) return;
      if (this.blocked.has(act)) e.preventDefault();
      if (!this.down.has(act)) this.just.add(act);
      this.down.add(act);
    });
    window.addEventListener('keyup', (e) => {
      const act = MAP[e.code];
      if (!act) return;
      if (this.blocked.has(act)) e.preventDefault();
      this.down.delete(act);
    });
    window.addEventListener('blur', () => this.clear());
  }

  clear() { this.down.clear(); this.just.clear(); }

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