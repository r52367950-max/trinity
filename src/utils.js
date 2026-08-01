import * as THREE from 'three';

/** Deterministic RNG so the world is identical on every load. */
export function makeRng(seed = 1337) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Shortest signed angular difference, radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
/** Frame-rate independent exponential smoothing. */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}
/** The same, but taking the short way round the circle. */
export function dampAngle(current, target, lambda, dt) {
  return current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt));
}

/**
 * Minimal geometry merger (BufferGeometryUtils is an addon we do not ship).
 * Handles non-indexed geometries with position/normal/uv/color, which is all
 * the town builder produces.
 */
export function mergeGeometries(geometries) {
  const attrs = ['position', 'normal', 'uv', 'color'];
  let total = 0;
  for (const g of geometries) total += g.getAttribute('position').count;

  const out = new THREE.BufferGeometry();
  for (const name of attrs) {
    if (!geometries[0].getAttribute(name)) continue;
    const itemSize = geometries[0].getAttribute(name).itemSize;
    const array = new Float32Array(total * itemSize);
    let offset = 0;
    for (const g of geometries) {
      const a = g.getAttribute(name);
      array.set(a.array, offset);
      offset += a.array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  }
  return out;
}

/** Bake a transform + flat vertex colour into a geometry, ready for merging. */
export function prepare(geometry, matrix, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (matrix) g.applyMatrix4(matrix);
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  }
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('tangent');
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function trs(px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _v.set(px, py, pz);
  _s.set(sx, sy, sz);
  return _m.clone().compose(_v, _q, _s);
}
