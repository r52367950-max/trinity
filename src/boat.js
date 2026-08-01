import * as THREE from 'three';
import { applyAtmosphere } from './materials.js';
import { sampleOcean } from './waves.js';
import { terrainHeight } from './terrain.js';
import { clamp, damp, smoothstep, mergeGeometries, prepare, trs } from './utils.js';

/**
 * A 9.5 metre sloop, and enough sailing physics to make her feel like one.
 *
 * Forces come from apparent wind rather than true wind, so the boat
 * accelerates into her own headwind, points higher as she speeds up, and
 * genuinely cannot sail closer than about 40 degrees off the breeze. Lift and
 * drag are taken from a flat-plate model of the sail, which gives lift-driven
 * beating and reaching and drag-driven running out of the same equations.
 *
 * Everything on deck that never moves relative to the hull is baked into three
 * merged meshes — glossy paint, matte joinery, bright metal — so a fully
 * detailed yacht costs three draw calls instead of forty. That matters here
 * because every boat is drawn three times a frame: once for the camera, once
 * into the water's mirror, once into its refraction buffer.
 */

const RHO_AIR = 1.225;
const RHO_WATER = 1025;
const G = 9.81;

export const LOA = 9.5;       // length overall
const LWL = 8.4;              // waterline length
export const BEAM = 3.05;
const MASS = 3200;            // kg displacement
const IZ = 21000;             // yaw inertia
const SAIL_AREA = 42;         // main + jib
const CE_HEIGHT = 5.0;        // centre of effort above the lateral centre
const GM = 1.15;              // metacentric height
const HULL_SPEED = 1.34 * Math.sqrt(LWL * 3.28084) / 1.94384; // m/s

/**
 * Paint schemes. Only the hull, the sailcloth and the burgee change between
 * boats; the deck gear is the same chandlery on both.
 */
export const LIVERIES = {
  player: {
    topside: 0xf0efea, sheerStripe: 0x9c3a2d, cove: 0xc7a24c,
    boot: 0x161d26, anti: 0x1d3350, deck: 0xae8b5d,
    sail: 0xdedad0, sailNumber: 'SUI 6', burgee: 0xd94a3d,
  },
  rival: {
    topside: 0x1f3a56, sheerStripe: 0xd6c489, cove: 0xe4e2dc,
    boot: 0x0e1620, anti: 0x143028, deck: 0x9a7f57,
    sail: 0xd6d1c3, sailNumber: 'FRA 9', burgee: 0xf0b45c,
  },
};

// ---------------------------------------------------------------------------
// hull lines
// ---------------------------------------------------------------------------

/** Half-beam at station t (0 = transom, 1 = stem). Widest just aft of amidships. */
function beamAt(t) {
  const shape = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.70))), 0.58);
  const transom = 0.62 * (1 - smoothstep(0.0, 0.20, t));
  return (BEAM / 2) * Math.max(shape, transom);
}
/** Depth of the canoe body below the waterline. */
function depthAt(t) {
  return 0.28 + 0.56 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.58))), 0.55);
}
/** Sheer height above the waterline — the curve that gives a hull its face. */
function sheerAt(t) {
  return 0.84 + 0.62 * Math.pow(t, 2.4) + 0.10 * Math.pow(1 - t, 2.2);
}
/**
 * How much the topsides lean outboard. Positive forward, so the bow sections
 * flare and throw spray clear; slightly negative aft, which is the tumblehome
 * that keeps a wide stern from looking like a box.
 */
function flareAt(t) {
  return 0.22 * smoothstep(0.52, 1.0, t) - 0.08 * smoothstep(0.42, 0.02, t);
}

