import * as THREE from 'three';
import { terrainHeight, TOWN_CENTER, findShore, ISLAND } from './terrain.js';
import { applyAtmosphere } from './materials.js';
import { mergeGeometries, prepare, makeRng, clamp } from './utils.js';
import { PROP_LAYER } from './layers.js';

/**
 * A whitewashed fishing town terraced up the hillside above the bay, a stone
 * harbour arm, and a lighthouse on the eastern headland.
 *
 * Everything static is baked down into a handful of merged meshes with vertex
 * colours for variation, because the scene is drawn three times a frame
 * (reflection, refraction, beauty) and draw calls are the budget.
 */

const rng = makeRng(20240610);

function gableRoof(w, d, h) {
  // ridge runs along z, gables face +-x
  const hw = w / 2, hd = d / 2;
  const v = [];
  const push = (...pts) => { for (const p of pts) v.push(...p); };
  const a = [-hw, 0, -hd], b = [hw, 0, -hd], c = [hw, 0, hd], dd = [-hw, 0, hd];
  const r0 = [0, h, -hd], r1 = [0, h, hd];
  push(a, r1, r0); push(a, dd, r1);          // -x slope
  push(b, r0, r1); push(b, r1, c);           // +x slope
  push(a, r0, b);                            // gable -z
  push(dd, c, r1);                           // gable +z
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

const WALL_TINTS = [0xf2ece0, 0xeae3d4, 0xf6f1e6, 0xe6dcc8, 0xf0e6d2, 0xdfd4c0, 0xf4eee2];
const ROOF_TINTS = [0xa8492e, 0x9c4128, 0xb85736, 0x8f3a24, 0xa74f30, 0xc06341];

/** One house: walls, roof, openings, sometimes a chimney and a balcony. */
function house(parts, x, z, w, d, storeys, rot, seed) {
  const r = makeRng(seed);
  const corners = [
    terrainHeight(x - w / 2, z - d / 2), terrainHeight(x + w / 2, z - d / 2),
    terrainHeight(x - w / 2, z + d / 2), terrainHeight(x + w / 2, z + d / 2),
  ];
  const base = Math.min(...corners) - 0.8;
  const top = Math.max(...corners);
  if (top - base > 9) return; // too steep, skip this plot

  const hgt = storeys * 3.05 + (top - base);
  const wallColor = WALL_TINTS[(r() * WALL_TINTS.length) | 0];
  const roofColor = ROOF_TINTS[(r() * ROOF_TINTS.length) | 0];

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0));
  const one = new THREE.Vector3(1, 1, 1);
  const off = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const place = (geo, ox, oy, oz, color, bucket) => {
    off.set(ox, 0, oz).applyQuaternion(q);
    pos.set(x + off.x, base + oy, z + off.z);
    m.compose(pos, q, one);
    bucket.push(prepare(geo, m, color));
  };

  place(box(w, hgt, d), 0, hgt / 2, 0, wallColor, parts.walls);

  const roofH = 1.05 + r() * 0.9;
  const flat = r() < 0.22;
  if (flat) {
    place(box(w + 0.35, 0.45, d + 0.35), 0, hgt + 0.22, 0, wallColor, parts.walls);
    place(box(w + 0.5, 0.22, d + 0.5), 0, hgt + 0.5, 0, roofColor, parts.roofs);
  } else {
    place(gableRoof(w + 0.7, d + 0.7, roofH), 0, hgt, 0, roofColor, parts.roofs);
  }

  // windows: shuttered openings punched into the seaward face
  const rows = storeys;
  const cols = Math.max(1, Math.round(w / 2.6));
  for (let ry = 0; ry < rows; ry++) {
    for (let cxi = 0; cxi < cols; cxi++) {
      if (r() < 0.16) continue;
      const wx = (cxi + 0.5) / cols * w - w / 2;
      const wy = (top - base) + ry * 3.05 + 1.75;
      if (wy > hgt - 0.7) continue;
      place(box(0.95, 1.25, 0.14), wx, wy, d / 2 + 0.03, 0x2a2b30, parts.dark);
      if (r() < 0.55) {
        place(box(0.52, 1.3, 0.1), wx - 0.72, wy, d / 2 + 0.1, r() < 0.5 ? 0x3f6f86 : 0x6a8a58, parts.trim);
        place(box(0.52, 1.3, 0.1), wx + 0.72, wy, d / 2 + 0.1, r() < 0.5 ? 0x3f6f86 : 0x6a8a58, parts.trim);
      }
      if (ry > 0 && r() < 0.35) {
        place(box(1.9, 0.12, 0.75), wx, wy - 0.72, d / 2 + 0.36, wallColor, parts.walls);
        place(box(1.9, 0.55, 0.07), wx, wy - 0.45, d / 2 + 0.72, 0x30323a, parts.dark);
      }
    }
  }
  // door
  place(box(1.05, 2.15, 0.14), (r() - 0.5) * (w - 2), (top - base) + 1.07, d / 2 + 0.03, 0x4a3524, parts.trim);

  if (!flat && r() < 0.5) {
    place(box(0.7, 1.5 + r(), 0.7), (r() - 0.5) * w * 0.6, hgt + 0.6, (r() - 0.5) * d * 0.5, wallColor, parts.walls);
  }
}

