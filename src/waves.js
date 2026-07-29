import * as THREE from 'three';

/**
 * A single source of truth for the sea surface.
 *
 * The same sum-of-Gerstner-waves is evaluated on the GPU (vertex displacement
 * for the ocean mesh) and on the CPU (buoyancy for the boat and the buoys), so
 * the hull always sits exactly in the water it looks like it is sitting in.
 *
 * Waves use deep-water dispersion, omega = sqrt(g * k), which is what makes a
 * real sea look layered: long swell rolls through slowly while short chop
 * scuttles across it. Two families are mixed — a swell train from a fixed
 * distant direction, and a wind sea that follows the current wind.
 */

export const NUM_WAVES = 9;
const G = 9.81;

export const waveUniforms = {
  uWaves: { value: Array.from({ length: NUM_WAVES }, () => new THREE.Vector4(1, 0, 0.2, 0.1)) },
  uSteepness: { value: 0.72 },
  uWaveTime: { value: 0 },
};

/** Depth of water at a world position, injected by the terrain module. */
let depthProvider = () => 400;
export function setDepthProvider(fn) { depthProvider = fn; }
export function waterDepthAt(x, z) { return depthProvider(x, z); }

const swellDir = new THREE.Vector2(0.22, 1.0).normalize(); // rolls into the bay

/**
 * Rebuild the spectrum. Wavelengths straddle the Pierson–Moskowitz peak for
 * the given wind speed; amplitudes follow a mild power law about that peak.
 */
export function configureWaves(windDirRad, windSpeed) {
  const Lp = Math.max(14, 0.88 * windSpeed * windSpeed); // peak wavelength (m)
  const Hs = 0.21 * (windSpeed * windSpeed) / G;         // significant height (m)
  const windDir = new THREE.Vector2(Math.sin(windDirRad), Math.cos(windDirRad));

  // wavelength multipliers, long -> short
  const mults = [2.35, 1.55, 1.0, 0.74, 0.5, 0.33, 0.21, 0.13, 0.075];
  const spread = [0.0, 0.28, -0.22, 0.44, -0.5, 0.72, -0.86, 1.05, -1.25];

  const raw = [];
  let ampSum = 0;
  for (let i = 0; i < NUM_WAVES; i++) {
    const L = Lp * mults[i];
    const a = Math.pow(mults[i], 0.86);
    ampSum += a;
    raw.push({ L, a });
  }

  const target = Hs * 0.62;
  for (let i = 0; i < NUM_WAVES; i++) {
    const { L, a } = raw[i];
    const amp = (a / ampSum) * target;
    const w = (2 * Math.PI) / L;

    // the three longest components are ocean swell: they keep their own
    // heading no matter which way the local wind is blowing
    const isSwell = i < 3;
    const base = isSwell ? Math.atan2(swellDir.x, swellDir.y) : windDirRad;
    const ang = base + spread[i] * (isSwell ? 0.18 : 0.62);

    const v = waveUniforms.uWaves.value[i];
    v.set(Math.sin(ang), Math.cos(ang), amp, w);
  }
}

/**
 * Shore effect: a wave "feels the bottom" at roughly half its wavelength. It
 * grows and steepens as it shoals, then collapses in the last few metres.
 * Returns [amplitude gain, breaking amount].
 */
export function shoalFactors(depth) {
  const r = Math.min(Math.max(depth / 26.0, 0.0), 1.0);
  const dead = smooth(0.012, 0.16, r);
  const bump = 1.0 + 0.95 * Math.exp(-Math.pow((r - 0.26) / 0.17, 2));
  const breaking = Math.max(0, 1.0 - Math.abs(r - 0.16) / 0.16) * (r > 0.02 ? 1 : 0);
  return [dead * bump, breaking];
}
function smooth(e0, e1, x) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * CPU evaluation of the displaced surface. Because Gerstner waves move points
 * horizontally, finding the surface above a fixed (x, z) needs a couple of
 * fixed-point iterations to undo that displacement.
 */