function buildHull(livery) {
  const NS = 52, NG = 16, NW = 9;
  const pos = [];
  const col = [];
  const idx = [];

  const cTop = new THREE.Color(livery.topside);
  const cSheer = new THREE.Color(livery.sheerStripe);
  const cCove = new THREE.Color(livery.cove);
  const cBoot = new THREE.Color(livery.boot);
  const cAnti = new THREE.Color(livery.anti);
  const cDeck = new THREE.Color(livery.deck);
  const cMargin = new THREE.Color(0xeceae4);

  // ---- station grid ----
  const grid = [];
  const sheers = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const B = beamAt(t), D = depthAt(t), S = sheerAt(t), fl = flareAt(t);
    const z0 = (t - 0.5) * LOA;
    const row = [];
    for (let j = 0; j <= NG; j++) {
      const a = (j / NG) * Math.PI / 2;
      let x = B * Math.pow(Math.sin(a), 0.74);
      const y = -D * Math.pow(Math.cos(a), 1.75) + (S + D) * Math.pow(Math.sin(a), 2.35);
      // flare and tumblehome act on the topsides only, never on the canoe body
      const above = clamp(y / Math.max(S, 0.001), 0, 1);
      x *= 1 + fl * above * above;
      // the stem overhangs forward and the transom leans aft, both with height
      const z = z0
        + 0.24 * smoothstep(0.74, 1.0, t) * Math.max(0, y)
        - 0.32 * smoothstep(0.18, 0.0, t) * Math.max(0, y);
      row.push(new THREE.Vector3(x, y, z));
    }
    // land the outermost girth point exactly on the sheer line
    const dy = S - row[NG].y;
    for (let j = 0; j <= NG; j++) row[j].y += dy * Math.pow(j / NG, 1.6);
    grid.push(row);
    sheers.push(S);
  }

  let base = 0;
  const push = (v, c) => {
    pos.push(v.x, v.y, v.z);
    col.push(c.r, c.g, c.b);
    return base++;
  };

  /**
   * Topside paint, read off the distance below the sheer rather than off an
   * absolute height — that is what makes the cove stripe follow the sheer
   * spring instead of cutting across it.
   */
  const hullColor = (y, S) => {
    if (y < -0.055) return cAnti;
    if (y < 0.055) return cBoot;
    const d = S - y;
    if (d < 0.05) return cSheer;
    if (Math.abs(d - 0.30) < 0.021) return cCove;
    return cTop;
  };

  // ---- shell, both sides ----
  for (const side of [1, -1]) {
    const start = base;
    for (let i = 0; i <= NS; i++) {
      for (let j = 0; j <= NG; j++) {
        const v = grid[i][j];
        push(_bv.set(v.x * side, v.y, v.z), hullColor(v.y, sheers[i]));
      }
    }
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NG; j++) {
        const a = start + i * (NG + 1) + j;
        const b = a + 1, c = a + (NG + 1), d = c + 1;
        if (side > 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
  }

  // ---- transom: a ruled surface straight across the aftmost station ----
  {
    const start = base;
    const row = grid[0];
    for (let j = 0; j <= NG; j++) {
      const v = row[j];
      const c = hullColor(v.y, sheers[0]);
      push(_bv.set(v.x, v.y, v.z), c);
      push(_bv.set(-v.x, v.y, v.z), c);
    }
    for (let j = 0; j < NG; j++) {
      const s0 = start + j * 2, p0 = s0 + 1, s1 = s0 + 2, p1 = s0 + 3;
      idx.push(s0, p0, s1, p0, p1, s1);
    }
  }

  // ---- deck: span the two sheer lines with a cambered surface ----
  {
    const start = base;
    for (let i = 0; i <= NS; i++) {
      const outer = grid[i][NG];
      for (let j = 0; j <= NW; j++) {
        const f = (j / NW) * 2 - 1;                    // -1 port .. +1 starboard
        const edge = Math.abs(f);
        const camber = (1 - f * f) * 0.10;
        // nonskid in the middle, a painted margin at the toe rail, and the
        // faint plank lines of a laid teak deck
        const c = edge > 0.86
          ? cMargin
          : _bc.copy(cDeck).multiplyScalar(j % 2 ? 0.93 : 1.05);
        push(_bv.set(outer.x * f, outer.y + camber - 0.01, outer.z), c);
      }
    }
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NW; j++) {
        const a = start + i * (NW + 1) + j;
        idx.push(a, a + (NW + 1), a + 1, a + 1, a + (NW + 1), a + NW + 2);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A low bulwark around the deck edge, swept along the sheer. It is a closed
 * rectangular section rather than a single wall: a one-sided strip vanishes
 * the moment you stand inboard of it and look down, which is where the
 * helmsman spends the whole game.
 */
function buildToeRail(height = 0.085, width = 0.055, inset = 0.03) {
  const NS = 52;
  const pos = [], idx = [];
  let base = 0;
  for (const side of [1, -1]) {
    const start = base;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      const S = sheerAt(t);
      const outer = beamAt(t) * (1 + flareAt(t)) - inset;
      const inner = outer - width;
      const z = (t - 0.5) * LOA
        + 0.24 * smoothstep(0.74, 1.0, t) * S
        - 0.32 * smoothstep(0.18, 0.0, t) * S;
      // section corners, walked anticlockwise seen from ahead
      for (const [x, y] of [[outer, S], [outer, S + height], [inner, S + height], [inner, S]]) {
        pos.push(x * side, y, z);
      }
      base += 4;
    }
    for (let i = 0; i < NS; i++) {
      for (let k = 0; k < 4; k++) {
        const a = start + i * 4 + k;
        const b = start + i * 4 + ((k + 1) % 4);
        const c = a + 4, d = b + 4;
        if (side > 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A stainless tube following a path — pulpits, pushpits, grab rails. */
function tube(points, radius = 0.021) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, 6, false);
}

// ---------------------------------------------------------------------------
// sailcloth
// ---------------------------------------------------------------------------

/**
 * Sailcloth as a texture: woven laminate, the horizontal broadseams of a
 * cross-cut sail, batten pockets running in from the leech, and the class
 * number. The sail's UVs are (chord, hoist), so all of this lands where a
 * sailmaker would have put it.
 */
function makeSailTexture(livery, withNumber) {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const base = new THREE.Color(livery.sail);

  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, S, S);

  // weave: a fine crosshatch, barely there but it kills the plastic look
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const w = (Math.sin(x * 1.9) * Math.sin(y * 1.9)) * 3.5 + (Math.random() - 0.5) * 5;
      d[i] = clamp(d[i] + w, 0, 255);
      d[i + 1] = clamp(d[i + 1] + w, 0, 255);
      d[i + 2] = clamp(d[i + 2] + w, 0, 255);
    }
  }
  g.putImageData(img, 0, 0);

  // broadseams, parallel to the foot
  g.strokeStyle = 'rgba(20,28,40,0.11)';
  g.lineWidth = 1.5;
  for (let k = 1; k < 11; k++) {
    const y = S - (k / 11) * S;
    g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
  }

  // batten pockets: doubled cloth from the leech, stopping short of the luff
  g.fillStyle = 'rgba(20,28,40,0.10)';
  for (const v of [0.20, 0.42, 0.63, 0.83]) {
    const y = S - v * S;
    g.fillRect(S * 0.30, y - 4, S * 0.70, 8);
  }

  // luff tape and leech line
  g.fillStyle = 'rgba(20,28,40,0.13)';
  g.fillRect(0, 0, 8, S);
  g.fillRect(S - 6, 0, 6, S);

  if (withNumber) {
    g.save();
    g.translate(S * 0.50, S * 0.56);
    g.rotate(-0.06);
    g.fillStyle = 'rgba(24,32,44,0.80)';
    g.font = '700 74px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(livery.sailNumber, 0, 0);
    g.restore();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Triangular sail from three corners, with camber, roach and a luff flutter. */
function sailGeometry(nU = 12, nV = 16) {
  const g = new THREE.BufferGeometry();
  const verts = new Float32Array((nU + 1) * (nV + 1) * 3);
  const uvs = new Float32Array((nU + 1) * (nV + 1) * 2);
  const idx = [];
  let k = 0;
  for (let v = 0; v <= nV; v++) {
    for (let u = 0; u <= nU; u++) {
      uvs[k++] = u / nU;
      uvs[k++] = v / nV;
    }
  }
  for (let v = 0; v < nV; v++) {
    for (let u = 0; u < nU; u++) {
      const a = v * (nU + 1) + u;
      idx.push(a, a + 1, a + nU + 1, a + 1, a + nU + 2, a + nU + 1);
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.userData = { nU, nV };
  return g;
}

const _t = new THREE.Vector3(), _h = new THREE.Vector3(), _c = new THREE.Vector3();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _nrm = new THREE.Vector3();
const _p = new THREE.Vector3();
const _bv = new THREE.Vector3();
const _bc = new THREE.Color();

function updateSail(geo, tack, head, clew, camber, roach, flutter, time) {
  const { nU, nV } = geo.userData;
  const arr = geo.getAttribute('position').array;
  _t.copy(tack); _h.copy(head); _c.copy(clew);
  _e1.subVectors(_h, _t);
  _e2.subVectors(_c, _t);
  _nrm.crossVectors(_e1, _e2).normalize();

  let k = 0;
  for (let v = 0; v <= nV; v++) {
    const fv = v / nV;
    for (let u = 0; u <= nU; u++) {
      const fu = u / nU;
      // triangle collapses toward the head
      const chord = fu * (1 - fv);
      _p.copy(_t).addScaledVector(_e1, fv).addScaledVector(_e2, chord);
      // roach pushes the leech aft in the middle
      const leech = Math.sin(Math.PI * fv) * roach * fu * fu;
      _p.addScaledVector(_e2, leech);
      // draft: deepest a third of the way back, fullest at mid hoist
      const belly = Math.sin(Math.PI * Math.pow(fu, 0.72)) * Math.sin(Math.PI * Math.pow(fv, 0.8));
      let d = belly * camber;
      if (flutter > 0.001) {
        d += Math.sin(fu * 9.0 - time * 13.0 + fv * 2.0) * flutter * fu * (0.3 + 0.7 * fv);
      }
      _p.addScaledVector(_nrm, d);
      arr[k++] = _p.x; arr[k++] = _p.y; arr[k++] = _p.z;
    }
  }
  geo.getAttribute('position').needsUpdate = true;
  geo.computeVertexNormals();
}

// ---------------------------------------------------------------------------

export class Boat {
  constructor(scene, opts = {}) {
    this.livery = opts.livery || LIVERIES.player;
    this.name = opts.name || 'Leeward';
    // a rival is not quite as quick as the player's boat: close enough to make
    // a race of it, slow enough that sailing well beats her
    this.efficiency = opts.efficiency ?? 1.0;

    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);

    this.position = new THREE.Vector3(0, 0, 280);
    if (opts.position) this.position.copy(opts.position);
    this.heading = opts.heading ?? Math.PI;
    this.surge = 0;
    this.sway = 0;
    this.yawRate = 0;
    this.heel = 0;
    this.heelRate = 0;
    this.pitch = 0;
    this.waveRoll = 0;
    this.rudder = 0;             // -1 .. 1
    this.mainTrim = 0.55;        // 0 = sheeted flat, 1 = fully eased
    this.autoTrim = true;
    this.aground = 0;

    this.apparent = { speed: 0, angle: 0 };
    this.luffing = 0;
    this.driveForce = 0;
    this._rig = { boomAngle: 0, tackSign: 1, beta: 0 };

    this.build();
  }

  build() {
    const L = this.livery;

    // Three materials for the whole boat. Vertex colours carry the paint, so
    // the split is by *finish*, not by part: gloss gelcoat, matte joinery,
    // bright metal.
    const gloss = applyAtmosphere(new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.26, metalness: 0.0,
      clearcoat: 0.9, clearcoatRoughness: 0.10,
    }));
    const matte = applyAtmosphere(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.72, metalness: 0.0,
    }));
    const metal = applyAtmosphere(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.30, metalness: 0.86,
    }));

    const ALLOY = 0xb9bcc0, STEEL = 0xd2d5d8, TEAK = 0x8a6a42, DARK = 0x22252a;
    const GRP = 0xefeee9, GLASS = 0x12161c;

    const parts = { gloss: [], matte: [], metal: [] };
    /** Bake a piece into one of the three buckets. Colour undefined = keep its own. */
    const put = (bucket, geo, matrix, color) => {
      parts[bucket].push(color === undefined ? bakeVertexColored(geo, matrix) : prepare(geo, matrix, color));
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);

    // ---- hull, toe rail ----
    put('gloss', buildHull(L), null);
    put('gloss', buildToeRail(), null, GRP);

    // ---- coachroof: two stacked tiers so the sides slope inboard ----
    put('gloss', box(2.02, 0.40, 3.70), trs(0, 1.16, 1.15), GRP);
    put('gloss', box(1.76, 0.24, 3.52), trs(0, 1.45, 1.15), GRP);
    put('gloss', box(1.58, 0.07, 3.34), trs(0, 1.60, 1.15), GRP);
    // long side windows and the forward light
    put('gloss', box(0.06, 0.20, 2.30), trs(1.00, 1.22, 1.30), GLASS);
    put('gloss', box(0.06, 0.20, 2.30), trs(-1.00, 1.22, 1.30), GLASS);
    put('gloss', box(1.40, 0.16, 0.06), trs(0, 1.26, 2.98), GLASS);
    // sliding hatch and its garage
    put('metal', box(0.82, 0.05, 0.90), trs(0, 1.655, 2.30), ALLOY);
    put('metal', box(0.94, 0.04, 0.06), trs(0, 1.64, 1.82), ALLOY);
    // foredeck hatch
    put('metal', box(0.62, 0.05, 0.62), trs(0, 1.30, 3.55, -0.18, 0, 0), ALLOY);
    put('gloss', box(0.70, 0.07, 0.70), trs(0, 1.26, 3.55), GLASS);

    // ---- companionway ----
    put('matte', box(0.84, 0.54, 0.07), trs(0, 1.22, -0.72), TEAK);
    put('matte', box(1.00, 0.09, 0.18), trs(0, 0.94, -0.74), TEAK);

    // ---- cockpit ----
    put('gloss', box(0.14, 0.34, 3.30), trs(1.03, 1.10, -2.15), GRP);
    put('gloss', box(0.14, 0.34, 3.30), trs(-1.03, 1.10, -2.15), GRP);
    put('gloss', box(2.20, 0.34, 0.14), trs(0, 1.10, -3.78), GRP);
    put('matte', box(1.96, 0.09, 3.30), trs(0, 0.60, -2.15), TEAK);
    put('matte', box(0.52, 0.09, 3.10), trs(0.70, 0.94, -2.15), TEAK);
    put('matte', box(0.52, 0.09, 3.10), trs(-0.70, 0.94, -2.15), TEAK);
    // locker lids, with a visible seam
    put('matte', box(0.46, 0.02, 1.30), trs(0.70, 0.995, -2.60), 0x6f563a);
    put('matte', box(0.46, 0.02, 1.30), trs(-0.70, 0.995, -2.60), 0x6f563a);

    // ---- primary and halyard winches ----
    const winch = (x, z, r = 0.085, h = 0.17) => {
      put('metal', cyl(r, r * 1.18, h, 12), trs(x, 1.30, z), STEEL);
      put('metal', cyl(r * 1.22, r * 1.22, 0.022, 12), trs(x, 1.395, z), ALLOY);
      // the drum sits on a wedge pad
      put('gloss', cyl(r * 1.5, r * 1.5, 0.05, 10), trs(x, 1.21, z), GRP);
    };
    winch(0.86, -1.55); winch(-0.86, -1.55);            // primaries
    winch(0.62, 1.62, 0.062, 0.13); winch(-0.62, 1.62, 0.062, 0.13);   // halyards
    // clutches on the coachroof
    put('matte', box(0.34, 0.07, 0.10), trs(0.40, 1.655, 1.95), DARK);
    put('matte', box(0.34, 0.07, 0.10), trs(-0.40, 1.655, 1.95), DARK);
    // teak handrails, the thing you actually hold going forward in a seaway
    for (const s of [1, -1]) {
      put('matte', box(0.05, 0.05, 2.60), trs(s * 0.66, 1.75, 1.15), TEAK);
      for (const z of [-0.02, 0.75, 1.55, 2.32]) {
        put('matte', box(0.05, 0.11, 0.08), trs(s * 0.66, 1.665, z), TEAK);
      }
    }

    // ---- cleats and fairleads ----
    for (const [x, z] of [[1.06, 3.62], [-1.06, 3.62], [1.14, -3.30], [-1.14, -3.30], [1.20, 0.55], [-1.20, 0.55]]) {
      put('metal', cyl(0.028, 0.028, 0.20, 6), trs(x, 1.02, z, 0, 0, Math.PI / 2), ALLOY);
      put('metal', cyl(0.026, 0.030, 0.07, 6), trs(x, 0.97, z + 0.05), ALLOY);
      put('metal', cyl(0.026, 0.030, 0.07, 6), trs(x, 0.97, z - 0.05), ALLOY);
    }

    // ---- traveler track and mainsheet ----
    put('metal', box(1.70, 0.05, 0.09), trs(0, 1.18, -1.85), ALLOY);
    put('metal', box(0.16, 0.09, 0.13), trs(0, 1.24, -1.85), DARK);

    // ---- binnacle compass, right where the helmsman looks ----
    put('matte', cyl(0.10, 0.13, 0.34, 10), trs(0, 1.30, -3.05), DARK);
    put('gloss', new THREE.SphereGeometry(0.115, 12, 9), trs(0, 1.50, -3.05), 0xdedbd2);

    // ---- keel: a fin with a lead bulb, and a spade rudder stock ----
    put('matte', box(0.20, 1.42, 1.85), trs(0, -1.02, -0.15), DARK);
    put('matte', new THREE.CapsuleGeometry(0.17, 1.55, 4, 10), trs(0, -1.74, -0.15, Math.PI / 2, 0, 0), 0x2c2f35);
    put('matte', cyl(0.055, 0.055, 0.55, 8), trs(0, 0.55, -3.55), DARK);

    // ---- mast, spreaders, gooseneck ----
    this.mastBase = new THREE.Vector3(0, 1.62, 1.05);
    this.mastHeight = 12.8;
    // three sections so the taper is visible aloft
    put('metal', cyl(0.125, 0.145, 6.4, 12), trs(0, this.mastBase.y + 3.2, this.mastBase.z), ALLOY);
    put('metal', cyl(0.100, 0.125, 4.2, 12), trs(0, this.mastBase.y + 8.5, this.mastBase.z), ALLOY);
    put('metal', cyl(0.075, 0.100, 2.2, 10), trs(0, this.mastBase.y + 11.7, this.mastBase.z), ALLOY);
    put('metal', box(0.05, 0.05, 0.11), trs(0, this.mastBase.y + 6.5, this.mastBase.z - 0.10), DARK); // sail track
    put('gloss', cyl(0.20, 0.24, 0.14, 12), trs(0, this.mastBase.y - 0.04, this.mastBase.z), GRP);    // collar
    // spreaders sweep aft, as they do on a swept-rig sloop
    for (const s of [1, -1]) {
      put('metal', box(1.30, 0.05, 0.08),
        trs(s * 0.66, this.mastBase.y + 7.3, this.mastBase.z - 0.16, 0, s * 0.22, s * 0.05), ALLOY);
    }
    // boom vang from the mast foot to under the boom
    put('metal', cyl(0.045, 0.055, 0.86, 8), trs(0, 2.42, 0.62, 0.62, 0, 0), ALLOY);

    // ---- pulpit, pushpit, stanchions ----
    const bowZ = LOA / 2 - 0.30, bowY = sheerAt(0.97) + 0.09;
    put('metal', tube([
      [0.50, bowY, bowZ - 0.55], [0.46, bowY + 0.62, bowZ - 0.30],
      [0.20, bowY + 0.66, bowZ + 0.28], [-0.20, bowY + 0.66, bowZ + 0.28],
      [-0.46, bowY + 0.62, bowZ - 0.30], [-0.50, bowY, bowZ - 0.55],
    ]), null, STEEL);
    const stY = sheerAt(0.02) + 0.09, stZ = -LOA / 2 + 0.34;
    put('metal', tube([
      [1.02, stY, stZ + 0.50], [1.00, stY + 0.60, stZ + 0.26],
      [0.72, stY + 0.62, stZ - 0.02], [-0.72, stY + 0.62, stZ - 0.02],
      [-1.00, stY + 0.60, stZ + 0.26], [-1.02, stY, stZ + 0.50],
    ]), null, STEEL);
    for (let i = 0; i < 4; i++) {
      const zz = -2.40 + i * 1.85;
      const st = clamp(zz / LOA + 0.5, 0, 1);
      const bx = beamAt(st) * (1 + flareAt(st)) - 0.09;
      const sy = sheerAt(st);
      for (const s of [1, -1]) {
        put('metal', cyl(0.020, 0.024, 0.64, 6), trs(bx * s, sy + 0.32, zz), STEEL);
        put('metal', box(0.10, 0.03, 0.10), trs(bx * s, sy + 0.02, zz), STEEL);
      }
    }
    // anchor roller on the stemhead
    put('metal', box(0.14, 0.10, 0.46), trs(0, sheerAt(0.995) + 0.02, LOA / 2 - 0.02), ALLOY);
    // chainplates
    for (const s of [1, -1]) put('metal', box(0.03, 0.16, 0.10), trs(s * 1.24, sheerAt(0.55) + 0.05, 0.90), STEEL);

    for (const [bucket, mat] of [['gloss', gloss], ['matte', matte], ['metal', metal]]) {
      const mesh = new THREE.Mesh(mergeGeometries(parts[bucket]), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }

    // ---- moving parts, which have to stay separate ----
    this.boomPivot = new THREE.Group();
    this.boomPivot.position.set(this.mastBase.x, this.mastBase.y + 1.42, this.mastBase.z);
    this.root.add(this.boomPivot);
    this.boomLength = 4.05;
    const boomParts = [
      prepare(cyl(0.075, 0.088, this.boomLength, 10), trs(0, -this.boomLength / 2, 0, 0, 0, 0), ALLOY),
      prepare(box(0.10, 0.10, 0.14), trs(0, -0.10, 0), DARK),
      prepare(cyl(0.05, 0.05, 0.16, 8), trs(0, -this.boomLength + 0.12, 0), DARK),
    ];
    const boom = new THREE.Mesh(mergeGeometries(boomParts), metal);
    boom.rotation.x = Math.PI / 2;   // lie the boom along -Z
    boom.castShadow = true;
    this.boomPivot.add(boom);

    this.tiller = new THREE.Group();
    this.tiller.position.set(0, 1.02, -3.52);
    this.root.add(this.tiller);
    const tillerMesh = new THREE.Mesh(
      prepare(cyl(0.040, 0.052, 1.55, 8), trs(0, 0.13, 0.78, Math.PI / 2 - 0.13, 0, 0), TEAK), matte);
    tillerMesh.castShadow = true;
    this.tiller.add(tillerMesh);

    // a spade rudder with a foil section rather than a plank
    const rudderGeo = prepare(new THREE.BoxGeometry(0.10, 1.25, 0.66, 1, 2, 3), null, DARK);
    taperFoil(rudderGeo);
    this.rudderMesh = new THREE.Mesh(rudderGeo, matte);
    this.rudderMesh.position.set(0, -0.66, -3.55);
    this.rudderMesh.castShadow = true;
    this.root.add(this.rudderMesh);

    // ---- standing rigging ----
    this.forestayTop = new THREE.Vector3(0, this.mastBase.y + this.mastHeight * 0.90, this.mastBase.z);
    this.bowPoint = new THREE.Vector3(0, sheerAt(0.985) + 0.12, LOA / 2 - 0.10);
    const mastTop = new THREE.Vector3(0, this.mastBase.y + this.mastHeight - 0.10, this.mastBase.z);
    const spreader = (s) => new THREE.Vector3(s * 1.32, this.mastBase.y + 7.3, this.mastBase.z - 0.30);
    const rig = [
      this.forestayTop.clone(), this.bowPoint.clone(),
      mastTop.clone(), new THREE.Vector3(0, sheerAt(0.02) + 0.12, -LOA / 2 + 0.20),   // backstay
      spreader(1), new THREE.Vector3(1.24, sheerAt(0.55), 0.90),                      // cap shroud, lower
      spreader(-1), new THREE.Vector3(-1.24, sheerAt(0.55), 0.90),
      spreader(1), mastTop.clone(),                                                   // cap shroud, upper
      spreader(-1), mastTop.clone(),
      new THREE.Vector3(0.62, this.mastBase.y + 4.0, this.mastBase.z), new THREE.Vector3(1.24, sheerAt(0.55), 0.90),
      new THREE.Vector3(-0.62, this.mastBase.y + 4.0, this.mastBase.z), new THREE.Vector3(-1.24, sheerAt(0.55), 0.90),
    ];
    this.root.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(rig),
      new THREE.LineBasicMaterial({ color: 0xc9ccd0 })));

    // lifelines, threaded through the stanchion tops
    const llPts = [];
    for (const s of [1, -1]) {
      for (const h of [0.62, 0.34]) {
        let prev = null;
        for (let i = 0; i <= 5; i++) {
          const zz = -3.20 + (i / 5) * 6.9;
          const st = clamp(zz / LOA + 0.5, 0, 1);
          const bx = beamAt(st) * (1 + flareAt(st)) - 0.09;
          const p = new THREE.Vector3(bx * s, sheerAt(st) + h, zz);
          if (prev) llPts.push(prev, p);
          prev = p;
        }
      }
    }
    this.root.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(llPts),
      new THREE.LineBasicMaterial({ color: 0xd8d8d4 })));

    // running rigging that actually moves
    this.sheetGeo = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 8 }, () => new THREE.Vector3()));
    const sheets = new THREE.LineSegments(this.sheetGeo, new THREE.LineBasicMaterial({ color: 0xe0ddd2 }));
    sheets.frustumCulled = false;
    this.root.add(sheets);

    // ---- sails ----
    // Sailcloth is bright but not blown out, so the camber still reads as
    // shape. The small emissive stands in for transmission: real cloth passes
    // light, so the windward face is never as dark as an opaque surface.
    const cloth = (withNumber) => applyAtmosphere(new THREE.MeshStandardMaterial({
      map: makeSailTexture(L, withNumber),
      color: 0xffffff, roughness: 0.88, metalness: 0.0, side: THREE.DoubleSide,
      envMapIntensity: 0.5, emissive: 0xdfe4e8, emissiveIntensity: 0.11,
    }));
    this.mainMat = cloth(true);
    this.jibMat = cloth(false);

    this.mainGeo = sailGeometry(12, 16);
    this.main = new THREE.Mesh(this.mainGeo, this.mainMat);
    this.main.castShadow = true;
    this.main.frustumCulled = false;
    this.root.add(this.main);

    this.jibGeo = sailGeometry(10, 13);
    this.jib = new THREE.Mesh(this.jibGeo, this.jibMat);
    this.jib.castShadow = true;
    this.jib.frustumCulled = false;
    this.root.add(this.jib);

    // masthead burgee — the most honest wind instrument on the boat
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.burgeeGeo = bg;
    this.burgee = new THREE.Mesh(bg, applyAtmosphere(new THREE.MeshStandardMaterial({
      color: L.burgee, roughness: 0.9, side: THREE.DoubleSide,
    })));
    this.burgee.frustumCulled = false;
    this.root.add(this.burgee);

    // where the helmsman's eyes are
    this.helm = new THREE.Group();
    this.helm.position.set(0.50, 2.30, -3.42);
    this.root.add(this.helm);
  }

  /** Give the textures the anisotropy the renderer can actually do. */
  setAnisotropy(n) {
    for (const m of [this.mainMat, this.jibMat]) {
      if (m.map) { m.map.anisotropy = n; m.map.needsUpdate = true; }
    }
  }

  get forward() { return _fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  get starboard() { return _stb.set(Math.cos(this.heading), 0, -Math.sin(this.heading)); }
  get speed() { return Math.hypot(this.surge, this.sway); }

  /**
   * One physics substep. Only state that has to be integrated lives here —
   * everything visual moved to updateVisual(), which runs once a frame no
   * matter how many substeps the frame needed.
   */
  update(dt, input, wind, time) {
    const fwd = _u1.copy(this.forward);
    const stb = _u2.copy(this.starboard);

    // ---- apparent wind ----------------------------------------------------
    const windVec = _w1.set(-Math.sin(wind.from), 0, -Math.cos(wind.from)).multiplyScalar(wind.speed);
    const boatVel = _w2.copy(fwd).multiplyScalar(this.surge).addScaledVector(stb, this.sway);
    const aw = _w3.subVectors(windVec, boatVel);
    const awF = aw.dot(fwd);
    const awS = aw.dot(stb);
    const awSpeed = Math.hypot(awF, awS);
    // angle to the direction the wind is coming FROM: 0 = on the nose
    const beta = Math.atan2(-awS, -awF);
    this.apparent.speed = awSpeed;
    this.apparent.angle = beta;

    // ---- sail trim --------------------------------------------------------
    const absBeta = Math.abs(beta);
    const MAX_BOOM = 1.45;
    const targetTrim = clamp((absBeta - 0.34) / MAX_BOOM, 0, 1);
    if (this.autoTrim) {
      this.mainTrim = damp(this.mainTrim, targetTrim, 2.2, dt);
    } else {
      this.mainTrim = clamp(this.mainTrim + input.trim * dt * 0.55, 0, 1);
    }
    const boomAngle = this.mainTrim * MAX_BOOM;   // 0 = sheeted on the centreline
    const tackSign = beta >= 0 ? 1 : -1;          // +1 = wind from starboard
    const alpha = absBeta - boomAngle;            // angle of attack

    // ---- sail force -------------------------------------------------------
    const a = clamp(alpha, -0.3, Math.PI / 2);
    let CL = 1.75 * Math.sin(2 * Math.max(a, 0));
    let CD = 0.10 + 1.30 * (1 - Math.cos(2 * Math.max(a, 0))) * 0.5;
    const luff = clamp((0.09 - a) / 0.20, 0, 1);
    this.luffing = luff;
    CL *= 1 - luff;
    CD *= 1 - luff * 0.55;
    if (a > 0.62) CL *= Math.max(0.35, 1 - (a - 0.62) * 1.15);

    const heelFactor = Math.cos(this.heel);
    const q = 0.5 * RHO_AIR * awSpeed * awSpeed * SAIL_AREA * heelFactor * this.efficiency;
    const lift = q * CL;
    const drag = q * CD;

    const inv = awSpeed > 1e-3 ? 1 / awSpeed : 0;
    const wF = awF * inv, wS = awS * inv;
    let lF = -wS, lS = wF;
    if (beta < 0) { lF = -lF; lS = -lS; }

    const forceF = lift * lF + drag * wF;
    const forceS = lift * lS + drag * wS;

    // ---- hull resistance --------------------------------------------------
    const u = this.surge;
    let resist = 0.5 * RHO_WATER * 22 * 0.0102 * u * Math.abs(u);
    const over = Math.abs(u) / HULL_SPEED;
    if (over > 0.80) resist += Math.sign(u) * 9000 * Math.pow(over - 0.80, 2.2);
    const swayResist = 0.5 * RHO_WATER * 6.4 * 1.25 * this.sway * Math.abs(this.sway);

    const groundDrag = this.aground > 0 ? 9000 : 0;
    this.surge += ((forceF - resist - Math.sign(u) * groundDrag) / MASS) * dt;
    this.sway += ((forceS - swayResist) / MASS) * dt;
    this.surge = clamp(this.surge, -3, 12);
    this.sway = clamp(this.sway, -4, 4);
    this.driveForce = forceF;

    // ---- steering ----------------------------------------------------------
    this.rudder = damp(this.rudder, clamp(input.rudder, -1, 1), 7, dt);
    const flow = Math.abs(u) + 0.4;
    const rudderLift = 0.5 * RHO_WATER * 0.42 * 4.6 * Math.sin(this.rudder * 0.62) * flow * flow;
    let yawMoment = rudderLift * 3.6 * Math.sign(u || 1);
    // weather helm: heeled hulls want to round up into the wind
    yawMoment += tackSign * Math.abs(this.heel) * 9000 * clamp(Math.abs(u) / 2, 0, 1);
    yawMoment += -this.yawRate * (26000 + 9000 * Math.abs(u));
    this.yawRate += (yawMoment / IZ) * dt;
    this.heading += this.yawRate * dt;

    // ---- heel ---------------------------------------------------------------
    const targetHeel = clamp(Math.atan2(forceS * CE_HEIGHT, MASS * G * GM), -0.75, 0.75);
    this.heelRate += (5.5 * (targetHeel - this.heel) - 2.6 * this.heelRate) * dt;
    this.heel += this.heelRate * dt;

    // ---- move ---------------------------------------------------------------
    this.position.addScaledVector(fwd, this.surge * dt);
    this.position.addScaledVector(stb, this.sway * dt);

    // ---- ground ------------------------------------------------------------
    const bed = terrainHeight(this.position.x, this.position.z);
    if (bed > -1.5) {
      this.aground = 1;
      const gx = terrainHeight(this.position.x + 2, this.position.z) - bed;
      const gz = terrainHeight(this.position.x, this.position.z + 2) - bed;
      this.position.x -= gx * dt * 14;
      this.position.z -= gz * dt * 14;
      this.surge *= 0.90;
    } else {
      this.aground = Math.max(0, this.aground - dt);
    }

    this._rig.boomAngle = boomAngle;
    this._rig.tackSign = tackSign;
    this._rig.beta = beta;
    return this._rig;
  }

  /**
   * Everything the eye sees: buoyancy, pose, sails, lines. Once a frame, not
   * once a substep — rebuilding two sails ten times for one drawn image is
   * work nobody ever looks at.
   */
  updateVisual(dt, time) {
    const fwd = _u1.copy(this.forward);
    const stb = _u2.copy(this.starboard);

    const s0 = sampleOcean(this.position.x, this.position.z, time, _s0);
    const bowP = _w1.copy(fwd).multiplyScalar(LOA * 0.42);
    const s1 = sampleOcean(this.position.x + bowP.x, this.position.z + bowP.z, time, _s1);
    const s2 = sampleOcean(this.position.x - bowP.x, this.position.z - bowP.z, time, _s2);
    const sideP = _w2.copy(stb).multiplyScalar(BEAM * 0.5);
    const s3 = sampleOcean(this.position.x + sideP.x, this.position.z + sideP.z, time, _s3);
    const s4 = sampleOcean(this.position.x - sideP.x, this.position.z - sideP.z, time, _s4);

    const ride = s0.y * 0.4 + (s1.y + s2.y) * 0.2 + (s3.y + s4.y) * 0.1;
    const wavePitch = Math.atan2(s1.y - s2.y, LOA * 0.84);
    const waveRoll = Math.atan2(s3.y - s4.y, BEAM);

    this.position.y = damp(this.position.y, ride - 0.04, 14, dt);
    this.pitch = damp(this.pitch, -wavePitch * 0.85 - clamp(this.surge / 12, 0, 0.1), 6, dt);
    this.waveRoll = damp(this.waveRoll || 0, waveRoll * 0.7, 5, dt);

    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;
    this.root.rotation.x = this.pitch;
    this.root.rotation.z = -(this.heel + this.waveRoll);

    const { boomAngle, tackSign, beta } = this._rig;
    this.updateRig(boomAngle * tackSign, tackSign, beta, time);
  }

  /** boomAngle is signed: negative puts the boom out to port. */
  updateRig(boomAngle, tackSign, beta, time) {
    this.boomPivot.rotation.y = boomAngle;
    const clewLocal = _w1.set(0, 0, -this.boomLength).applyEuler(this.boomPivot.rotation).add(this.boomPivot.position);

    const tack = _b1.copy(this.boomPivot.position);
    const head = _b2.set(this.mastBase.x, this.mastBase.y + this.mastHeight - 0.35, this.mastBase.z);
    const camber = 0.55 * (1 - this.luffing * 0.6) * Math.sign(boomAngle || 0.001);
    updateSail(this.mainGeo, tack, head, clewLocal, camber, 0.16, this.luffing * 0.22, time);

    // jib: tacked at the stemhead, sheeted to the leeward rail
    const jTack = _b3.copy(this.bowPoint);
    const jHead = _b4.copy(this.forestayTop);
    const sheetSide = -Math.sign(boomAngle || 0.001);
    const jibAngle = Math.min(Math.abs(boomAngle) * 0.55 + 0.18, 1.15);
    const jClew = _b5.set(
      Math.sin(jibAngle) * 2.9 * sheetSide,
      1.38,
      this.bowPoint.z - Math.cos(jibAngle) * 3.5
    );
    updateSail(this.jibGeo, jTack, jHead, jClew, camber * 0.85, 0.05, this.luffing * 0.26, time);

    // sheets: mainsheet to the traveler, jib sheet to a winch, the vang, and
    // the forestay's own tail
    const sp = this.sheetGeo.getAttribute('position');
    sp.setXYZ(0, clewLocal.x, clewLocal.y, clewLocal.z);
    sp.setXYZ(1, 0, 1.24, -1.85);
    sp.setXYZ(2, jClew.x, jClew.y, jClew.z);
    sp.setXYZ(3, 0.86 * sheetSide, 1.32, -1.55);
    sp.setXYZ(4, this.bowPoint.x, this.bowPoint.y, this.bowPoint.z);
    sp.setXYZ(5, jTack.x, jTack.y + 0.02, jTack.z);
    // the boom's own topping lift, slack and drooping
    sp.setXYZ(6, clewLocal.x, clewLocal.y, clewLocal.z);
    sp.setXYZ(7, this.mastBase.x, this.mastBase.y + this.mastHeight - 0.5, this.mastBase.z);
    sp.needsUpdate = true;

    // burgee streams with the apparent wind
    const bp = this.burgeeGeo.getAttribute('position');
    const y = this.mastBase.y + this.mastHeight + 0.05;
    const dirX = -Math.sin(beta), dirZ = -Math.cos(beta);
    const flap = Math.sin(time * 7.5) * 0.09;
    bp.setXYZ(0, this.mastBase.x, y + 0.34, this.mastBase.z);
    bp.setXYZ(1, this.mastBase.x, y - 0.02, this.mastBase.z);
    bp.setXYZ(2, this.mastBase.x - dirX * 0.85, y + 0.16 + flap, this.mastBase.z - dirZ * 0.85);
    bp.needsUpdate = true;
    this.burgeeGeo.computeVertexNormals();

    this.tiller.rotation.y = -this.rudder * 0.5;
    this.rudderMesh.rotation.y = this.rudder * 0.62;
  }
}