function church(parts, x, z) {
  const g = terrainHeight(x, z);
  const m = new THREE.Matrix4();
  const at = (geo, px, py, pz, color, bucket, ry = 0) => {
    m.compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
    bucket.push(prepare(geo, m, color));
  };
  at(box(11, 8, 17), x, g + 3.6, z, 0xf6f2e8, parts.walls);
  at(gableRoof(11.8, 17.8, 2.6), x, g + 7.6, z, 0x8f3a24, parts.roofs);
  at(box(4.6, 19, 4.6), x - 7, g + 9, z + 5, 0xf6f2e8, parts.walls);
  at(box(5.2, 0.5, 5.2), x - 7, g + 18.7, z + 5, 0x8f3a24, parts.roofs);
  at(new THREE.ConeGeometry(3.4, 5.2, 8), x - 7, g + 21.4, z + 5, 0x3d6f7a, parts.roofs);
  at(box(1.7, 2.4, 0.2), x - 7, g + 15.5, z + 7.4, 0x24252a, parts.dark);
  // a small cross on the ridge
  at(box(0.22, 1.7, 0.22), x - 7, g + 24.6, z + 5, 0xd8d2c4, parts.trim);
  at(box(1.0, 0.22, 0.22), x - 7, g + 24.9, z + 5, 0xd8d2c4, parts.trim);
}

function lighthouse(parts, x, z) {
  const g = terrainHeight(x, z);
  const m = new THREE.Matrix4();
  const at = (geo, py, color, bucket) => {
    m.makeTranslation(x, py, z);
    bucket.push(prepare(geo, m, color));
  };
  at(new THREE.CylinderGeometry(4.6, 5.6, 2.2, 20), g + 0.9, 0x8d8578, parts.stone);
  at(new THREE.CylinderGeometry(2.3, 3.4, 15, 20), g + 9.4, 0xf4f1ea, parts.walls);
  at(new THREE.CylinderGeometry(2.55, 2.75, 2.4, 20), g + 6.2, 0xb5392c, parts.roofs);
  at(new THREE.CylinderGeometry(2.35, 2.45, 2.2, 20), g + 13.4, 0xb5392c, parts.roofs);
  at(new THREE.CylinderGeometry(3.0, 3.0, 0.5, 20), g + 17.1, 0x5a5f66, parts.stone);
  at(new THREE.CylinderGeometry(1.9, 1.9, 2.6, 12), g + 18.6, 0x2b2f34, parts.dark);
  at(new THREE.ConeGeometry(2.6, 2.0, 12), g + 21.0, 0x39404a, parts.stone);
  return new THREE.Vector3(x, g + 18.6, z);
}

