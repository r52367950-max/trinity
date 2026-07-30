import * as THREE from 'three';
import { applyAtmosphere } from './materials.js';
import { sampleOcean } from './waves.js';
import { terrainHeight } from './terrain.js';
import { clamp, damp, angleDelta, makeRng } from './utils.js';

/**
 * A 9.5 metre sloop, and enough sailing physics to make her feel like one.
 *
 * Forces come from apparent wind rather than true wind, so the boat
 * accelerates into her own headwind, points higher as she speeds up, and
 * genuinely cannot sail closer than about 40 degrees off the breeze. Lift and
 * drag are taken from a flat-plate model of the sail, which gives lift-driven
 * beating and reaching and drag-driven running out of the same equations.
 */

const RHO_AIR = 1.225;
const RHO_WATER = 1025;
const G = 9.81;

const LOA = 9.5;       // length overall
const LWL = 8.4;       // waterline length
const BEAM = 3.05;
const MASS = 3200;     // kg displacement
const IZ = 21000;      // yaw inertia
const SAIL_AREA = 42;  // main + jib
const CE_HEIGHT = 5.0; // centre of effort above the lateral centre
const GM = 1.15;       // metacentric height
const HULL_SPEED = 1.34 * Math.sqrt(LWL * 3.28084) / 1.94384; // m/s

// ---------------------------------------------------------------------------
// hull construction
// ---------------------------------------------------------------------------

/** Half-beam at station t (0 = transom, 1 = stem). */
function beamAt(t) {
  const shape = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.72))), 0.62);
  const transom = 0.55 * (1 - Math.min(1, t / 0.16));
  return (BEAM / 2) * Math.max(shape, transom);
}
/** Depth of the canoe body below the waterline. */
function depthAt(t) {
  return 0.30 + 0.52 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.62))), 0.5);
}
/** Sheer height above the waterline — the curve that gives a hull its face. */
function sheerAt(t) {
  return 0.86 + 0.55 * Math.pow(t, 2.6) + 0.09 * Math.pow(1 - t, 2);
}

