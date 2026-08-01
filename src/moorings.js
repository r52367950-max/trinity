import * as THREE from 'three';
import { applyAtmosphere } from './materials.js';
import { PROP_LAYER } from './layers.js';
import { terrainHeight } from './terrain.js';
import { sampleOcean } from './waves.js';
import { mergeGeometries, prepare, trs, makeRng, clamp } from './utils.js';

/**
 * The rest of the bay: a working fleet on its moorings, pot buoys strung
 * through the shallows, and a stack of rock standing offshore.
 *
 * Everything here rides the same wave function the player's hull does, so a
 * swell rolling into the bay lifts the whole anchorage in sequence rather than
 * leaving a row of boats pasted flat on a moving surface. Each hull is one
 * merged mesh and every buoy is one instanced draw, because there are forty of
 * them and they are worth almost nothing individually.
 */

const rng = makeRng(80531);

/** A small workboat: chined hull, wheelhouse, mast, and a colour of her own. */
function buildSmallHull(loa, beam, hullColor, trimColor) {
  const NS = 22, NG = 8;
  const pos = [], col = [], idx = [];
  let base = 0;
  const cH = new THREE.Color(hullColor);
  const cT = new THREE.Color(trimColor);
  const cDark = new THREE.Color(0x15202b);

  const halfBeam = (t) => {
    const s = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.62))), 0.5);
    return (beam / 2) * Math.max(s, 0.5 * (1 - Math.min(1, t / 0.18)));
  };
  const depth = (t) => 0.26 + 0.34 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.6))), 0.6);
  const sheer = (t) => 0.52 + 0.40 * Math.pow(t, 2.3);

  const grid = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS;
    const B = halfBeam(t), D = depth(t), S = sheer(t);
    const row = [];
    for (let j = 0; j <= NG; j++) {
      const a = (j / NG) * Math.PI / 2;
      const x = B * Math.pow(Math.sin(a), 0.7);
      const y = -D * Math.pow(Math.cos(a), 1.6) + (S + D) * Math.pow(Math.sin(a), 2.2);
      row.push([x, y, (t - 0.5) * loa + 0.2 * Math.max(0, y) * Math.max(0, t - 0.7)]);
    }
    grid.push(row);
  }
  const colorAt = (y, S) => (y < -0.02 ? cDark : S - y < 0.13 ? cT : cH);
  const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); return base++; };

  for (const side of [1, -1]) {
    const start = base;
    for (let i = 0; i <= NS; i++) {
      const S = sheer(i / NS);
      for (const [x, y, z] of grid[i]) push(x * side, y, z, colorAt(y, S));
    }
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NG; j++) {
        const a = start + i * (NG + 1) + j;
        if (side > 0) idx.push(a, a + 1, a + NG + 1, a + 1, a + NG + 2, a + NG + 1);
        else idx.push(a, a + NG + 1, a + 1, a + 1, a + NG + 1, a + NG + 2);
      }
    }
  }
  // transom
  {
    const start = base;
    const S = sheer(0);
    for (const [x, y, z] of grid[0]) {
      const c = colorAt(y, S);
      push(x, y, z, c); push(-x, y, z, c);
    }
    for (let j = 0; j < NG; j++) {
      const s0 = start + j * 2;
      idx.push(s0, s0 + 1, s0 + 2, s0 + 1, s0 + 3, s0 + 2);
    }
  }
  // deck
  {
    const start = base;
    const NW = 5;
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      const [ox, oy, oz] = grid[i][NG];
      for (let j = 0; j <= NW; j++) {
        const f = (j / NW) * 2 - 1;
        push(ox * f, oy - 0.02 + (1 - f * f) * 0.05, oz, cT);
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

function keepColors(geometry, matrix) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (matrix) g.applyMatrix4(matrix);
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  }
  g.deleteAttribute('tangent');
  return g;
}