/** Stone harbour arm curling out from the western side of the bay. */
function harbour(parts) {
  const m = new THREE.Matrix4();
  const pts = [];
  const start = findShore(-0.40, 1.5);
  // sweep out from the shore and then hook back east to shelter the moorings
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    const ang = -0.30 + t * 1.5;
    pts.push(new THREE.Vector2(
      start.x + Math.sin(ang) * 150 * t - Math.sin(-0.30) * 150 * t,
      start.y + (Math.cos(ang) - Math.cos(-0.30)) * 150 * t + t * 40
    ));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const mid = new THREE.Vector2().addVectors(a, b).multiplyScalar(0.5);
    const dir = new THREE.Vector2().subVectors(b, a);
    const len = dir.length() + 0.6;
    const rot = Math.atan2(dir.x, dir.y);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0));
    const bed = Math.min(terrainHeight(mid.x, mid.y), -1.2);
    const h = 2.4 - bed;
    m.compose(new THREE.Vector3(mid.x, bed + h / 2, mid.y), q, new THREE.Vector3(1, 1, 1));
    parts.stone.push(prepare(box(13, h, len), m, i % 2 ? 0x8b8377 : 0x958c7f));
    // parapet
    m.compose(new THREE.Vector3(mid.x - Math.cos(rot) * 5.6, 3.3, mid.y + Math.sin(rot) * 5.6), q, new THREE.Vector3(1, 1, 1));
    parts.stone.push(prepare(box(1.4, 1.5, len), m, 0x9a9184));
    if (i % 4 === 0) {
      m.makeTranslation(mid.x + Math.cos(rot) * 4.2, 3.0, mid.y - Math.sin(rot) * 4.2);
      parts.dark.push(prepare(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8), m, 0x2f3238));
    }
  }
  return pts;
}

function makeTrees(group, atmosphere) {
  const cypressGeo = new THREE.ConeGeometry(1.5, 11, 7);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 3, 6);
  const bushGeo = new THREE.IcosahedronGeometry(2.1, 0);
  const oliveGeo = new THREE.IcosahedronGeometry(2.9, 1);

  const cypressMat = atmosphere(new THREE.MeshStandardMaterial({ color: 0x24401f, roughness: 0.95, flatShading: true }));
  const trunkMat = atmosphere(new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }));
  const bushMat = atmosphere(new THREE.MeshStandardMaterial({ color: 0x4a5a2c, roughness: 1, flatShading: true }));
  const oliveMat = atmosphere(new THREE.MeshStandardMaterial({ color: 0x63704a, roughness: 1, flatShading: true }));

  const cyp = [], trunks = [], bushes = [], olives = [];
  const dummy = new THREE.Object3D();
  const r = makeRng(777);

  for (let i = 0; i < 1400; i++) {
    const x = TOWN_CENTER.x + (r() - 0.5) * 1700;
    const z = TOWN_CENTER.y + (r() - 0.5) * 1300;
    const h = terrainHeight(x, z);
    if (h < 3.2 || h > 78) continue;
    const slope = Math.abs(terrainHeight(x + 3, z) - h) + Math.abs(terrainHeight(x, z + 3) - h);
    if (slope > 2.6) continue;
    const inTown = Math.hypot(x - TOWN_CENTER.x, z - TOWN_CENTER.y) < 150;
    const kind = r();
    dummy.position.set(x, h, z);
    dummy.rotation.set(0, r() * 6.28, 0);
    if (kind < 0.16 && !inTown) {
      const s = 0.55 + r() * 0.75;
      dummy.scale.set(s, s * (0.8 + r() * 0.6), s);
      dummy.position.y = h + 5.5 * dummy.scale.y;
      dummy.updateMatrix(); cyp.push(dummy.matrix.clone());
      dummy.position.y = h + 1.5; dummy.scale.set(s, s, s);
      dummy.updateMatrix(); trunks.push(dummy.matrix.clone());
    } else if (kind < 0.42) {
      const s = 0.5 + r() * 0.8;
      dummy.scale.set(s * 1.3, s * 0.75, s * 1.3);
      dummy.position.y = h + 1.1 * s;
      dummy.updateMatrix(); bushes.push(dummy.matrix.clone());
    } else if (kind < 0.55 && !inTown) {
      const s = 0.7 + r() * 0.7;
      dummy.scale.set(s * 1.15, s * 0.85, s * 1.15);
      dummy.position.y = h + 3.1 * s;
      dummy.updateMatrix(); olives.push(dummy.matrix.clone());
      dummy.position.y = h + 1.4; dummy.scale.set(s, s, s);
      dummy.updateMatrix(); trunks.push(dummy.matrix.clone());
    }
  }

  const add = (geo, mat, mats) => {
    if (!mats.length) return;
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    im.layers.set(PROP_LAYER);
    group.add(im);
  };
  add(cypressGeo, cypressMat, cyp);
  add(trunkGeo, trunkMat, trunks);
  add(bushGeo, bushMat, bushes);
  add(oliveGeo, oliveMat, olives);
}

