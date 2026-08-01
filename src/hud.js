import { KNOTS } from './shared.js';
import { clamp } from './utils.js';

/**
 * Instruments. The dial is the important one: it shows the apparent wind
 * relative to the bow, the no-go zone you cannot sail into, and where the
 * boom currently is — which together are everything you need to sail.
 */
export class Hud {
  constructor() {
    this.el = {
      speed: document.getElementById('speed'),
      heading: document.getElementById('heading'),
      wind: document.getElementById('wind'),
      trimBar: document.getElementById('trim-bar'),
      trimLabel: document.getElementById('trim-label'),
      heelLabel: document.getElementById('heel-label'),
      status: document.getElementById('status'),
      mark: document.getElementById('mark'),
      timer: document.getElementById('timer'),
      rivalGap: document.getElementById('rival-gap'),
      lblA: document.getElementById('lbl-a'),
      lblB: document.getElementById('lbl-b'),
      lblC: document.getElementById('lbl-c'),
      lblTrim: document.getElementById('lbl-trim'),
      help: document.getElementById('help'),
      toast: document.getElementById('toast'),
      fps: document.getElementById('fps'),
    };
    this.canvas = document.getElementById('dial');
    this.ctx = this.canvas.getContext('2d');
    this._toastUntil = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const size = 168;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = size;
  }

