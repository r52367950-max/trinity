import * as THREE from 'three';

/**
 * Procedural, seamlessly tiling textures generated at load time.
 * The game ships no binary assets — every surface detail in the scene comes
 * out of the value-noise lattice below.
 */

function hash2(ix, iy, period, seed) {
  // wrap the lattice so the result tiles exactly at `period`
  ix = ((ix % period) + period) % period;
  iy = ((iy % period) + period) % period;
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const quintic = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function valueNoise(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = quintic(x - ix), fy = quintic(y - iy);
  const a = hash2(ix, iy, period, seed);
  const b = hash2(ix + 1, iy, period, seed);
  const c = hash2(ix, iy + 1, period, seed);
  const d = hash2(ix + 1, iy + 1, period, seed);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

/** Tiling fractal brownian motion over the unit square. */
export function fbm(u, v, baseFreq, octaves, seed, gain = 0.5, lacunarity = 2) {
  let sum = 0, amp = 1, norm = 0, freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    const p = Math.max(1, Math.round(freq));
    sum += amp * valueNoise(u * p, v * p, p, seed + o * 7919);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged variant — the crisp filaments read as foam and cloud edges. */
export function ridged(u, v, baseFreq, octaves, seed) {
  let sum = 0, amp = 1, norm = 0, freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    const p = Math.max(1, Math.round(freq));
    const n = 1 - Math.abs(valueNoise(u * p, v * p, p, seed + o * 6151) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function makeTexture(data, size, { srgb = false, format = THREE.RGBAFormat } = {}) {
  const tex = new THREE.DataTexture(data, size, size, format, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tangent-space normal map for close-range water detail. Two blended
 * frequency bands: long swell ripple plus fine capillary chop.
 */
export function makeWaterNormalTexture(size = 512, seed = 11) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const swell = fbm(u, v, 4, 4, seed, 0.55);
      const chop = fbm(u * 1.0, v * 1.0, 16, 4, seed + 313, 0.5);
      const capillary = ridged(u, v, 32, 3, seed + 77);
      h[y * size + x] = swell * 0.62 + chop * 0.3 + capillary * 0.14;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const strength = size * 0.018;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x];
      const t = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength;
      let nz = (d - t) * strength;
      const ny = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; nz *= inv;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = h[y * size + x] * 255;
    }
  }
  return makeTexture(data, size);
}

/**
 * R: soft blobby foam mask. G: crisp bubble speckle. B: slow drift mask.
 * A: fine sparkle used for sea-surface glitter.
 */
export function makeFoamTexture(size = 512, seed = 91) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const blobs = fbm(u, v, 6, 4, seed, 0.55);
      const bubbles = ridged(u, v, 24, 3, seed + 41);
      const drift = fbm(u, v, 3, 3, seed + 907, 0.6);
      const sparkle = fbm(u, v, 48, 2, seed + 1231, 0.5);
      const i = (y * size + x) * 4;
      data[i] = Math.min(255, Math.max(0, (blobs - 0.28) * 2.2) * 255);
      data[i + 1] = Math.pow(bubbles, 1.6) * 255;
      data[i + 2] = drift * 255;
      data[i + 3] = Math.pow(sparkle, 2.0) * 255;
    }
  }
  return makeTexture(data, size);
}

/** General purpose 4-channel noise: clouds, terrain detail, dirt masks. */
export function makeNoiseTexture(size = 256, seed = 5) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const i = (y * size + x) * 4;
      data[i] = fbm(u, v, 4, 5, seed) * 255;
      data[i + 1] = fbm(u, v, 8, 4, seed + 100) * 255;
      data[i + 2] = ridged(u, v, 6, 4, seed + 200) * 255;
      data[i + 3] = fbm(u, v, 16, 3, seed + 300) * 255;
    }
  }
  return makeTexture(data, size);
}

/** Sand: fine grain normal + a wind-ripple band, tinted per-pixel. */
export function makeSandTexture(size = 512, seed = 61) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const grain = fbm(u, v, 64, 3, seed, 0.5);
      const ripple = 0.5 + 0.5 * Math.sin((v * 34 + fbm(u, v, 6, 3, seed + 3) * 9) * Math.PI * 2);
      const patch = fbm(u, v, 5, 4, seed + 55);
      const i = (y * size + x) * 4;
      data[i] = grain * 255;
      data[i + 1] = ripple * 255;
      data[i + 2] = patch * 255;
      data[i + 3] = fbm(u, v, 20, 3, seed + 88) * 255;
    }
  }
  return makeTexture(data, size);
}
