import * as THREE from 'three';
import { shared } from './shared.js';
import { SKY_SAMPLE_GLSL } from './atmosphere.js';
import { fbm, ridged } from './noise.js';

/**
 * The island: a headland-flanked bay with a shallow sand beach, a hill behind
 * it for the town, and a sea floor that shelves away gently enough for the
 * swell to feel the bottom and break.
 *
 * Height is analytic, so the mesh can be sampled at any density and the boat
 * can query it exactly. A cached 768x768 copy is uploaded as a float texture
 * for the ocean shader, which needs water depth per vertex.
 */

export const ISLAND = {
  center: new THREE.Vector2(0, -880),
  radius: 900,
  tileCenter: new THREE.Vector2(0, -760),
  tileSize: 2800,
};

/** Cheap deterministic 2D noise in world units, mirrors noise.js at 1:1 scale. */
function n2(x, z, scale, octaves, seed) {
  // fbm() works on the unit square; fold world coordinates into it
  const u = (x * scale) % 1;
  const v = (z * scale) % 1;
  return fbm(u < 0 ? u + 1 : u, v < 0 ? v + 1 : v, 4, octaves, seed);
}

const smooth = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Signed height above sea level at a world position.
 * Positive is land, negative is sea floor.
 */
export function terrainHeight(x, z) {
  const px = x - ISLAND.center.x;
  const pz = z - ISLAND.center.y;
  const r = Math.hypot(px, pz) + 1e-4;
  const theta = Math.atan2(px, pz);

  // wobbling coastline
  let R = ISLAND.radius * (
    1.0 +
    0.155 * Math.sin(theta * 3.0 + 0.7) +
    0.095 * Math.sin(theta * 5.7 - 1.9) +
    0.055 * Math.sin(theta * 11.0 + 0.3)
  );
  // the bay: the coast is pulled inland on the seaward (+Z) side
  R *= 1.0 - 0.34 * Math.exp(-Math.pow(theta / 0.50, 2));
  // two rocky headlands framing it
  R *= 1.0 + 0.22 * Math.exp(-Math.pow((theta - 0.55) / 0.22, 2));
  R *= 1.0 + 0.21 * Math.exp(-Math.pow((theta + 0.55) / 0.22, 2));

  const q = r - R; // signed distance to the waterline, metres

  if (q >= 0) {
    // sea floor: a long sandy shelf, shallow enough for the swell to feel the
    // bottom and break well before it reaches the sand
    const shelf = 5.0 * (1 - Math.exp(-q / 130)) + 0.040 * q;
    const bumps = (n2(x, z, 0.0016, 3, 21) - 0.5) * 2.2 * smooth(20, 160, q);
    return -(shelf + Math.max(0, 0.00020 * q * q)) + bumps;
  }

  const u = -q; // metres inland
  // the beach itself: a wide, soft berm rising out of the water
  let h = 2.8 * (1 - Math.exp(-u / 68));
  // the hill behind it
  const hill = 66 * smooth(40, 540, u);
  // relief at three scales: broad ridges, spurs, then surface roughness
  const rough = (n2(x, z, 0.00085, 4, 7) - 0.45) * 46 * smooth(45, 280, u);
  const ridge = ridged(((x * 0.0006) % 1 + 1) % 1, ((z * 0.0006) % 1 + 1) % 1, 4, 3, 91) * 34 * smooth(120, 620, u);
  const spur = (n2(x, z, 0.0042, 4, 13) - 0.5) * 13 * smooth(30, 200, u);
  const grain = (n2(x, z, 0.0125, 3, 29) - 0.5) * 3.6 * smooth(14, 130, u);
  h += hill + rough + ridge + spur + grain;

  // headland cliffs stay bare and steep
  const cliff = Math.exp(-Math.pow((Math.abs(theta) - 0.55) / 0.18, 2)) * smooth(0, 110, u) * 24;
  h += cliff;

  // flatten a terrace for the town so the houses are not stacked on a ski slope
  const townR = Math.hypot(x - TOWN_CENTER.x, z - TOWN_CENTER.y);
  const terrace = smooth(340, 80, townR);
  h = h * (1 - terrace * 0.5) + terrace * 0.5 * (16 + 0.06 * (u - 120));

  return h;
}

