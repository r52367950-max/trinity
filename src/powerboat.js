import * as THREE from 'three';
import { applyAtmosphere } from './materials.js';
import { sampleOcean } from './waves.js';
import { terrainHeight } from './terrain.js';
import { clamp, damp, smoothstep, mergeGeometries, prepare, trs } from './utils.js';

/**
 * Kingfisher — a 7 metre electric centre-console dayboat.
 *
 * She exists to be the opposite of the sloop. Where the yacht is a negotiation
 * with the wind, this is a throttle: instant torque, no trim to think about,
 * and a hull that changes character halfway up the rev range.
 *
 * That change is the whole point of the physics here. Below about 11 knots she
 * is pushing water aside and dragging a growing wave with her — the resistance
 * hump — and the bow rides up as she climbs it. Get through it and the hull
 * lifts onto its own bottom, the wetted area collapses, drag falls even as
 * speed rises, and she settles level and goes. Turning is thrust vectoring off
 * the outboard rather than a rudder, so she steers on the throttle and leans
 * *into* a turn, the way a planing boat does and a sailboat never does.
 *
 * The battery is the price. Ten minutes flat out, and it trickles back while
 * she idles.
 */

const RHO_WATER = 1025;

export const P_LOA = 7.0;
const P_BEAM = 2.48;
const P_MASS = 1650;          // kg, batteries included
const P_IZ = 5200;
const MAX_THRUST = 4200;      // N at the transom
const THRUST_ARM = 3.3;       // metres aft of the centre of lateral resistance

// hull resistance: (drag coefficient x reference area), displacing vs planing
const CDA_DISPLACE = 0.092;
const CDA_PLANING = 0.040;   // thrust / this sets the top end: about 28 knots

const BATTERY_FULL_RANGE = 620;   // seconds at full throttle
const BATTERY_TRICKLE = 1 / 4200; // solar, per second, while idle

// ---------------------------------------------------------------------------
// hull lines: a hard-chine deep-V
// ---------------------------------------------------------------------------

/** Half-beam at station t (0 = transom, 1 = stem). Planing hulls carry it aft. */
function pBeam(t) {
  const shape = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.52))), 0.40);
  const transom = 0.93 * (1 - smoothstep(0.0, 0.16, t));
  return (P_BEAM / 2) * Math.max(shape, transom);
}
/**
 * Depth of the keel below the static waterline. Positive aft, negative forward:
 * the forefoot lifts clear, which is why she can be driven into a chop at all.
 */
function pKeel(t) {
  return 0.34 + 0.14 * Math.sin(Math.PI * t * 0.9) - 0.72 * smoothstep(0.70, 1.0, t);
}
/** Deadrise — the V angle of the bottom. Flat aft for lift, sharp forward for ride. */
function pDeadrise(t) {
  return (19 + 33 * Math.pow(t, 1.55)) * Math.PI / 180;
}
function pSheer(t) {
  return 0.86 + 0.54 * Math.pow(t, 2.2);
}
function pFlare(t) {
  return 0.09 + 0.30 * smoothstep(0.45, 1.0, t);
}

const CHINE = 0.62;   // fraction of the girth that is bottom rather than topside

/**
 * One station's section, from keel (s=0) round to sheer (s=1), with a hard
 * knuckle at the chine. That knuckle is not decoration: it is the edge the
 * water separates from, and it is what makes a planing boat read as one.
 */
function pSection(t, s) {
  const B = pBeam(t), D = pKeel(t), S = pSheer(t), fl = pFlare(t);
  const chineY = -D + B * Math.tan(pDeadrise(t));
  if (s <= CHINE) {
    const f = s / CHINE;
    return [B * f, -D + (chineY + D) * f];
  }
  const f = (s - CHINE) / (1 - CHINE);
  // the topside rolls outboard as it rises, and eases onto the sheer
  const e = f * f * (3 - 2 * f);
  return [B * (1 + fl * e), chineY + (S - chineY) * e];
}

function stationZ(t, y) {
  return (t - 0.5) * P_LOA + 0.30 * smoothstep(0.70, 1.0, t) * Math.max(0, y);
}

