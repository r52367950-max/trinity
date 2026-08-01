import { clamp } from './utils.js';

/** Pointer lock is optional and can be refused; never let that reject loudly. */
function requestLock(canvas) {
  try {
    const p = canvas.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* the drag fallback covers it */ }
}

/** Keyboard, mouse-look and pointer lock. */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookYaw = 0;
    this.lookPitch = -0.03;
    this.rudder = 0;
    this.trim = 0;
    this.neutral = false;
    this.climb = 0;
    this.locked = false;
    this.touchSteer = 0;
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
      if (!this.locked) requestLock(canvas);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      document.body.classList.toggle('locked', this.locked);
    });

    // Drag fallback. Sandboxed iframes routinely refuse pointer lock, and
    // without this the player would be unable to look around at all.
    this.dragging = false;
    let dx = 0, dy = 0;
    canvas.addEventListener('mousedown', (e) => {
      if (this.locked || e.button !== 0) return;
      this.dragging = true; dx = e.clientX; dy = e.clientY;
    });
    addEventListener('mouseup', () => { this.dragging = false; });

    addEventListener('mousemove', (e) => {
      let yaw = 0, pitch = 0;
      if (this.locked) {
        yaw = e.movementX * this.sensitivity;
        pitch = e.movementY * this.sensitivity;
      } else if (this.dragging) {
        yaw = (e.clientX - dx) * 0.005;
        pitch = (e.clientY - dy) * 0.005;
        dx = e.clientX; dy = e.clientY;
      } else return;
      this.lookYaw -= yaw;
      this.lookPitch = clamp(this.lookPitch - pitch, -1.25, 1.25);
      // keep the yaw wrapped so the "look ahead" recentre is always the short way
      if (this.lookYaw > Math.PI) this.lookYaw -= Math.PI * 2;
      if (this.lookYaw < -Math.PI) this.lookYaw += Math.PI * 2;
    });
  }

  /**
   * Touch fallback: hold the bottom-left or bottom-right of the screen to put
   * the helm over, drag anywhere else to look around.
   */
  installTouch(canvas) {
    this.touchSteer = 0;
    const steerZones = new Map();
    let lookId = null, lx = 0, ly = 0;

    const isSteer = (e) => e.clientY > innerHeight * 0.62;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      canvas.setPointerCapture(e.pointerId);
      if (isSteer(e)) {
        steerZones.set(e.pointerId, e.clientX < innerWidth * 0.5 ? -1 : 1);
        this.touchSteer = [...steerZones.values()].reduce((a, b) => a + b, 0);
      } else {
        lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      this.lookYaw -= (e.clientX - lx) * 0.004;
      this.lookPitch = clamp(this.lookPitch - (e.clientY - ly) * 0.004, -1.25, 1.25);
      lx = e.clientX; ly = e.clientY;
    });
    const end = (e) => {
      if (steerZones.delete(e.pointerId)) {
        this.touchSteer = [...steerZones.values()].reduce((a, b) => a + b, 0);
      }
      if (e.pointerId === lookId) lookId = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.style.touchAction = 'none';
  }

  /** True once per physical key press. */
  tapped(code) {
    const n = this._taps.get(code) || 0;
    if (n > 0) { this._taps.set(code, 0); return true; }
    return false;
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }

  update(dt) {
    const steer = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0)
      + this.touchSteer;
    const target = Math.max(-1, Math.min(1, steer)) * (this.down('ShiftLeft', 'ShiftRight') ? 1 : 0.62);
    this.rudder += (target - this.rudder) * Math.min(1, dt * 7);
    if (steer === 0) this.rudder *= Math.max(0, 1 - dt * 4.5);
    // A tap has to survive a slow frame: at a few fps the key is up again
    // before the next sample, and "stop" is not a command to drop on the floor.
    this.neutral = this.down('Space') || this.tapped('Space');
    if (this.neutral) this.rudder *= Math.max(0, 1 - dt * 12);

    this.trim = (this.down('KeyS', 'ArrowDown') ? 1 : 0) - (this.down('KeyW', 'ArrowUp') ? 1 : 0);
    // only the probe can climb, but the axis costs nothing to carry
    this.climb = (this.down('KeyE') ? 1 : 0) - (this.down('KeyQ') ? 1 : 0);
  }
}
