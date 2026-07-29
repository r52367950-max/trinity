import { clamp } from './utils.js';

/** Keyboard, mouse-look and pointer lock. */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookYaw = 0;
    this.lookPitch = -0.03;
    this.rudder = 0;
    this.trim = 0;
    this.locked = false;
    this.sensitivity = 0.0022;
    this._taps = new Map();

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this._taps.set(k, (this._taps.get(k) || 0) + 1);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      document.body.classList.toggle('locked', this.locked);
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookYaw -= e.movementX * this.sensitivity;
      this.lookPitch = clamp(this.lookPitch - e.movementY * this.sensitivity, -1.25, 1.25);
      // keep the yaw wrapped so the "look ahead" recentre is always the short way
      if (this.lookYaw > Math.PI) this.lookYaw -= Math.PI * 2;
      if (this.lookYaw < -Math.PI) this.lookYaw += Math.PI * 2;
    });
  }

  /** True once per physical key press. */
  tapped(code) {
    const n = this._taps.get(code) || 0;
    if (n > 0) { this._taps.set(code, 0); return true; }
    return false;
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }

  update(dt) {
    const steer = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    const target = steer * (this.down('ShiftLeft', 'ShiftRight') ? 1 : 0.62);
    this.rudder += (target - this.rudder) * Math.min(1, dt * 7);
    if (steer === 0) this.rudder *= Math.max(0, 1 - dt * 4.5);
    if (this.down('Space')) this.rudder *= Math.max(0, 1 - dt * 12);

    this.trim = (this.down('KeyS', 'ArrowDown') ? 1 : 0) - (this.down('KeyW', 'ArrowUp') ? 1 : 0);
  }
}