function makeRocks(group, atmosphere) {
  const geos = [
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.IcosahedronGeometry(1, 1),
  ];
  for (const g of geos) {
    const pos = g.getAttribute('position');
    const r = makeRng(3);
    for (let i = 0; i < pos.count; i++) {
      const s = 0.72 + r() * 0.56;
      pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.8, pos.getZ(i) * s);
    }
    g.computeVertexNormals();
  }
  const mat = atmosphere(new THREE.MeshStandardMaterial({ color: 0x6d6659, roughness: 1, flatShading: true }));
  const buckets = geos.map(() => []);
  const dummy = new THREE.Object3D();
  const r = makeRng(4242);

  for (let i = 0; i < 2600; i++) {
    const x = (r() - 0.5) * 2400;
    const z = -880 + (r() - 0.5) * 2000;
    const h = terrainHeight(x, z);
    if (h < -9 || h > 60) continue;
    const shore = Math.abs(h) < 4;
    if (!shore && r() < 0.72) continue;
    const slope = Math.abs(terrainHeight(x + 4, z) - h) + Math.abs(terrainHeight(x, z + 4) - h);
    if (h > 4 && slope < 1.6 && r() < 0.85) continue;
    const s = (shore ? 0.7 : 1.4) * (0.5 + r() * 2.4);
    dummy.position.set(x, h + s * 0.35, z);
    dummy.rotation.set(r() * 6.28, r() * 6.28, r() * 6.28);
    dummy.scale.set(s * (0.8 + r() * 0.5), s * (0.6 + r() * 0.5), s * (0.8 + r() * 0.5));
    dummy.updateMatrix();
    buckets[(r() * geos.length) | 0].push(dummy.matrix.clone());
  }
  geos.forEach((g, i) => {
    if (!buckets[i].length) return;
    const im = new THREE.InstancedMesh(g, mat, buckets[i].length);
    buckets[i].forEach((m, k) => im.setMatrixAt(k, m));
    im.castShadow = true;
    im.receiveShadow = true;
    im.layers.set(PROP_LAYER);
    group.add(im);
  });
}

/** Gulls wheeling over the bay. Cheap, but the sky feels dead without them. */
export function makeBirds(scene) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0.5, -1.1, 0, -0.35, -0.25, 0, -0.1,
    0, 0, 0.5, 0.25, 0, -0.1, 1.1, 0, -0.35,
  ]), 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0xf2f2ee, side: THREE.DoubleSide });
  const group = new THREE.Group();
  const birds = [];
  const r = makeRng(99);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(g, mat);
    m.scale.setScalar(0.9 + r() * 0.5);
    m.layers.set(PROP_LAYER);
    group.add(m);
    birds.push({
      mesh: m,
      cx: (r() - 0.5) * 500, cz: -420 + (r() - 0.5) * 400,
      radius: 45 + r() * 130, y: 28 + r() * 55,
      phase: r() * 6.28, speed: 0.09 + r() * 0.07, flap: 3 + r() * 3,
    });
  }
  scene.add(group);
  return (t) => {
    for (const b of birds) {
      const a = b.phase + t * b.speed;
      b.mesh.position.set(b.cx + Math.cos(a) * b.radius, b.y + Math.sin(a * 1.7) * 3.5, b.cz + Math.sin(a) * b.radius);
      b.mesh.rotation.set(Math.sin(t * b.flap + b.phase) * 0.55, -a + Math.PI / 2, Math.sin(a * 1.7) * 0.2);
    }
  };
}