export const TOWN_CENTER = new THREE.Vector2(-20, -470);

export function waterDepthAt(x, z) {
  return Math.max(0, -terrainHeight(x, z));
}

/**
 * Walk out along a bearing from the island centre until the ground drops
 * through a given height. Used to hang the harbour, the jetty and the
 * lighthouse off the coastline instead of guessing at coordinates.
 */
export function findShore(theta, level = 0, from = 120, to = 1900) {
  let lo = from, hi = to;
  const at = (r) => terrainHeight(
    ISLAND.center.x + Math.sin(theta) * r,
    ISLAND.center.y + Math.cos(theta) * r
  ) - level;
  if (at(lo) < 0) return new THREE.Vector2(ISLAND.center.x, ISLAND.center.y);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > 0) lo = mid; else hi = mid;
  }
  const r = (lo + hi) / 2;
  return new THREE.Vector2(ISLAND.center.x + Math.sin(theta) * r, ISLAND.center.y + Math.cos(theta) * r);
}

export class Terrain {
  constructor({ sandTex, noiseTex }) {
    this.center = ISLAND.tileCenter;
    this.size = ISLAND.tileSize;

    // ---- height cache for the ocean shader --------------------------------
    // half floats keep sub-centimetre precision around the waterline, which is
    // the only place the ocean actually cares, and stay filterable everywhere
    const N = 512;
    const data = new Uint16Array(N * N);
    const half = this.size / 2;
    for (let j = 0; j < N; j++) {
      const z = this.center.y - half + (j / (N - 1)) * this.size;
      for (let i = 0; i < N; i++) {
        const x = this.center.x - half + (i / (N - 1)) * this.size;
        data[j * N + i] = THREE.DataUtils.toHalfFloat(terrainHeight(x, z));
      }
    }
    this.heightTexture = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTexture.minFilter = THREE.LinearFilter;
    this.heightTexture.magFilter = THREE.LinearFilter;
    this.heightTexture.wrapS = this.heightTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.heightTexture.needsUpdate = true;

    // ---- mesh --------------------------------------------------------------
    // radial grid centred on the bay: metre-scale detail where the surf breaks,
    // coarsening out to the far side of the island
    const RINGS = 200, SEGS = 256, RMAX = 2100, RNEAR = 260;
    const focus = new THREE.Vector2(0, -430);
    const verts = new Float32Array((RINGS + 1) * SEGS * 3);
    let p = 0;
    for (let i = 0; i <= RINGS; i++) {
      const t = i / RINGS;
      const rr = RNEAR * t + (RMAX - RNEAR) * Math.pow(t, 4);
      for (let j = 0; j < SEGS; j++) {
        const a = (j / SEGS) * Math.PI * 2;
        const x = focus.x + Math.cos(a) * rr;
        const z = focus.y + Math.sin(a) * rr;
        verts[p++] = x;
        verts[p++] = terrainHeight(x, z);
        verts[p++] = z;
      }
    }
    const idx = new Uint32Array(RINGS * SEGS * 6);
    let k = 0;
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEGS; j++) {
        const j1 = (j + 1) % SEGS;
        const a = i * SEGS + j, b = i * SEGS + j1;
        const c = (i + 1) * SEGS + j, d = (i + 1) * SEGS + j1;
        idx[k++] = a; idx[k++] = b; idx[k++] = c;
        idx[k++] = b; idx[k++] = d; idx[k++] = c;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(focus.x, 0, focus.y), RMAX * 1.2);