const _n = new THREE.Vector3();
export function sampleOcean(x, z, t, out = { y: 0, normal: new THREE.Vector3(), fold: 1 }) {
  const [gain] = shoalFactors(depthProvider(x, z));
  let px = x, pz = z;
  for (let iter = 0; iter < 3; iter++) {
    let dx = 0, dz = 0;
    for (let i = 0; i < NUM_WAVES; i++) {
      const v = waveUniforms.uWaves.value[i];
      const A = v.z * gain;
      if (A <= 1e-6) continue;
      const w = v.w;
      const phi = Math.sqrt(G * w);
      const Q = waveUniforms.uSteepness.value / (w * A * NUM_WAVES + 1e-5);
      const ph = w * (v.x * px + v.y * pz) + phi * t;
      const C = Math.cos(ph);
      dx += Q * A * v.x * C;
      dz += Q * A * v.y * C;
    }
    px = x - dx;
    pz = z - dz;
  }

  let y = 0, nx = 0, ny = 1, nz = 0;
  let jxx = 0, jzz = 0, jxz = 0;
  for (let i = 0; i < NUM_WAVES; i++) {
    const v = waveUniforms.uWaves.value[i];
    const A = v.z * gain;
    if (A <= 1e-6) continue;
    const w = v.w;
    const phi = Math.sqrt(G * w);
    const Q = waveUniforms.uSteepness.value / (w * A * NUM_WAVES + 1e-5);
    const ph = w * (v.x * px + v.y * pz) + phi * t;
    const S = Math.sin(ph), C = Math.cos(ph);
    const WA = w * A;
    y += A * S;
    nx -= v.x * WA * C;
    nz -= v.y * WA * C;
    ny -= Q * WA * S;
    jxx += Q * v.x * v.x * WA * S;
    jzz += Q * v.y * v.y * WA * S;
    jxz += Q * v.x * v.y * WA * S;
  }
  out.y = y;
  _n.set(nx, ny, nz).normalize();
  out.normal.copy(_n);
  out.fold = (1 - jxx) * (1 - jzz) - jxz * jxz;
  return out;
}

/** GLSL twin of sampleOcean(), included by the ocean and wake shaders. */
export const WAVE_GLSL = /* glsl */`
#define NUM_WAVES ${NUM_WAVES}
uniform vec4 uWaves[NUM_WAVES];   // dir.xy, amplitude, angular wavenumber
uniform float uSteepness;
uniform float uWaveTime;

// depth -> [amplitude gain, breaking amount]
vec2 shoalFactors(float depth) {
  float r = clamp(depth / 26.0, 0.0, 1.0);
  float dead = smoothstep(0.012, 0.16, r);
  float bump = 1.0 + 0.95 * exp(-pow((r - 0.26) / 0.17, 2.0));
  float breaking = max(0.0, 1.0 - abs(r - 0.16) / 0.16) * step(0.02, r);
  return vec2(dead * bump, breaking);
}

void oceanSurface(vec2 p, float gain, float lodFade, out vec3 disp, out vec3 nrm, out float fold) {
  disp = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float jxx = 0.0, jzz = 0.0, jxz = 0.0;

  for (int i = 0; i < NUM_WAVES; i++) {
    vec4 wv = uWaves[i];
    // short components are dropped first as the surface recedes: they turn
    // into sub-pixel noise long before the long swell does
    float lod = clamp(1.0 - lodFade * (wv.w * 9.0), 0.0, 1.0);
    float A = wv.z * gain * lod;
    if (A <= 1e-6) continue;
    float w = wv.w;
    float phi = sqrt(9.81 * w);
    float Q = uSteepness / (w * A * float(NUM_WAVES) + 1e-5);
    float ph = w * dot(wv.xy, p) + phi * uWaveTime;
    float S = sin(ph), C = cos(ph);
    float WA = w * A;

    disp.xz += Q * A * wv.xy * C;
    disp.y  += A * S;
    n.x -= wv.x * WA * C;
    n.z -= wv.y * WA * C;
    n.y -= Q * WA * S;
    jxx += Q * wv.x * wv.x * WA * S;
    jzz += Q * wv.y * wv.y * WA * S;
    jxz += Q * wv.x * wv.y * WA * S;
  }
  nrm = normalize(n);
  fold = (1.0 - jxx) * (1.0 - jzz) - jxz * jxz;
}
`;