export function buildTown(scene) {
  const group = new THREE.Group();
  const parts = { walls: [], roofs: [], dark: [], trim: [], stone: [], wood: [] };

  // --- streets: arcs of houses following the contours above the bay --------
  // terraced streets: arcs that follow the contours up from the waterfront
  const bay = new THREE.Vector2(0, -288);
  let seed = 1;
  for (let ring = 0; ring < 8; ring++) {
    const radius = 42 + ring * 46;
    const count = 11 + ring * 6;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const ang = -1.28 + t * 2.56 + (rng() - 0.5) * 0.06;
      const rr = radius + (rng() - 0.5) * 22;
      const x = bay.x + Math.sin(ang) * rr * 1.28;
      const z = bay.y - Math.cos(ang) * rr * 0.86;
      const h = terrainHeight(x, z);
      if (h < 2.6 || h > 66) continue;
      const slope = Math.abs(terrainHeight(x + 6, z) - h) + Math.abs(terrainHeight(x, z + 6) - h);
      if (slope > 6.5) continue;
      const w = 7.0 + rng() * 5.5;
      const d = 6.5 + rng() * 5.0;
      // taller closer to the harbour, the way a real waterfront stacks up
      const storeys = 2 + ((rng() * (ring < 3 ? 2.8 : 2.0)) | 0);
      house(parts, x, z, w, d, clamp(storeys, 1, 3), Math.atan2(bay.x - x, bay.y - z) + (rng() - 0.5) * 0.35, seed++);
    }
  }
  church(parts, TOWN_CENTER.x + 34, TOWN_CENTER.y + 62);

  // --- harbour ------------------------------------------------------------
  const pierPts = harbour(parts);

  // warehouse and chandlery at the root of the pier
  {
    const root = findShore(-0.40, 4.0);
    const inward = new THREE.Vector2(ISLAND.center.x - root.x, ISLAND.center.y - root.y).normalize();
    house(parts, root.x + inward.x * 18, root.y + inward.y * 18, 15, 9, 1, Math.atan2(-inward.x, -inward.y), 991);
    house(parts, root.x + inward.x * 40 - 14, root.y + inward.y * 40, 10, 8, 2, Math.atan2(-inward.x, -inward.y) + 0.3, 992);
  }

  // --- lighthouse on the eastern headland ---------------------------------
  const head = findShore(0.55, 9.0);
  const lightPos = lighthouse(parts, head.x, head.y);

  // --- wooden jetty running off the beach ---------------------------------
  {
    const m = new THREE.Matrix4();
    const root = findShore(0.16, 1.2);
    const outward = new THREE.Vector2(root.x - ISLAND.center.x, root.y - ISLAND.center.y).normalize();
    for (let i = 0; i < 18; i++) {
      const px = root.x + outward.x * i * 7.0;
      const pz = root.y + outward.y * i * 7.0;
      const bed = terrainHeight(px, pz);
      if (bed < -4.5) break;
      const legH = 2.0 - bed;
      const perp = new THREE.Vector2(-outward.y, outward.x).multiplyScalar(2.2);
      for (const s of [-1, 1]) {
        m.makeTranslation(px + perp.x * s, bed + legH / 2, pz + perp.y * s);
        parts.wood.push(prepare(new THREE.CylinderGeometry(0.22, 0.22, legH, 6), m, 0x5b4530));
      }
      m.compose(
        new THREE.Vector3(px, 2.0, pz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(outward.x, outward.y), 0)),
        new THREE.Vector3(1, 1, 1)
      );
      parts.wood.push(prepare(box(5.4, 0.24, 7.2), m, i % 2 ? 0x8a7357 : 0x7d6a50));
    }
  }

  // --- assemble ------------------------------------------------------------
  const mk = (list, color, roughness, metalness = 0) => {
    if (!list.length) return null;
    const mat = applyAtmosphere(new THREE.MeshStandardMaterial({
      vertexColors: true, color, roughness, metalness, flatShading: false,
    }));
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  mk(parts.walls, 0xffffff, 0.88);
  mk(parts.roofs, 0xffffff, 0.82);
  mk(parts.dark, 0xffffff, 0.42);
  mk(parts.trim, 0xffffff, 0.6);
  mk(parts.stone, 0xffffff, 0.95);
  mk(parts.wood, 0xffffff, 0.9);

  makeTrees(group, applyAtmosphere);
  makeRocks(group, applyAtmosphere);

  scene.add(group);
  return { group, lightPos, pierPts };
}