// ---------------------------------------------------------------------------

/** Keep a geometry's own vertex colours while making it merge-compatible. */
function bakeVertexColored(geometry, matrix) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (matrix) g.applyMatrix4(matrix);
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  }
  g.deleteAttribute('tangent');
  return g;
}

/** Squeeze a box into a rough foil: thickest a third back, fine at the trailing edge. */
function taperFoil(geo) {
  const p = geo.getAttribute('position');
  let minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < p.count; i++) {
    minZ = Math.min(minZ, p.getZ(i)); maxZ = Math.max(maxZ, p.getZ(i));
    minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i));
  }
  const spanZ = maxZ - minZ || 1;
  const spanY = maxY - minY || 1;
  for (let i = 0; i < p.count; i++) {
    const c = (p.getZ(i) - minZ) / spanZ;         // 0 = trailing edge, 1 = leading
    p.setX(i, p.getX(i) * (0.16 + 0.84 * Math.sin(Math.PI * Math.pow(c, 0.55))));
    // rake: the tip trails the root, which is what a spade rudder looks like
    p.setZ(i, p.getZ(i) - 0.16 * (1 - (p.getY(i) - minY) / spanY));
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
}

const _fwd = new THREE.Vector3();
const _stb = new THREE.Vector3();
const _u1 = new THREE.Vector3();
const _u2 = new THREE.Vector3();
const _w1 = new THREE.Vector3();
const _w2 = new THREE.Vector3();
const _w3 = new THREE.Vector3();
const _b1 = new THREE.Vector3();
const _b2 = new THREE.Vector3();
const _b3 = new THREE.Vector3();
const _b4 = new THREE.Vector3();
const _b5 = new THREE.Vector3();
const mk = () => ({ y: 0, normal: new THREE.Vector3(), fold: 1 });
const _s0 = mk(), _s1 = mk(), _s2 = mk(), _s3 = mk(), _s4 = mk();