function buildHull() {
  const NS = 40, NG = 14;
  const pos = [];
  const col = [];
  const idx = [];
  const white = new THREE.Color(0xf3f2ef);
  const navy = new THREE.Color(0x1b2f4a);
  const stripe = new THREE.Color(0x8d2f2a);

  const grid = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const z = (t - 0.5) * LOA;
    const B = beamAt(t), D = depthAt(t), S = sheerAt(t);
    const row = [];
    for (let j = 0; j <= NG; j++) {
      const s = j / NG;
      const a = s * Math.PI / 2;
      const x = B * Math.pow(Math.sin(a), 0.78);
      const y = -D * Math.pow(Math.cos(a), 1.7) + (S + D) * Math.pow(Math.sin(a), 2.3);
      row.push(new THREE.Vector3(x, y, z));
    }
    grid.push(row);
  }
  // correct the sheer: the outermost girth point should land exactly on it
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const S = sheerAt(t);
    const row = grid[i];
    const dy = S - row[NG].y;
    for (let j = 0; j <= NG; j++) row[j].y += dy * Math.pow(j / NG, 1.6);
  }

  const colorFor = (y) => {
    if (y < -0.06) return navy;
    if (y < 0.06) return stripe;
    return white;
  };

  let base = 0;
  const pushVert = (v) => {
    pos.push(v.x, v.y, v.z);
    const c = colorFor(v.y);
    col.push(c.r, c.g, c.b);
    return base++;
  };

  // both sides
  for (const side of [1, -1]) {
    const start = base;
    for (let i = 0; i <= NS; i++) {
      for (let j = 0; j <= NG; j++) {
        const v = grid[i][j];
        pushVert(new THREE.Vector3(v.x * side, v.y, v.z));
      }
    }
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NG; j++) {
        const a = start + i * (NG + 1) + j;
        const b = a + 1;
        const c = a + (NG + 1);
        const d = c + 1;
        if (side > 0) { idx.push(a, b, c, b, d, c); }
        else { idx.push(a, c, b, b, c, d); }
      }
    }
  }

  // deck: span the two sheer lines with a cambered surface
  {
    const start = base;
    const NW = 7;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      const B = beamAt(t) * 0.995, S = sheerAt(t);
      for (let j = 0; j <= NW; j++) {
        const f = (j / NW) * 2 - 1;          // -1 port .. 1 starboard
        const camber = (1 - f * f) * 0.11;
        pushVert(new THREE.Vector3(B * f, S + camber, (t - 0.5) * LOA));
      }
    }
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NW; j++) {
        const a = start + i * (NW + 1) + j;
        idx.push(a, a + (NW + 1), a + 1, a + 1, a + (NW + 1), a + NW + 2);
      }
    }
    // paint the deck teak-ish, leaving a white margin at the toe rail
    for (let i = start; i < base; i++) {
      const j = (i - start) % (NW + 1);
      const edge = Math.abs((j / NW) * 2 - 1);
      const c = edge > 0.82 ? new THREE.Color(0xeceae4) : new THREE.Color(0xb08d5f).multiplyScalar(j % 2 ? 0.94 : 1.04);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Triangular sail from three corners, with camber, roach and a luff flutter. */
function sailGeometry(nU = 9, nV = 11) {
  const g = new THREE.BufferGeometry();
  const verts = new Float32Array((nU + 1) * (nV + 1) * 3);
  const idx = [];
  for (let v = 0; v < nV; v++) {
    for (let u = 0; u < nU; u++) {
      const a = v * (nU + 1) + u;
      idx.push(a, a + 1, a + nU + 1, a + 1, a + nU + 2, a + nU + 1);
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.userData = { nU, nV };
  return g;
}

const _t = new THREE.Vector3(), _h = new THREE.Vector3(), _c = new THREE.Vector3();
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _nrm = new THREE.Vector3();
const _p = new THREE.Vector3();

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
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);

    // state
    this.position = new THREE.Vector3(0, 0, 280);
    this.heading = Math.PI;      // pointing at the island
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

    this.build();
  }

  build() {
    const hullMat = applyAtmosphere(new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.28, metalness: 0.0,
      clearcoat: 0.85, clearcoatRoughness: 0.12,
    }));
    const hull = new THREE.Mesh(buildHull(), hullMat);
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.root.add(hull);

    const white = applyAtmosphere(new THREE.MeshStandardMaterial({ color: 0xeeece6, roughness: 0.45 }));
    const alloy = applyAtmosphere(new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.32, metalness: 0.85 }));
    const teak = applyAtmosphere(new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.72 }));
    const dark = applyAtmosphere(new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.5 }));
    // Sailcloth: bright but not blown out, so the camber still reads as shape.
    // The small emissive stands in for transmission — real sailcloth passes
    // light, so the windward face is never as dark as an opaque surface.
    this.sailMat = applyAtmosphere(new THREE.MeshStandardMaterial({
      color: 0xc9c7c0, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
      envMapIntensity: 0.5, emissive: 0xdfe4e8, emissiveIntensity: 0.11,
    }));

    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = this.root) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // coachroof, hatch and companionway
    add(new THREE.BoxGeometry(1.95, 0.58, 3.6), white, 0, 1.24, 1.15);
    add(new THREE.BoxGeometry(1.70, 0.10, 3.35), white, 0, 1.55, 1.12);
    add(new THREE.BoxGeometry(0.80, 0.06, 0.85), alloy, 0, 1.62, 2.35);   // sliding hatch
    add(new THREE.BoxGeometry(2.00, 0.30, 0.10), dark, 0, 1.24, 2.96);    // forward window
    add(new THREE.BoxGeometry(0.10, 0.26, 2.60), dark, 0.99, 1.24, 1.15);
    add(new THREE.BoxGeometry(0.10, 0.26, 2.60), dark, -0.99, 1.24, 1.15);
    add(new THREE.BoxGeometry(0.86, 0.52, 0.09), teak, 0, 1.20, -0.69);   // washboards
    add(new THREE.BoxGeometry(1.02, 0.09, 0.16), teak, 0, 0.92, -0.70);   // bridgedeck
    // cockpit coaming
    add(new THREE.BoxGeometry(0.16, 0.34, 3.4), white, 1.02, 1.14, -2.1);
    add(new THREE.BoxGeometry(0.16, 0.34, 3.4), white, -1.02, 1.14, -2.1);
    add(new THREE.BoxGeometry(2.2, 0.34, 0.16), white, 0, 1.14, -3.75);
    // cockpit sole and benches
    add(new THREE.BoxGeometry(2.0, 0.1, 3.4), teak, 0, 0.62, -2.1);
    add(new THREE.BoxGeometry(0.5, 0.1, 3.2), teak, 0.72, 0.95, -2.1);
    add(new THREE.BoxGeometry(0.5, 0.1, 3.2), teak, -0.72, 0.95, -2.1);

    // mast, boom, spreaders
    this.mastBase = new THREE.Vector3(0, 1.6, 1.05);
    this.mastHeight = 12.6;
    add(new THREE.CylinderGeometry(0.11, 0.14, this.mastHeight, 12), alloy,
      this.mastBase.x, this.mastBase.y + this.mastHeight / 2, this.mastBase.z);
    add(new THREE.BoxGeometry(2.6, 0.06, 0.09), alloy, 0, this.mastBase.y + 7.2, this.mastBase.z, 0, 0, 0.04);

    this.boomPivot = new THREE.Group();
    this.boomPivot.position.set(this.mastBase.x, this.mastBase.y + 1.35, this.mastBase.z);
    this.root.add(this.boomPivot);
    this.boomLength = 3.95;
    const boom = add(new THREE.CylinderGeometry(0.075, 0.085, this.boomLength, 10), alloy,
      0, 0, -this.boomLength / 2, Math.PI / 2, 0, 0, this.boomPivot);
    boom.castShadow = true;

    // wheel-less tiller, because you can feel a tiller
    this.tiller = new THREE.Group();
    this.tiller.position.set(0, 1.0, -3.5);
    this.root.add(this.tiller);
    add(new THREE.CylinderGeometry(0.045, 0.055, 1.5, 8), teak, 0, 0.12, 0.75, Math.PI / 2 - 0.12, 0, 0, this.tiller);

    // keel and rudder below the waterline
    add(new THREE.BoxGeometry(0.22, 1.35, 1.75), dark, 0, -1.05, -0.2);
    add(new THREE.CapsuleGeometry(0.16, 1.5, 4, 8), dark, 0, -1.72, -0.2, Math.PI / 2, 0, 0);
    this.rudderMesh = add(new THREE.BoxGeometry(0.09, 1.15, 0.62), dark, 0, -0.62, -3.55);

    // pulpit, stanchions and lifelines
    const lifeline = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const zz = -3.9 + t * 8.2;
      const st = (zz / LOA) + 0.5;
      const bx = beamAt(clamp(st, 0, 1)) - 0.06;
      const sy = sheerAt(clamp(st, 0, 1));
      for (const s of [1, -1]) {
        if (i % 3 === 0) add(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 6), alloy, bx * s, sy + 0.31, zz);
        lifeline.push(new THREE.Vector3(bx * s, sy + 0.6, zz));
      }
    }
    const llGeo = new THREE.BufferGeometry();
    const llPts = [];
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < 12; i++) {
        llPts.push(lifeline[i * 2 + s], lifeline[(i + 1) * 2 + s]);
      }
    }
    llGeo.setFromPoints(llPts);
    this.root.add(new THREE.LineSegments(llGeo, new THREE.LineBasicMaterial({ color: 0xd8d8d4 })));

    // standing rigging
    this.forestayTop = new THREE.Vector3(0, this.mastBase.y + this.mastHeight * 0.88, this.mastBase.z);
    this.bowPoint = new THREE.Vector3(0, sheerAt(0.985) + 0.1, LOA / 2 - 0.12);
    const rig = [
      this.forestayTop.clone(), this.bowPoint.clone(),
      new THREE.Vector3(0, this.mastBase.y + this.mastHeight - 0.1, this.mastBase.z), new THREE.Vector3(0, sheerAt(0.02) + 0.1, -LOA / 2 + 0.15),
      new THREE.Vector3(1.3, this.mastBase.y + 7.2, this.mastBase.z), new THREE.Vector3(1.28, sheerAt(0.55), 0.9),
      new THREE.Vector3(-1.3, this.mastBase.y + 7.2, this.mastBase.z), new THREE.Vector3(-1.28, sheerAt(0.55), 0.9),
      new THREE.Vector3(1.3, this.mastBase.y + 7.2, this.mastBase.z), new THREE.Vector3(0, this.mastBase.y + this.mastHeight - 0.4, this.mastBase.z),
      new THREE.Vector3(-1.3, this.mastBase.y + 7.2, this.mastBase.z), new THREE.Vector3(0, this.mastBase.y + this.mastHeight - 0.4, this.mastBase.z),
    ];
    const rigGeo = new THREE.BufferGeometry().setFromPoints(rig);
    this.root.add(new THREE.LineSegments(rigGeo, new THREE.LineBasicMaterial({ color: 0xc9ccd0 })));

    // running rigging that actually moves
    this.sheetGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
      new THREE.Vector3(), new THREE.Vector3(),
    ]);
    const sheets = new THREE.LineSegments(this.sheetGeo, new THREE.LineBasicMaterial({ color: 0xe0ddd2 }));
    sheets.frustumCulled = false;
    this.root.add(sheets);

    // sails
    this.mainGeo = sailGeometry(9, 12);
    this.main = new THREE.Mesh(this.mainGeo, this.sailMat);
    this.main.castShadow = true;
    this.main.frustumCulled = false;
    this.root.add(this.main);
    this.jibGeo = sailGeometry(8, 10);
    this.jib = new THREE.Mesh(this.jibGeo, this.sailMat);
    this.jib.castShadow = true;
    this.jib.frustumCulled = false;
    this.root.add(this.jib);

    // masthead burgee — the most honest wind instrument on the boat
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.burgeeGeo = bg;
    this.burgee = new THREE.Mesh(bg, applyAtmosphere(new THREE.MeshStandardMaterial({
      color: 0xd94a3d, roughness: 0.9, side: THREE.DoubleSide,
    })));
    this.burgee.frustumCulled = false;
    this.root.add(this.burgee);

    // where the helmsman's eyes are
    this.helm = new THREE.Group();
    this.helm.position.set(0.50, 2.28, -3.45);
    this.root.add(this.helm);
  }

  /** Compass bearing the boat is pointing, in radians. */
  get forward() { return _fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  get starboard() { return _stb.set(Math.cos(this.heading), 0, -Math.sin(this.heading)); }
  get speed() { return Math.hypot(this.surge, this.sway); }

  update(dt, input, wind, time) {
    const fwd = this.forward.clone();
    const stb = this.starboard.clone();

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
    // the trim that keeps the sail at its best angle of attack for this breeze
    const targetTrim = clamp((absBeta - 0.34) / MAX_BOOM, 0, 1);
    if (this.autoTrim) {
      this.mainTrim = damp(this.mainTrim, targetTrim, 2.2, dt);
    } else {
      this.mainTrim = clamp(this.mainTrim + input.trim * dt * 0.55, 0, 1);
    }
    const boomAngle = this.mainTrim * MAX_BOOM;   // 0 = sheeted on the centreline
    const tackSign = beta >= 0 ? 1 : -1;                     // +1 = wind from starboard
    const alpha = absBeta - boomAngle;                       // angle of attack

    // ---- sail force -------------------------------------------------------
    const a = clamp(alpha, -0.3, Math.PI / 2);
    let CL = 1.75 * Math.sin(2 * Math.max(a, 0));
    let CD = 0.10 + 1.30 * (1 - Math.cos(2 * Math.max(a, 0))) * 0.5;
    // a sail that is eased past the wind just flogs
    const luff = clamp((0.09 - a) / 0.20, 0, 1);
    this.luffing = luff;
    CL *= 1 - luff;
    CD *= 1 - luff * 0.55;
    // stall past about 35 degrees of attack, but never below the drag floor
    if (a > 0.62) CL *= Math.max(0.35, 1 - (a - 0.62) * 1.15);

    const heelFactor = Math.cos(this.heel);
    const q = 0.5 * RHO_AIR * awSpeed * awSpeed * SAIL_AREA * heelFactor;
    const lift = q * CL;
    const drag = q * CD;

    // drag acts along the apparent wind, lift across it on the leeward side
    const inv = awSpeed > 1e-3 ? 1 / awSpeed : 0;
    const wF = awF * inv, wS = awS * inv;
    let lF = -wS, lS = wF;
    if (beta < 0) { lF = -lF; lS = -lS; }

    let forceF = lift * lF + drag * wF;
    let forceS = lift * lS + drag * wS;

    // ---- hull resistance --------------------------------------------------
    const u = this.surge;
    let resist = 0.5 * RHO_WATER * 22 * 0.0102 * u * Math.abs(u);
    const over = Math.abs(u) / HULL_SPEED;
    if (over > 0.80) resist += Math.sign(u) * 9000 * Math.pow(over - 0.80, 2.2);
    const swayResist = 0.5 * RHO_WATER * 6.4 * 1.25 * this.sway * Math.abs(this.sway);

    // ---- integrate surge and sway -----------------------------------------
    const groundDrag = this.aground > 0 ? 9000 : 0;
    this.surge += ((forceF - resist - Math.sign(u) * groundDrag) / MASS) * dt;
    this.sway += ((forceS - swayResist) / MASS) * dt;
    this.surge = clamp(this.surge, -3, 12);
    this.sway = clamp(this.sway, -4, 4);
    this.driveForce = forceF;

    // ---- steering ----------------------------------------------------------
    const rudderTarget = clamp(input.rudder, -1, 1);
    this.rudder = damp(this.rudder, rudderTarget, 7, dt);
    const flow = Math.abs(u) + 0.4;
    const rudderLift = 0.5 * RHO_WATER * 0.42 * 4.6 * Math.sin(this.rudder * 0.62) * flow * flow;
    let yawMoment = rudderLift * 3.6 * Math.sign(u || 1);
    // weather helm: heeled hulls want to round up into the wind
    yawMoment += tackSign * Math.abs(this.heel) * 9000 * clamp(Math.abs(u) / 2, 0, 1);
    yawMoment += -this.yawRate * (26000 + 9000 * Math.abs(u));
    this.yawRate += (yawMoment / IZ) * dt;
    this.heading += this.yawRate * dt;

    // ---- heel ---------------------------------------------------------------
    const heelMoment = forceS * CE_HEIGHT;
    const righting = MASS * G * GM;
    const targetHeel = clamp(Math.atan2(heelMoment, righting), -0.75, 0.75);
    const k = 5.5, c = 2.6;
    this.heelRate += (k * (targetHeel - this.heel) - c * this.heelRate) * dt;
    this.heel += this.heelRate * dt;

    // ---- move ---------------------------------------------------------------
    this.position.addScaledVector(fwd, this.surge * dt);
    this.position.addScaledVector(stb, this.sway * dt);

    // ---- ground ------------------------------------------------------------
    const bed = terrainHeight(this.position.x, this.position.z);
    if (bed > -1.5) {
      this.aground = 1;
      // shove her back off the shelf
      const gx = terrainHeight(this.position.x + 2, this.position.z) - bed;
      const gz = terrainHeight(this.position.x, this.position.z + 2) - bed;
      this.position.x -= gx * dt * 14;
      this.position.z -= gz * dt * 14;
      this.surge *= 0.90;
    } else {
      this.aground = Math.max(0, this.aground - dt);
    }

    // ---- ride the waves ----------------------------------------------------
    const s0 = sampleOcean(this.position.x, this.position.z, time, _s0);
    const bowP = _w1.copy(fwd).multiplyScalar(LOA * 0.42);
    const s1 = sampleOcean(this.position.x + bowP.x, this.position.z + bowP.z, time, _s1);
    const s2 = sampleOcean(this.position.x - bowP.x, this.position.z - bowP.z, time, _s2);
    const sideP = _w2.copy(stb).multiplyScalar(BEAM * 0.5);
    const s3 = sampleOcean(this.position.x + sideP.x, this.position.z + sideP.z, time, _s3);
    const s4 = sampleOcean(this.position.x - sideP.x, this.position.z - sideP.z, time, _s4);

    const ride = (s0.y * 0.4 + (s1.y + s2.y) * 0.2 + (s3.y + s4.y) * 0.1);
    const wavePitch = Math.atan2(s1.y - s2.y, LOA * 0.84);
    const waveRoll = Math.atan2(s3.y - s4.y, BEAM);

    this.position.y = damp(this.position.y, ride - 0.04, 14, dt);
    this.pitch = damp(this.pitch, -wavePitch * 0.85 - clamp(this.surge / 12, 0, 0.1), 6, dt);
    this.waveRoll = damp(this.waveRoll || 0, waveRoll * 0.7, 5, dt);

    // ---- pose ---------------------------------------------------------------
    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;
    this.root.rotation.x = this.pitch;
    this.root.rotation.z = -(this.heel + this.waveRoll);

    this.updateRig(boomAngle * tackSign, tackSign, beta, time);
    return { boomAngle, tackSign };
  }

  /** boomAngle is signed: negative puts the boom out to port. */
  updateRig(boomAngle, tackSign, beta, time) {
    // the boom swings aft from the gooseneck
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
      1.35,
      this.bowPoint.z - Math.cos(jibAngle) * 3.5
    );
    updateSail(this.jibGeo, jTack, jHead, jClew, camber * 0.85, 0.05, this.luffing * 0.26, time);

    // sheets
    const sp = this.sheetGeo.getAttribute('position');
    const traveler = _b6.set(0, 1.18, -1.85);
    sp.setXYZ(0, clewLocal.x, clewLocal.y, clewLocal.z);
    sp.setXYZ(1, traveler.x, traveler.y, traveler.z);
    sp.setXYZ(2, jClew.x, jClew.y, jClew.z);
    sp.setXYZ(3, 1.0 * sheetSide, 1.2, -1.2);
    sp.setXYZ(4, this.bowPoint.x, this.bowPoint.y, this.bowPoint.z);
    sp.setXYZ(5, jTack.x, jTack.y + 0.02, jTack.z);
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

const _fwd = new THREE.Vector3();
const _stb = new THREE.Vector3();
const _w1 = new THREE.Vector3();
const _w2 = new THREE.Vector3();
const _w3 = new THREE.Vector3();
const _b1 = new THREE.Vector3();
const _b2 = new THREE.Vector3();
const _b3 = new THREE.Vector3();
const _b4 = new THREE.Vector3();
const _b5 = new THREE.Vector3();
const _b6 = new THREE.Vector3();
const mk = () => ({ y: 0, normal: new THREE.Vector3(), fold: 1 });
const _s0 = mk(), _s1 = mk(), _s2 = mk(), _s3 = mk(), _s4 = mk();
