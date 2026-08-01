import { clamp, angleDelta } from './utils.js';
import { waterDepthAt } from './waves.js';

/**
 * An autonomous helmsman.
 *
 * The interesting part of sailing a course is that you cannot steer at the
 * mark. Anything inside about 43 degrees of the true wind is unsailable, and
 * running dead downwind is slower than tacking downwind, so a skipper is
 * always solving the same problem: of the courses I *can* sail, which one
 * closes the mark fastest?
 *
 * So that is what this does. Every fifth of a second it sweeps a fan of
 * candidate headings and scores each one by velocity made good — boatspeed
 * from a rough polar, projected onto the bearing to the mark — then subtracts
 * two penalties: for sailing out of the corridor either side of the rhumb
 * line, and for the depth of water it would be sailing into. Beating and
 * gybing angles fall out of the polar rather than being hardcoded, the
 * corridor turns a beat into a converging zig-zag, and the depth term is what
 * keeps her off a lee shore that a bearing-follower would drive straight onto.
 *
 * It drives a Boat through the same {rudder, trim} interface the keyboard
 * uses, so the rival is sailing under exactly the physics the player is.
 */

const TACK_COOLDOWN = 9.0;   // seconds; a tack costs boatspeed, so do not spam them
const MARK_RADIUS = 24;
const REPLAN = 0.2;          // seconds between course decisions
const SWEEP = 16;            // candidate headings either side of the bearing
const SWEEP_STEP = 0.145;    // radians

/**
 * Fraction of best boatspeed against angle off the true wind. Close-hauled is
 * slow but points; a beam reach is quick; dead downwind is slow again, which
 * is the whole reason boats tack downwind.
 */
const POLAR_A = [0.75, 1.05, 1.31, 1.57, 1.92, 2.27, 2.62, 2.88, Math.PI];
const POLAR_V = [0.70, 0.86, 0.95, 1.00, 1.00, 0.94, 0.84, 0.74, 0.66];
function polar(a) {
  if (a < POLAR_A[0]) return 0;          // in the no-go zone: no speed at all
  for (let i = 1; i < POLAR_A.length; i++) {
    if (a <= POLAR_A[i]) {
      const t = (a - POLAR_A[i - 1]) / (POLAR_A[i] - POLAR_A[i - 1]);
      return POLAR_V[i - 1] + (POLAR_V[i] - POLAR_V[i - 1]) * t;
    }
  }
  return POLAR_V[POLAR_V.length - 1];
}

/** Depth probes along a candidate course: near ones matter most. */
const PROBES = [[26, 1.0], [60, 0.8], [110, 0.55], [190, 0.35]];
const SAFE_DEPTH = 13;

export class Skipper {
  constructor(boat, marks, opts = {}) {
    this.boat = boat;
    this.marks = marks;
    this.mark = 0;
    this.finished = false;
    this.finishTime = null;
    this.tack = opts.tack ?? -1;
    this.sinceTack = TACK_COOLDOWN;
    this.course = boat.heading;
    this.sincePlan = REPLAN;
    this.control = { rudder: 0, trim: 0 };
    boat.autoTrim = true;
  }

  /** How far she still has to sail, following the marks — the racing gap metric. */
  remaining() {
    if (this.finished) return 0;
    const b = this.boat;
    let d = Math.hypot(this.marks[this.mark].pos.x - b.position.x,
                       this.marks[this.mark].pos.y - b.position.z);
    for (let i = this.mark; i < this.marks.length - 1; i++) {
      d += this.marks[i].pos.distanceTo(this.marks[i + 1].pos);
    }
    return d;
  }

