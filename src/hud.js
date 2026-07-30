import { KNOTS } from './shared.js';

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

  update(state) {
    const { boat, wind, boomAngle, tackSign, time } = state;

    this.el.speed.textContent = (boat.surge * KNOTS).toFixed(1);
    const hdg = ((boat.heading * 180) / Math.PI + 360) % 360;
    this.el.heading.textContent = hdg.toFixed(0).padStart(3, '0') + '°';
    this.el.wind.textContent = `${(wind.speed * KNOTS).toFixed(0)} kn`;

    const trimPct = Math.round(boat.mainTrim * 100);
    this.el.trimBar.style.width = trimPct + '%';
    this.el.trimLabel.textContent = boat.autoTrim ? 'AUTO' : trimPct + '%';
    this.el.heelLabel.textContent = `${Math.abs((boat.heel * 180) / Math.PI).toFixed(0)}° ${boat.heel > 0.01 ? 'STBD' : boat.heel < -0.01 ? 'PORT' : ''}`;

    let status = '';
    if (boat.aground > 0) status = 'AGROUND';
    else if (boat.luffing > 0.5) status = Math.abs(boat.apparent.angle) < 0.6 ? 'IN IRONS' : 'LUFFING';
    else if (boat.surge * KNOTS > 6.5) status = 'MAKING WAY';
    this.el.status.textContent = status;
    this.el.status.className = status === 'AGROUND' ? 'bad' : status === 'IN IRONS' || status === 'LUFFING' ? 'warn' : 'good';

    if (this._toastUntil && performance.now() / 1000 > this._toastUntil) {
      this.el.toast.classList.remove('show');
      this._toastUntil = 0;
    }

    this.drawDial(boat, wind, boomAngle, tackSign, time);
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

    // boom
    c.strokeStyle = boat.luffing > 0.5 ? '#e4a34a' : '#8fe0b0';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, -R * 0.12);
    c.lineTo(-Math.sin(boomAngle) * R * 0.5, -R * 0.12 + Math.cos(boomAngle) * R * 0.5);
    c.stroke();

    // apparent wind arrow, pointing the way the wind is blowing
    const wa = beta;
    c.save();
    c.rotate(wa);
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
    c.fillText(`AWA ${Math.abs((beta * 180) / Math.PI).toFixed(0)}° ${beta >= 0 ? 'S' : 'P'}`, cx, s - 2);
    c.fillText(`${(boat.apparent.speed * KNOTS).toFixed(0)} kn`, cx, 12);
  }
}