const FLEET = [
  { loa: 7.6, beam: 2.6, hull: 0x2f6f8c, trim: 0xe8e4da, house: 0xe8e4da, kind: 'trawler' },
  { loa: 6.4, beam: 2.2, hull: 0xb8433a, trim: 0xefeae0, house: 0xefeae0, kind: 'launch' },
  { loa: 8.4, beam: 2.9, hull: 0x1f4030, trim: 0xd9d3c4, house: 0xd9d3c4, kind: 'trawler' },
  { loa: 5.6, beam: 2.0, hull: 0xe0dbcf, trim: 0x3a5a72, house: 0x3a5a72, kind: 'open' },
  { loa: 7.0, beam: 2.4, hull: 0xd9a53c, trim: 0xefeae0, house: 0xefeae0, kind: 'launch' },
  { loa: 6.0, beam: 2.1, hull: 0x37516b, trim: 0xe6e1d6, house: 0xe6e1d6, kind: 'open' },
];

function buildFleetBoat(spec) {
  const parts = [];
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s);
  const L = spec.loa;

  parts.push(keepColors(buildSmallHull(L, spec.beam, spec.hull, spec.trim)));

  if (spec.kind !== 'open') {
    // wheelhouse, set aft, with a dark screen band
    const hw = spec.beam * 0.52, hh = 0.95, hz = -L * 0.16;
    parts.push(prepare(box(hw, hh, L * 0.26), trs(0, 0.98, hz), spec.house));
    parts.push(prepare(box(hw * 0.94, 0.26, L * 0.262), trs(0, 1.24, hz), 0x1a2028));
    parts.push(prepare(box(hw + 0.10, 0.07, L * 0.28), trs(0, 1.48, hz), spec.house));
    parts.push(prepare(cyl(0.035, 0.045, 1.1), trs(0, 2.05, hz), 0xb9bcc0));
  }
  // mast and boom, the derrick every working boat carries
  parts.push(prepare(cyl(0.05, 0.07, 3.4), trs(0, 2.10, L * 0.10), 0xb0743e));
  parts.push(prepare(cyl(0.035, 0.045, 1.9), trs(0, 3.20, L * 0.10 - 0.60, 0.62, 0, 0), 0xb0743e));
  // a couple of pot floats and a tyre fender or two on deck
  for (let i = 0; i < 3; i++) {
    parts.push(prepare(new THREE.SphereGeometry(0.16, 7, 5),
      trs((rng() - 0.5) * spec.beam * 0.5, 0.72, -L * 0.34 + i * 0.5), i % 2 ? 0xe0642c : 0xe8e2d4));
  }
  for (const s of [1, -1]) {
    parts.push(prepare(new THREE.TorusGeometry(0.20, 0.07, 5, 9),
      trs(s * spec.beam * 0.50, 0.34, L * 0.06, 0, Math.PI / 2, 0), 0x25282c));
  }
  return mergeGeometries(parts);
}

/**
 * Everything that floats but is not sailed. Returns an update(time) to be
 * called once a frame.
 */