function buildPowerHull(livery) {
  const NS = 44, NG = 18;
  const pos = [], col = [], idx = [];
  let base = 0;

  const cTop = new THREE.Color(livery.topside);
  const cAccent = new THREE.Color(livery.accent);
  const cBoot = new THREE.Color(livery.boot);
  const cAnti = new THREE.Color(livery.anti);
  const cSole = new THREE.Color(livery.sole);
  const cLiner = new THREE.Color(livery.liner);

  const push = (x, y, z, c) => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
    return base++;
  };
  const quad = (a, b, c, d, flip) => {
    if (flip) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  };

  const hullColor = (y, S) => {
    if (y < -0.05) return cAnti;
    if (y < 0.05) return cBoot;
    // a single broad accent sweep just under the sheer, the way a dayboat is wrapped
    const d = S - y;
    if (d > 0.10 && d < 0.42) return cAccent;
    return cTop;
  };

  // ---- shell ----
  const grid = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const row = [];
    for (let j = 0; j <= NG; j++) {
      const [x, y] = pSection(t, j / NG);
      row.push([x, y, stationZ(t, y)]);
    }
    grid.push(row);
  }
  for (const side of [1, -1]) {
    const start = base;
    for (let i = 0; i <= NS; i++) {
      const S = pSheer(i / NS);
      for (const [x, y, z] of grid[i]) push(x * side, y, z, hullColor(y, S));
    }
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NG; j++) {
        const a = start + i * (NG + 1) + j;
        quad(a, a + 1, a + (NG + 1), a + (NG + 2), side < 0);
      }
    }
  }

  // ---- transom, ruled straight across ----
  {
    const start = base;
    const S = pSheer(0);
    for (const [x, y, z] of grid[0]) {
      const c = hullColor(y, S);
      push(x, y, z, c);
      push(-x, y, z, c);
    }
    for (let j = 0; j < NG; j++) {
      const s0 = start + j * 2;
      idx.push(s0, s0 + 1, s0 + 2, s0 + 1, s0 + 3, s0 + 2);
    }
  }

  // ---- deck, cockpit liner and sole ----
  // Forward of tFore the deck closes over into a foredeck; aft of it there are
  // side decks with a well between them, which is what makes her a boat you
  // stand *in* rather than a solid lozenge with furniture on top.
  const T_FORE = 0.62;
  const INSET = 0.30;
  const SOLE_Y = 0.42;

  // The side deck's inner edge closes onto the sheer at the stem, so the band
  // narrows to nothing there instead of crossing over itself.
  const inner = (t) => {
    const S = pSheer(t);
    const ox = pSection(t, 1)[0];
    return [ox - INSET * smoothstep(1.0, 0.86, t), S - 0.03, stationZ(t, S)];
  };

  // side decks, both sides, transom to bow
  for (const side of [1, -1]) {
    const start = base;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      const S = pSheer(t);
      const ox = pSection(t, 1)[0];
      const [ix, iy, iz] = inner(t);
      push(ox * side, S, stationZ(t, S), cTop);
      push(ix * side, iy, iz, cTop);
    }
    for (let i = 0; i < NS; i++) {
      const a = start + i * 2;
      quad(a, a + 1, a + 2, a + 3, side < 0);
    }
  }

  // foredeck: span the two inner edges forward of the cut
  {
    const start = base;
    const NW = 7;
    let rows = 0;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      if (t < T_FORE) continue;
      const [ix, iy, iz] = inner(t);
      for (let j = 0; j <= NW; j++) {
        const f = (j / NW) * 2 - 1;
        push(ix * f, iy + (1 - f * f) * 0.07, iz, cTop);
      }
      rows++;
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let j = 0; j < NW; j++) {
        const a = start + r * (NW + 1) + j;
        idx.push(a, a + (NW + 1), a + 1, a + 1, a + (NW + 1), a + NW + 2);
      }
    }
  }

  // cockpit liner: the inner wall from the side deck down to the sole
  for (const side of [1, -1]) {
    const start = base;
    let rows = 0;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      if (t > T_FORE) break;
      const [ix, iy, iz] = inner(t);
      push(ix * side, iy, iz, cLiner);
      push((ix - 0.05) * side, SOLE_Y, iz, cLiner);
      rows++;
    }
    for (let r = 0; r < rows - 1; r++) {
      const a = start + r * 2;
      quad(a, a + 1, a + 2, a + 3, side < 0);
    }
  }

  // bulkheads closing the well off fore and aft, so you cannot see out
  // through the transom or under the foredeck
  for (const [t, faceAft] of [[T_FORE, true], [0, false]]) {
    const [ix, iy, iz] = inner(t);
    const a = push(-(ix - 0.05), SOLE_Y, iz, cLiner);
    const b = push(ix - 0.05, SOLE_Y, iz, cLiner);
    const c = push(-ix, iy, iz, cLiner);
    const d = push(ix, iy, iz, cLiner);
    if (faceAft) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  }

  // sole
  {
    const start = base;
    let rows = 0;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      if (t > T_FORE) break;
      const [ix, , iz] = inner(t);
      const w = ix - 0.05;
      // a hint of plank line, so the sole is not one flat slab of colour
      const c = _pc.copy(cSole).multiplyScalar(i % 2 ? 0.94 : 1.05);
      push(-w, SOLE_Y, iz, c);
      push(w, SOLE_Y, iz, c);
      rows++;
    }
    for (let r = 0; r < rows - 1; r++) {
      const a = start + r * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tube(points, radius = 0.021) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, 6, false);
}