  toast(text, seconds = 2.6) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this._toastUntil = performance.now() / 1000 + seconds;
  }

  /**
   * The gap to the rival, measured in distance still to sail rather than in
   * separation — two boats on opposite tacks can be 300 m apart and dead level.
   */
  updateRival(playerLeft, rivalLeft, playerDone, rivalDone) {
    const el = this.el.rivalGap;
    if (!el) return;
    if (playerDone || rivalDone) {
      el.textContent = playerDone && !rivalDone ? 'WON' : !playerDone && rivalDone ? 'LOST' : 'FINISHED';
      el.className = playerDone && !rivalDone ? 'ahead' : 'astern';
      return;
    }
    const gap = rivalLeft - playerLeft;          // positive: the player is ahead
    const m = Math.abs(gap);
    const dist = m > 950 ? `${(m / 1000).toFixed(1)} km` : `${m.toFixed(0)} m`;
    el.textContent = m < 12 ? 'LEVEL' : `${gap > 0 ? '+' : '−'}${dist}`;
    el.className = m < 12 ? '' : gap > 0 ? 'ahead' : 'astern';
  }

  /**
   * The three sub-readouts and the bar mean different things on each boat.
   * Keyed on the whole set, not the first label — both faces start with HDG.
   */
  setLabels(a, b, c, trim) {
    const key = a + b + c + trim;
    if (this._labelKey === key) return;
    this._labelKey = key;
    this.el.lblA.textContent = a;
    this.el.lblB.textContent = b;
    this.el.lblC.textContent = c;
    this.el.lblTrim.textContent = trim;
  }

  setStatus(text, kind) {
    this.el.status.textContent = text;
    this.el.status.className = kind;
  }

  /** Retire the toast once its time is up. */
  _tick() {
    if (this._toastUntil && performance.now() / 1000 > this._toastUntil) {
      this.el.toast.classList.remove('show');
      this._toastUntil = 0;
    }
  }

  update(state) {
    const { boat, wind, boomAngle, tackSign, time } = state;
    this.setLabels('HDG', 'WIND', 'HEEL', 'Sheet');

    this.el.speed.textContent = (boat.surge * KNOTS).toFixed(1);
    const hdg = ((boat.heading * 180) / Math.PI + 360) % 360;
    this.el.heading.textContent = hdg.toFixed(0).padStart(3, '0') + '°';
    this.el.wind.textContent = `${(wind.speed * KNOTS).toFixed(0)} kn`;

    const trimPct = Math.round(boat.mainTrim * 100);
    this.el.trimBar.style.width = trimPct + '%';
    this.el.trimLabel.textContent = boat.autoTrim ? 'AUTO' : trimPct + '%';
    // positive heel lays the boat's local +X down, and local +X is port
    this.el.heelLabel.textContent = `${Math.abs((boat.heel * 180) / Math.PI).toFixed(0)}° ${boat.heel > 0.01 ? 'PORT' : boat.heel < -0.01 ? 'STBD' : ''}`;

    let status = '';
    if (boat.aground > 0) status = 'AGROUND';
    else if (boat.luffing > 0.5) status = Math.abs(boat.apparent.angle) < 0.6 ? 'IN IRONS' : 'LUFFING';
    else if (boat.surge * KNOTS > 6.5) status = 'MAKING WAY';
    this.setStatus(status, status === 'AGROUND' ? 'bad'
      : status === 'IN IRONS' || status === 'LUFFING' ? 'warn' : 'good');

    this._tick();
    this.drawDial(boat, wind, boomAngle, tackSign, time);
  }

  /**
   * Kingfisher's face. Nothing about wind angle matters here, so the rose is
   * replaced by the two numbers that do: how much throttle you are asking for,
   * and how much battery is left to answer with.
   */
  updatePower(state) {
    const { power, time } = state;
    this.setLabels('HDG', 'BATT', 'DRIVE', 'Throttle');

    this.el.speed.textContent = (power.surge * KNOTS).toFixed(1);
    const hdg = ((power.heading * 180) / Math.PI + 360) % 360;
    this.el.heading.textContent = hdg.toFixed(0).padStart(3, '0') + '°';
    this.el.wind.textContent = `${Math.round(power.battery * 100)}%`;
    this.el.heelLabel.textContent = power.planing > 0.55 ? 'PLANE' : power.planing > 0.1 ? 'LIFT' : 'DISPL';

    const thr = Math.round(Math.abs(power.throttle) * 100);
    this.el.trimBar.style.width = Math.min(100, thr) + '%';
    this.el.trimLabel.textContent = power.throttle < -0.02 ? `AST ${thr}%` : `${thr}%`;

    let status = '', kind = 'good';
    if (power.aground > 0) { status = 'AGROUND'; kind = 'bad'; }
    else if (power.battery <= 0.02) { status = 'BATTERY FLAT'; kind = 'bad'; }
    else if (power.battery < 0.15) { status = 'BATTERY LOW'; kind = 'warn'; }
    else if (power.planing > 0.85) status = 'ON THE PLANE';
    else if (power.moored) status = 'MOORED';
    this.setStatus(status, kind);

    this._tick();
    this.drawPowerDial(power);
  }

  /**
   * The probe's face. It shares no units with the boats and no instrument
   * either: nothing here is a compass rose, because nothing it does is
   * relative to the wind.
   */
  updateDroplet(state) {
    const { droplet, time } = state;
    this.setLabels('HDG', 'ALT', 'MODE', 'Thrust');

    const kn = droplet.knots;
    this.el.speed.textContent = Math.abs(kn) < 100 ? kn.toFixed(1) : kn.toFixed(0);
    const hdg = ((droplet.heading * 180) / Math.PI + 360) % 360;
    this.el.heading.textContent = hdg.toFixed(0).padStart(3, '0') + '°';
    this.el.wind.textContent = `${droplet.altitude < 100 ? droplet.altitude.toFixed(1) : droplet.altitude.toFixed(0)} m`;
    this.el.heelLabel.textContent = droplet.arriving > 0 ? 'ENTRY'
      : Math.abs(kn) < 0.5 ? 'HOLD' : kn < 0 ? 'ASTERN' : 'RUN';

    const frac = Math.round(Math.abs(droplet.charge) * 100);
    this.el.trimBar.style.width = Math.min(100, frac) + '%';
    this.el.trimLabel.textContent = `${frac}%`;

    let status = '', kind = 'good';
    if (droplet.arriving > 0) { status = 'INBOUND'; kind = 'warn'; }
    else if (droplet.stopFlash > 0.05) { status = 'FULL STOP'; kind = 'warn'; }
    else if (Math.abs(kn) > 240) status = 'STRONG INTERACTION';
    else if (Math.abs(kn) < 0.5) status = 'STATION KEEPING';
    this.setStatus(status, kind);

    this._tick();
    this.drawDropletDial(droplet);
  }

  drawDropletDial(droplet) {
    const c = this.ctx;
    const s = this.size;
    const cx = s / 2, cy = s / 2, R = s / 2 - 14;
    c.clearRect(0, 0, s, s);
    c.save();
    c.translate(cx, cy);

    // concentric rings, because the thing has no orientation worth reading —
    // only a magnitude and a direction along its own axis
    c.strokeStyle = 'rgba(126, 200, 255, 0.16)';
    c.lineWidth = 1;
    for (const f of [1.0, 0.72, 0.44]) {
      c.beginPath(); c.arc(0, 0, R * f, 0, Math.PI * 2); c.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      c.strokeStyle = i % 6 === 0 ? 'rgba(126,200,255,0.5)' : 'rgba(126,200,255,0.16)';
      c.beginPath();
      c.moveTo(Math.sin(a) * R, -Math.cos(a) * R);
      c.lineTo(Math.sin(a) * (R - (i % 6 === 0 ? 8 : 4)), -Math.cos(a) * (R - (i % 6 === 0 ? 8 : 4)));
      c.stroke();
    }

    // the velocity vector: straight up when running, straight down astern
    const v = droplet.surge / 148;
    const len = Math.min(1, Math.abs(v)) * R * 0.86;
    c.strokeStyle = v < 0 ? '#f0b45c' : '#7ec8ff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, v >= 0 ? -len : len);
    c.stroke();
    c.fillStyle = c.strokeStyle;
    const tip = v >= 0 ? -len : len;
    const dir = v >= 0 ? -1 : 1;
    c.beginPath();
    c.moveTo(0, tip + dir * 7);
    c.lineTo(-5, tip);
    c.lineTo(5, tip);
    c.closePath();
    c.fill();

    // the drop itself, sitting at the centre
    c.fillStyle = 'rgba(238,243,247,0.9)';
    c.beginPath();
    c.moveTo(0, -R * 0.20);
    c.bezierCurveTo(R * 0.10, -R * 0.02, R * 0.11, R * 0.13, 0, R * 0.16);
    c.bezierCurveTo(-R * 0.11, R * 0.13, -R * 0.10, -R * 0.02, 0, -R * 0.20);
    c.fill();

    // altitude ladder down the left edge
    const alt = Math.min(1, Math.log10(1 + droplet.altitude) / 3);
    c.fillStyle = 'rgba(126,200,255,0.18)';
    c.fillRect(-R - 5, -R * 0.8, 3, R * 1.6);
    c.fillStyle = '#7ec8ff';
    c.fillRect(-R - 5, R * 0.8 - alt * R * 1.6, 3, alt * R * 1.6);

    c.restore();
    c.fillStyle = 'rgba(126,200,255,0.75)';
    c.font = '600 10px ui-monospace, monospace';
    c.textAlign = 'center';
    c.fillText('水滴 · PROBE', cx, 12);
    c.fillText(`ALT ${droplet.altitude < 100 ? droplet.altitude.toFixed(1) : droplet.altitude.toFixed(0)} m`, cx, s - 2);
  }

  drawPowerDial(power) {
    const c = this.ctx;
    const s = this.size;
    const cx = s / 2, cy = s / 2, R = s / 2 - 14;
    c.clearRect(0, 0, s, s);
    c.save();
    c.translate(cx, cy);

    // 270 degrees of sweep, opening at the bottom
    const A = (f) => Math.PI * 0.75 + clamp(f, 0, 1) * Math.PI * 1.5;
    // throttle runs from full astern to full ahead, with neutral off-centre
    const map = (x) => (x + 0.4) / 1.4;
    const zero = map(0);

    c.lineCap = 'butt';
    c.lineWidth = 9;
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.arc(0, 0, R, A(0), A(1)); c.stroke();

    const t = map(power.throttle);
    if (Math.abs(power.throttle) > 0.005) {
      c.strokeStyle = power.throttle < 0 ? '#e4a34a' : '#8fe0b0';
      c.beginPath();
      c.arc(0, 0, R, Math.min(A(zero), A(t)), Math.max(A(zero), A(t)));
      c.stroke();
    }

    // neutral detent
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(Math.cos(A(zero)) * (R - 8), Math.sin(A(zero)) * (R - 8));
    c.lineTo(Math.cos(A(zero)) * (R + 6), Math.sin(A(zero)) * (R + 6));
    c.stroke();

    // battery ring inside
    const b = power.battery;
    c.lineWidth = 5;
    c.strokeStyle = 'rgba(255,255,255,0.10)';
    c.beginPath(); c.arc(0, 0, R - 15, A(0), A(1)); c.stroke();
    c.strokeStyle = b < 0.15 ? '#ee6a58' : b < 0.35 ? '#f0b45c' : '#63d6a4';
    c.beginPath(); c.arc(0, 0, R - 15, A(0), A(b)); c.stroke();

    // needle
    c.strokeStyle = '#eef3f7';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(Math.cos(A(t)) * (R - 26), Math.sin(A(t)) * (R - 26));
    c.lineTo(Math.cos(A(t)) * (R - 4), Math.sin(A(t)) * (R - 4));
    c.stroke();

    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.font = '600 10px ui-monospace, monospace';
    c.textAlign = 'center';
    c.fillText('THROTTLE', 0, -R + 26);
    c.fillStyle = b < 0.15 ? '#ee6a58' : 'rgba(255,255,255,0.7)';
    c.fillText(`BATT ${Math.round(b * 100)}%`, 0, R - 6);
    c.restore();
  }

  drawDial(boat, wind, boomAngle, tackSign) {
    const c = this.ctx;
    const s = this.size;
    const cx = s / 2, cy = s / 2, R = s / 2 - 12;
    c.clearRect(0, 0, s, s);

    // rose
    c.save();
    c.translate(cx, cy);
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.stroke();

    // the no-go zone, dead upwind of the bow
    const beta = boat.apparent.angle;
    c.save();
    c.rotate(0);
    c.fillStyle = 'rgba(228, 86, 72, 0.16)';
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, R, -Math.PI / 2 - 0.72, -Math.PI / 2 + 0.72);
    c.closePath();
    c.fill();
    c.restore();

    // ticks
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const major = i % 9 === 0;
      c.strokeStyle = major ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)';
      c.beginPath();
      c.moveTo(Math.sin(a) * R, -Math.cos(a) * R);
      c.lineTo(Math.sin(a) * (R - (major ? 9 : 5)), -Math.cos(a) * (R - (major ? 9 : 5)));
      c.stroke();
    }

    // boat silhouette, always bow-up
    c.fillStyle = 'rgba(255,255,255,0.82)';
    c.beginPath();
    c.moveTo(0, -R * 0.62);
    c.quadraticCurveTo(R * 0.19, -R * 0.1, R * 0.15, R * 0.42);
    c.lineTo(-R * 0.15, R * 0.42);
    c.quadraticCurveTo(-R * 0.19, -R * 0.1, 0, -R * 0.62);
    c.fill();

    // Boom. The dial is a plan view with the bow up, so screen-right is
    // starboard — the opposite of the hull's local +X, hence the sign.
    c.strokeStyle = boat.luffing > 0.5 ? '#e4a34a' : '#8fe0b0';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, -R * 0.12);
    c.lineTo(Math.sin(boomAngle) * R * 0.5, -R * 0.12 + Math.cos(boomAngle) * R * 0.5);
    c.stroke();

    // apparent wind arrow, pointing the way the wind is blowing
    c.save();
    c.rotate(-beta);
    c.strokeStyle = '#7ec8ff';
    c.fillStyle = '#7ec8ff';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(0, -R * 0.96);
    c.lineTo(0, -R * 0.66);
    c.stroke();
    c.beginPath();
    c.moveTo(0, -R * 0.60);
    c.lineTo(-5.5, -R * 0.74);
    c.lineTo(5.5, -R * 0.74);
    c.closePath();
    c.fill();
    c.restore();

    c.restore();

    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.font = '600 10px ui-monospace, monospace';
    c.textAlign = 'center';
    c.fillText(`AWA ${Math.abs((beta * 180) / Math.PI).toFixed(0)}° ${beta >= 0 ? 'P' : 'S'}`, cx, s - 2);
    c.fillText(`${(boat.apparent.speed * KNOTS).toFixed(0)} kn`, cx, 12);
  }
}