export function buildMoorings(scene, { jettyEnd, jettyDir } = {}) {
  const mat = applyAtmosphere(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.66, metalness: 0.05,
  }));
  const buoyMat = applyAtmosphere(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.55,
  }));

  const floats = [];

  // ---- the fleet, strung along the sheltered water behind the harbour arm ----
  const anchor = jettyEnd ? new THREE.Vector2(jettyEnd.x, jettyEnd.y) : new THREE.Vector2(0, 60);
  const along = jettyDir ? new THREE.Vector2(-jettyDir.y, jettyDir.x) : new THREE.Vector2(1, 0);
  const out = jettyDir ? new THREE.Vector2(jettyDir.x, jettyDir.y) : new THREE.Vector2(0, 1);

  FLEET.forEach((spec, i) => {
    const lane = i % 2;
    const t = (i - FLEET.length / 2) * 17 + (rng() - 0.5) * 7;
    const off = 16 + lane * 21 + rng() * 6;
    const px = anchor.x + along.x * t + out.x * off;
    const pz = anchor.y + along.y * t + out.y * off;
    // never leave one sitting on the bottom
    if (terrainHeight(px, pz) > -2.4) return;

    const g = new THREE.Group();
    const mesh = new THREE.Mesh(buildFleetBoat(spec), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    g.position.set(px, 0, pz);
    // moored boats lie to the wind, near enough
    g.rotation.y = 0.9 + (rng() - 0.5) * 0.5;
    scene.add(g);
    floats.push({ group: g, x: px, z: pz, len: spec.loa, roll: 0.4 + rng() * 0.5, phase: rng() * 9 });
  });

  // ---- pot buoys: one instanced draw for the lot ----
  const buoyGeo = mergeGeometries([
    prepare(new THREE.SphereGeometry(0.24, 9, 7), trs(0, 0.06, 0), 0xffffff),
    prepare(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), trs(0, 0.52, 0), 0x2a2d33),
    prepare(new THREE.BoxGeometry(0.20, 0.14, 0.02), trs(0, 0.92, 0), 0xffffff),
  ]);
  const spots = [];
  for (let i = 0; i < 120 && spots.length < 44; i++) {
    const a = rng() * Math.PI * 2;
    const r = 120 + rng() * 620;
    const x = Math.sin(a) * r;
    const z = 60 - Math.cos(a) * r * 0.55;
    const d = -terrainHeight(x, z);
    if (d < 6 || d > 46) continue;             // pots go on the shelf, not the deep
    spots.push([x, z, rng()]);
  }
  const buoys = new THREE.InstancedMesh(buoyGeo, buoyMat, spots.length);
  buoys.castShadow = false;
  buoys.frustumCulled = false;
  buoys.layers.set(PROP_LAYER);                // too small to matter in the mirror
  buoys.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3), 3);
  const tint = new THREE.Color();
  spots.forEach(([, , h], i) => {
    tint.setHSL(h < 0.5 ? 0.06 + h * 0.06 : 0.14 + h * 0.02, 0.75, 0.52);
    buoys.setColorAt(i, tint);
  });
  scene.add(buoys);

  // ---- an offshore stack, because an empty horizon is a wasted one ----
  {
    const parts = [];
    const base = new THREE.Vector2(-430, 210);
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * 26;
      const h = 6 + rng() * 26;
      const w = 5 + rng() * 13;
      parts.push(prepare(
        new THREE.ConeGeometry(w, h, 5 + Math.floor(rng() * 3), 1),
        trs(Math.sin(a) * r, h * 0.5 - 5, Math.cos(a) * r,
          (rng() - 0.5) * 0.2, rng() * 3, (rng() - 0.5) * 0.2),
        i % 3 === 0 ? 0x6b6459 : i % 3 === 1 ? 0x5a5750 : 0x77705f));
    }
    const stack = new THREE.Mesh(mergeGeometries(parts),
      applyAtmosphere(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
    stack.position.set(base.x, 0, base.y);
    stack.castShadow = true;
    stack.receiveShadow = true;
    scene.add(stack);
  }

  const s = { y: 0, normal: new THREE.Vector3(), fold: 1 };
  const dummy = new THREE.Object3D();

  return function updateMoorings(time) {
    for (const f of floats) {
      sampleOcean(f.x, f.z, time, s);
      f.group.position.y = s.y - 0.06;
      // moored boats snub about on their chains rather than lying still
      f.group.rotation.z = Math.atan2(s.normal.x, s.normal.y) * f.roll;
      f.group.rotation.x = -Math.atan2(s.normal.z, s.normal.y) * f.roll * 0.7;
    }
    for (let i = 0; i < spots.length; i++) {
      const [x, z, h] = spots[i];
      sampleOcean(x, z, time, s);
      dummy.position.set(x, s.y - 0.14, z);
      dummy.rotation.set(
        -Math.atan2(s.normal.z, s.normal.y) * 0.9,
        h * 6.2,
        Math.atan2(s.normal.x, s.normal.y) * 0.9
      );
      dummy.updateMatrix();
      buoys.setMatrixAt(i, dummy.matrix);
    }
    buoys.instanceMatrix.needsUpdate = true;
  };
}