  update(dt, wind, time, other) {
    const b = this.boat;
    this.sinceTack += dt;
    this.sincePlan += dt;

    if (!this.finished) {
      const m = this.marks[this.mark];
      if (Math.hypot(m.pos.x - b.position.x, m.pos.y - b.position.z) < MARK_RADIUS) {
        this.mark++;
        if (this.mark >= this.marks.length) {
          this.mark = this.marks.length - 1;
          this.finished = true;
          this.finishTime = time;
        }
      }
    }

    if (this.sincePlan >= REPLAN) {
      this.sincePlan = 0;
      this.course = this.plan(wind);
    }

    // ---- helm --------------------------------------------------------------
    // Helm to starboard takes the heading down, so the whole command is
    // negated: this controller thinks in headings, the boat thinks in helm.
    let rudder = -(angleDelta(b.heading, this.course) * 1.9 - b.yawRate * 2.6);
    // caught head to wind with no steerage: hold the helm over on the tack she
    // was last on until the bow falls off and the sails fill again
    if (b.luffing > 0.6 && Math.abs(b.surge) < 0.55) rudder = -this.tack;
    rudder += this.avoidBoat(b, other);
    this.control.rudder = clamp(rudder, -1, 1);
    this.control.trim = 0;
    return this.control;
  }

  /** Pick the best sailable heading. */
  plan(wind) {
    const b = this.boat;
    const wf = wind.from;
    // race over: round up head to wind and sit there
    if (this.finished) return wf;

    const m = this.marks[this.mark];
    const ex = m.pos.x - b.position.x;
    const ez = m.pos.y - b.position.z;
    const dist = Math.hypot(ex, ez);
    const bearing = Math.atan2(ex, ez);

    // Cross-track on the axis square to the wind, with the mark at the origin.
    // The corridor narrows as the mark approaches, so a beat converges on the
    // layline instead of running off to the edge of the bay.
    const cross = -(ex * Math.cos(wf) + ez * -Math.sin(wf));
    const corridor = clamp(dist * 0.40, 22, 160);
    const over = Math.max(0, Math.abs(cross) - corridor) / Math.max(corridor, 1);
    const crossSign = Math.sign(cross) || 1;

    const stuck = b.aground > 0;
    const allowSwitch = this.sinceTack > TACK_COOLDOWN || stuck;
    // Never look for shoals beyond the mark she is trying to reach, and stop
    // caring about them entirely over the last thirty metres. Without both,
    // a mark laid anywhere near a shelf is one she circles forever, because
    // the water behind it always scores worse than turning away.
    const look = Math.max(PROBES[0][0], dist - 12);
    const commit = clamp((dist - 30) / 60, 0, 1);

    let best = this.course, bestScore = -Infinity, bestSide = this.tack;
    for (let k = -SWEEP; k <= SWEEP; k++) {
      const h = bearing + k * SWEEP_STEP;
      const rel = angleDelta(wf, h);
      const v = polar(Math.abs(rel));
      if (v <= 0) continue;                       // she cannot sail this angle

      const side = rel >= 0 ? 1 : -1;
      if (!allowSwitch && side !== this.tack) continue;

      let score;
      if (stuck) {
        // aground: getting off the shelf is the only objective that matters
        score = -this.risk(b, h, 1e9) * 3.0 + v * 0.2;
      } else {
        score = v * Math.cos(angleDelta(h, bearing)) - this.risk(b, h, look) * 1.5 * commit;
        if (side === this.tack) score += 0.08;    // hysteresis, so she settles
        if (over > 0) {
          const drift = Math.sin(rel);            // rate the cross-track grows
          score -= Math.min(over, 3) * Math.max(0, drift * crossSign) * 1.2;
        }
      }
      if (score > bestScore) { bestScore = score; best = h; bestSide = side; }
    }

    if (bestSide !== this.tack) { this.tack = bestSide; this.sinceTack = 0; }
    return best;
  }

  /** How much shallow water a course would sail into, 0 (clear) upward. */
  risk(b, h, look) {
    const s = Math.sin(h), c = Math.cos(h);
    let r = 0;
    for (const [d, w] of PROBES) {
      if (d > look) break;
      const depth = waterDepthAt(b.position.x + s * d, b.position.z + c * d);
      if (depth < SAFE_DEPTH) r += w * (1 - depth / SAFE_DEPTH);
    }
    return r;
  }

  /** Basic good manners: do not sail through the other boat. */
  avoidBoat(b, other) {
    if (!other) return 0;
    const dx = other.position.x - b.position.x;
    const dz = other.position.z - b.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 30 || d < 1e-3) return 0;
    const rel = angleDelta(b.heading, Math.atan2(dx, dz));
    if (Math.abs(rel) > 1.2) return 0;            // already past, or astern
    return Math.sign(rel || 1) * (1 - d / 30) * 0.85;
  }
}