    this.material = this.buildMaterial(sandTex, noiseTex);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
  }

  buildMaterial(sandTex, noiseTex) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0 });

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uSkyLUT: shared.uSkyLUT,
        uSunDir: shared.uSunDir,
        uSunColor: shared.uSunColor,
        uCameraPos: shared.uCameraPos,
        uFogDensity: shared.uFogDensity,
        uFogHeight: shared.uFogHeight,
        uInvView: shared.uInvView,
        uTime: shared.uTime,
        uSandTex: { value: sandTex },
        uNoiseTex: { value: noiseTex },
      });

      shader.vertexShader =
        'varying vec3 vAtmoWorld;\nvarying vec3 vTerrN;\nuniform mat4 uInvView;\n' +
        shader.vertexShader
          .replace('#include <project_vertex>',
            '#include <project_vertex>\n  vAtmoWorld = (uInvView * mvPosition).xyz;')
          .replace('#include <beginnormal_vertex>',
            '#include <beginnormal_vertex>\n  vTerrN = normalize(mat3(modelMatrix) * objectNormal);');

      shader.fragmentShader =
        `varying vec3 vAtmoWorld;
         varying vec3 vTerrN;
         uniform sampler2D uSandTex;
         uniform sampler2D uNoiseTex;
         uniform float uTime;
        ` + SKY_SAMPLE_GLSL + '\n' + shader.fragmentShader
          .replace('#include <map_fragment>', /* glsl */`
            vec3 wp = vAtmoWorld;
            float slope = 1.0 - clamp(vTerrN.y, 0.0, 1.0);

            vec4 sandT = texture2D(uSandTex, wp.xz * 0.11);
            vec4 sandF = texture2D(uSandTex, wp.xz * 0.9);
            vec4 nz    = texture2D(uNoiseTex, wp.xz * 0.0045);
            vec4 nz2   = texture2D(uNoiseTex, wp.xz * 0.031);

            // real vegetation and rock are much darker than they look; keeping
            // the albedo honest is what stops the island reading as putty
            vec3 drySand = vec3(0.70, 0.615, 0.475) * (0.86 + 0.30 * sandT.b) * (0.92 + 0.16 * sandF.r);
            vec3 wetSand = drySand * 0.42;
            vec3 rock    = mix(vec3(0.255, 0.238, 0.212), vec3(0.44, 0.40, 0.35), nz2.r) * (0.72 + 0.56 * nz.z);
            vec3 scrub   = mix(vec3(0.105, 0.135, 0.062), vec3(0.30, 0.295, 0.135), pow(nz.g, 1.4)) * (0.72 + 0.62 * nz2.b);
            // olive terraces and burnt grass in patches
            scrub = mix(scrub, vec3(0.235, 0.215, 0.115), smoothstep(0.45, 0.75, nz.r));

            // sand up to the berm, scrub above it, rock wherever it is steep
            float sandBand = 1.0 - smoothstep(1.6, 5.5 + nz.r * 4.0, wp.y);
            float wet = 1.0 - smoothstep(-0.55, 0.42, wp.y);

            vec3 albedo = mix(scrub, drySand, sandBand);
            albedo = mix(albedo, wetSand, wet * sandBand);
            albedo = mix(albedo, rock, smoothstep(0.26, 0.55, slope + nz2.g * 0.18));

            // caustics: the sun refracted through the surface onto the sea floor
            if (wp.y < 0.0) {
              float depth = -wp.y;
              vec2 cuv = wp.xz * 0.075;
              float c1 = texture2D(uNoiseTex, cuv + vec2(uTime * 0.021, uTime * 0.013)).r;
              float c2 = texture2D(uNoiseTex, cuv * 1.37 - vec2(uTime * 0.017, uTime * 0.026)).b;
              float caustic = pow(max(0.0, 1.0 - abs(c1 + c2 - 1.0) * 3.4), 3.0);
              albedo += uSunColor * caustic * 1.25 * exp(-depth * 0.14) * max(uSunDir.y, 0.0);
              albedo *= 1.0 - 0.35 * smoothstep(0.0, 26.0, depth);
            }

            diffuseColor.rgb *= albedo;
          `)
          .replace('#include <roughnessmap_fragment>', /* glsl */`
            float roughnessFactor = roughness;
            {
              float wetR = 1.0 - smoothstep(-0.55, 0.42, vAtmoWorld.y);
              roughnessFactor = mix(0.95, 0.30, wetR);
            }
          `)
          .replace('#include <tonemapping_fragment>',
            '  gl_FragColor.rgb = applyAerial(gl_FragColor.rgb, vAtmoWorld);\n#include <tonemapping_fragment>');
    };
    mat.customProgramCacheKey = () => 'terrain1';
    return mat;
  }
}