const _pc = new THREE.Color();

export const KINGFISHER = {
  topside: 0xf2f1ec, accent: 0x1f6f86, boot: 0x141a20, anti: 0x1a2b33,
  sole: 0x9d7f55, liner: 0xe6e4de,
};

// ---------------------------------------------------------------------------

export class Powerboat {
  constructor(scene, opts = {}) {
    this.name = opts.name || 'Kingfisher';
    this.livery = opts.livery || KINGFISHER;

    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);

    this.position = new THREE.Vector3(0, 0, 0);
    if (opts.position) this.position.copy(opts.position);
    this.heading = opts.heading ?? 0;
    this.surge = 0;
    this.sway = 0;
    this.yawRate = 0;
    this.roll = 0;
    this.rollRate = 0;
    this.pitch = 0;
    this.waveRoll = 0;
    this.steer = 0;
    this.throttle = 0;          // -0.4 (astern) .. 1
    this.battery = 1.0;
    this.planing = 0;
    this.aground = 0;
    this.moored = true;
    this.chaseAim = 1.4;

    this.build();
  }

  build() {
    const L = this.livery;
    const gloss = applyAtmosphere(new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.22, metalness: 0.0,
      clearcoat: 0.95, clearcoatRoughness: 0.08,
    }));
    const matte = applyAtmosphere(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.7, metalness: 0.0,
    }));
    const metal = applyAtmosphere(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.28, metalness: 0.88,
    }));

    const STEEL = 0xd2d5d8, ALLOY = 0xb9bcc0, DARK = 0x1e2126, GLASS = 0x2e4652;
    const CUSHION = 0xe8e5dd, GRP = 0xf2f1ec;

    const parts = { gloss: [], matte: [], metal: [] };
    const put = (bucket, geo, matrix, color) => {
      parts[bucket].push(color === undefined ? keepColors(geo, matrix) : prepare(geo, matrix, color));
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);

    put('gloss', buildPowerHull(L), null);

    // ---- rubbing strake, the black band a workboat wears round the sheer ----
    {
      const NS = 44, pos = [], idx = [];
      let n = 0;
      for (const side of [1, -1]) {
        const start = n;
        for (let i = 0; i <= NS; i++) {
          const t = i / NS;
          const S = pSheer(t);
          const [ox] = pSection(t, 1);
          const z = stationZ(t, S);
          pos.push(ox * side, S - 0.11, z, (ox + 0.045) * side, S - 0.055, z, ox * side, S, z);
          n += 3;
        }
        for (let i = 0; i < NS; i++) {
          for (let k = 0; k < 2; k++) {
            const a = start + i * 3 + k;
            if (side > 0) idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
            else idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      put('matte', g, null, DARK);
    }

    // ---- centre console ----
    this.consoleZ = -0.15;
    put('gloss', box(0.86, 0.72, 0.62), trs(0, 0.80, this.consoleZ), GRP);
    put('gloss', box(0.94, 0.10, 0.70), trs(0, 1.19, this.consoleZ), GRP);
    put('matte', box(0.72, 0.30, 0.05), trs(0, 1.07, this.consoleZ - 0.29, 0.32, 0, 0), DARK);   // dash
    put('gloss', box(0.86, 0.42, 0.03), trs(0, 1.42, this.consoleZ - 0.20, 0.26, 0, 0), GLASS);  // windscreen
    put('metal', box(0.90, 0.04, 0.04), trs(0, 1.63, this.consoleZ - 0.29), STEEL);              // screen frame
    put('metal', tube([[-0.40, 1.25, this.consoleZ + 0.30], [-0.40, 1.44, this.consoleZ + 0.24],
                       [0.40, 1.44, this.consoleZ + 0.24], [0.40, 1.25, this.consoleZ + 0.30]], 0.020), null, STEEL);
    // throttle lever, on the starboard side of the console where a hand falls
    put('metal', cyl(0.018, 0.022, 0.26, 6), trs(0.50, 1.10, this.consoleZ + 0.02, -0.35, 0, 0), ALLOY);
    put('matte', new THREE.SphereGeometry(0.042, 8, 6), trs(0.50, 1.22, this.consoleZ - 0.04), DARK);

    // ---- seating ----
    // leaning post behind the console
    put('gloss', box(0.94, 0.44, 0.34), trs(0, 0.64, -0.92), GRP);
    put('matte', box(0.92, 0.13, 0.40), trs(0, 0.92, -0.94), CUSHION);
    put('matte', box(0.92, 0.36, 0.12), trs(0, 1.10, -1.14), CUSHION);
    // aft bench across the transom
    put('gloss', box(1.70, 0.40, 0.30), trs(0, 0.62, -2.92), GRP);
    put('matte', box(1.66, 0.12, 0.36), trs(0, 0.88, -2.94), CUSHION);
    // bow sun pad on the foredeck
    put('matte', box(1.10, 0.13, 1.50), trs(0, 1.32, 1.85), CUSHION);

    // ---- swim platform, ladder, and the battery hatch ----
    put('gloss', box(1.40, 0.09, 0.52), trs(0, 0.62, -P_LOA / 2 - 0.20), GRP);
    put('metal', tube([[0.30, 0.60, -P_LOA / 2 - 0.40], [0.30, 0.10, -P_LOA / 2 - 0.46],
                       [-0.30, 0.10, -P_LOA / 2 - 0.46], [-0.30, 0.60, -P_LOA / 2 - 0.40]], 0.018), null, STEEL);
    put('matte', box(0.70, 0.02, 0.90), trs(0, 0.435, -1.90), 0x8a6f4a);

    // ---- rails, cleats, lights ----
    const bowY = pSheer(0.94) - 0.02;
    put('metal', tube([
      [0.44, bowY, 2.30], [0.42, bowY + 0.52, 2.62], [0.18, bowY + 0.55, 3.10],
      [-0.18, bowY + 0.55, 3.10], [-0.42, bowY + 0.52, 2.62], [-0.44, bowY, 2.30],
    ], 0.019), null, STEEL);
    for (const [x, z] of [[0.92, 2.55], [-0.92, 2.55], [1.06, -2.55], [-1.06, -2.55]]) {
      put('metal', cyl(0.024, 0.024, 0.17, 6), trs(x, pSheer(0.5) + 0.02, z, 0, 0, Math.PI / 2), ALLOY);
    }
    // local +X is port, so that is where the red one goes
    put('matte', box(0.07, 0.07, 0.10), trs(0.50, bowY + 0.05, 2.98), 0xc03a2c);
    put('matte', box(0.07, 0.07, 0.10), trs(-0.50, bowY + 0.05, 2.98), 0x2f9e56);
    // a stubby radar arch aft, which is where the antennas and the light live
    for (const s of [1, -1]) {
      put('metal', cyl(0.036, 0.042, 0.95, 8), trs(s * 0.78, 1.32, -2.10, -0.10, 0, s * 0.10), ALLOY);
    }
    put('metal', box(1.72, 0.09, 0.11), trs(0, 1.80, -2.02), ALLOY);
    put('metal', cyl(0.014, 0.014, 0.70, 6), trs(0.62, 2.18, -2.02), ALLOY);

    for (const [bucket, mat] of [['gloss', gloss], ['matte', matte], ['metal', metal]]) {
      if (!parts[bucket].length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(parts[bucket]), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }

    // ---- wheel, which turns ----
    this.wheel = new THREE.Group();
    this.wheel.position.set(0, 1.12, this.consoleZ - 0.32);
    this.wheel.rotation.x = 0.32;
    this.root.add(this.wheel);
    const wheelParts = [
      prepare(new THREE.TorusGeometry(0.16, 0.022, 6, 18), null, DARK),
      prepare(cyl(0.030, 0.030, 0.09, 8), trs(0, 0, 0.03, Math.PI / 2, 0, 0), ALLOY),
    ];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      wheelParts.push(prepare(box(0.028, 0.15, 0.018), trs(Math.sin(a) * 0.08, Math.cos(a) * 0.08, 0, 0, 0, -a), ALLOY));
    }
    const wheel = new THREE.Mesh(mergeGeometries(wheelParts), metal);
    wheel.castShadow = true;
    this.wheel.add(wheel);

    // ---- electric outboard, which steers ----
    this.drive = new THREE.Group();
    this.drive.position.set(0, 0.94, -P_LOA / 2 - 0.06);
    this.root.add(this.drive);
    const driveParts = [
      prepare(box(0.40, 0.60, 0.46), trs(0, -0.12, -0.18), 0x2b2f36),                    // cowling
      prepare(box(0.16, 0.86, 0.28), trs(0, -0.78, -0.10), 0x2b2f36),                    // leg
      prepare(new THREE.CapsuleGeometry(0.085, 0.36, 4, 10), trs(0, -1.24, -0.06, Math.PI / 2, 0, 0), 0x24272c),
      prepare(box(0.03, 0.24, 0.30), trs(0, -1.06, 0.06), 0x24272c),                     // anti-cavitation plate
    ];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      driveParts.push(prepare(box(0.045, 0.20, 0.09),
        trs(Math.sin(a) * 0.10, -1.24 + Math.cos(a) * 0.10, -0.26, 0.5, 0, -a), 0xb0b4b8));
    }
    const drive = new THREE.Mesh(mergeGeometries(driveParts), matte);
    drive.castShadow = true;
    this.drive.add(drive);

    // where the driver's eyes are: standing at the console
    this.helm = new THREE.Group();
    this.helm.position.set(0, 1.88, this.consoleZ - 0.62);
    this.root.add(this.helm);
  }

  get forward() { return _pf.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  get starboard() { return _ps.set(Math.cos(this.heading), 0, -Math.sin(this.heading)); }
  get speed() { return Math.abs(this.surge); }
  /** The camera braces against lean the same way whatever it is standing on. */
  get heel() { return this.roll; }

  /** One physics substep. `input` is the same {rudder, trim} the sailboat takes. */
  update(dt, input, time) {
    const fwd = _p1.copy(this.forward);
    const stb = _p2.copy(this.starboard);

    // ---- throttle: W forward, S back, Space to centre ---------------------
    if (input) {
      // input.trim is +1 on S and -1 on W, which is "ease" and "sheet in" on
      // the yacht and reads naturally as back and forward on a lever
      this.throttle = clamp(this.throttle - input.trim * dt * 0.85, -0.40, 1);
      if (input.neutral) this.throttle = damp(this.throttle, 0, 9, dt);
      this.steer = damp(this.steer, clamp(input.rudder, -1, 1), 6, dt);
    }

    // ---- battery ----------------------------------------------------------
    const demand = Math.abs(this.throttle);
    if (demand > 0.02) {
      this.battery = Math.max(0, this.battery - (Math.pow(demand, 1.4) / BATTERY_FULL_RANGE) * dt);
    } else {
      this.battery = Math.min(1, this.battery + BATTERY_TRICKLE * dt);
    }
    // a flat pack still limps home rather than leaving you adrift
    const derate = this.battery > 0.02 ? 1 : 0.22;

    // ---- thrust and resistance --------------------------------------------
    const u = this.surge;
    const speed = Math.abs(u);
    this.planing = smoothstep(5.5, 10.5, speed);
    const thrust = this.throttle * MAX_THRUST * derate * (this.aground > 0 ? 0.25 : 1);

    // the resistance hump: the wave she is dragging peaks just before she lifts
    const hump = 0.048 * Math.exp(-Math.pow((speed - 6.2) / 2.7, 2));
    const cda = CDA_DISPLACE + (CDA_PLANING - CDA_DISPLACE) * this.planing + hump;
    const resist = 0.5 * RHO_WATER * cda * u * speed;
    // a planing hull slides far less sideways than a keelboat, and less still
    // once the chines are engaged
    const swayResist = 0.5 * RHO_WATER * (2.6 - 1.2 * this.planing) * this.sway * Math.abs(this.sway);

    const groundDrag = this.aground > 0 ? 5200 : 0;
    this.surge += ((thrust - resist - Math.sign(u) * groundDrag) / P_MASS) * dt;
    this.sway += (-swayResist / P_MASS) * dt;
    this.surge = clamp(this.surge, -4, 16);
    this.sway = clamp(this.sway, -5, 5);

    // ---- steering: thrust vectoring, plus what the skeg gives at speed -----
    // negated for the same reason the yacht's is: local +X is port, so helm to
    // starboard has to take the heading down
    const vector = -Math.sin(this.steer * 0.62);
    let yawMoment = (Math.abs(thrust) * Math.sign(u >= 0 ? 1 : -1) + 500) * vector * THRUST_ARM;
    yawMoment += vector * 0.5 * RHO_WATER * 0.30 * u * speed * 1.6;      // skeg
    yawMoment += -this.yawRate * (7000 + 5200 * speed);
    this.yawRate += (yawMoment / P_IZ) * dt;
    this.heading += this.yawRate * dt;

    // the turn throws her outward; the hull resists most of it
    this.sway += -this.yawRate * u * dt * 0.55;

    // ---- move --------------------------------------------------------------
    this.position.addScaledVector(fwd, this.surge * dt);
    this.position.addScaledVector(stb, this.sway * dt);

    const bed = terrainHeight(this.position.x, this.position.z);
    if (bed > -0.9) {
      this.aground = 1;
      const gx = terrainHeight(this.position.x + 2, this.position.z) - bed;
      const gz = terrainHeight(this.position.x, this.position.z + 2) - bed;
      this.position.x -= gx * dt * 16;
      this.position.z -= gz * dt * 16;
      this.surge *= 0.88;
    } else {
      this.aground = Math.max(0, this.aground - dt);
    }

    if (this.throttle > 0.03 || speed > 0.4) this.moored = false;
  }

  /** Buoyancy, attitude and the two moving parts. Once a frame. */
  updateVisual(dt, time) {
    const fwd = _p1.copy(this.forward);
    const stb = _p2.copy(this.starboard);

    const s0 = sampleOcean(this.position.x, this.position.z, time, _q0);
    const nose = _p3.copy(fwd).multiplyScalar(P_LOA * 0.40);
    const s1 = sampleOcean(this.position.x + nose.x, this.position.z + nose.z, time, _q1);
    const s2 = sampleOcean(this.position.x - nose.x, this.position.z - nose.z, time, _q2);
    const side = _p4.copy(stb).multiplyScalar(P_BEAM * 0.5);
    const s3 = sampleOcean(this.position.x + side.x, this.position.z + side.z, time, _q3);
    const s4 = sampleOcean(this.position.x - side.x, this.position.z - side.z, time, _q4);

    const ride = s0.y * 0.45 + (s1.y + s2.y) * 0.2 + (s3.y + s4.y) * 0.075;
    // on the plane she skims across the tops instead of following every trough
    const follow = 1 - this.planing * 0.55;
    const wavePitch = Math.atan2(s1.y - s2.y, P_LOA * 0.80) * follow;
    const waveRoll = Math.atan2(s3.y - s4.y, P_BEAM) * follow;

    this.position.y = damp(this.position.y, ride - 0.10 + this.planing * 0.20, 15, dt);

    // Bow rise: highest climbing the hump, then she levels out on the plane.
    // Negative pitch is bow-up, because the camera's +X rotation puts it down.
    const rise = 0.17 * Math.exp(-Math.pow((Math.abs(this.surge) - 6.4) / 3.2, 2)) + 0.030 * this.planing;
    this.pitch = damp(this.pitch, -wavePitch * 0.7 - rise, 7, dt);

    // and she banks *into* the turn, unlike anything with a keel
    const targetRoll = clamp(this.yawRate * this.surge * 0.075, -0.30, 0.30);
    this.rollRate += (9.0 * (targetRoll - this.roll) - 4.2 * this.rollRate) * dt;
    this.roll += this.rollRate * dt;
    this.waveRoll = damp(this.waveRoll, waveRoll * 0.7, 6, dt);

    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;
    this.root.rotation.x = this.pitch;
    this.root.rotation.z = -(this.roll + this.waveRoll);

    this.wheel.rotation.z = this.steer * 2.4;
    // the leg kicks its foot to starboard, which shoves the stern to port and
    // the bow to starboard
    this.drive.rotation.y = this.steer * 0.62;
    // the leg lifts a little on the plane, the way trim tabs and trim do
    this.drive.rotation.x = this.planing * 0.10;
  }
}

/** Keep a geometry's own vertex colours while making it merge-compatible. */
function keepColors(geometry, matrix) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (matrix) g.applyMatrix4(matrix);
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  }
  g.deleteAttribute('tangent');
  return g;
}

const _pf = new THREE.Vector3();
const _ps = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _p4 = new THREE.Vector3();
const mkq = () => ({ y: 0, normal: new THREE.Vector3(), fold: 1 });
const _q0 = mkq(), _q1 = mkq(), _q2 = mkq(), _q3 = mkq(), _q4 = mkq();
