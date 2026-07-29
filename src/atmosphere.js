import * as THREE from 'three';
import { shared } from './shared.js';

/**
 * Physically based sky.
 *
 * A Rayleigh + Mie single-scattering integral is evaluated once into a small
 * 2D lookup table parameterised by (angle to sun, view elevation). For a fixed
 * sun direction that pair is a bijection with the view direction — the sky is
 * symmetric about the sun's meridian — so the table is exact rather than an
 * approximation, and every shader in the game can afford to ask "what colour
 * is the sky in this direction?" with a single texture fetch.
 *
 * That one function then drives: the sky dome, the light that reflects off the
 * ocean, the aerial perspective on the island, and the image based lighting.
 */

const LUT_W = 256;
const LUT_H = 128;

/** The scattering integral itself — only ever compiled into the LUT pass. */
const ATMOSPHERE_GLSL = /* glsl */`
#define PI 3.14159265359
const float R_PLANET = 6371000.0;
const float R_ATMOS  = 6471000.0;
const vec3  K_RAYLEIGH = vec3(5.5e-6, 13.0e-6, 22.4e-6);
const float K_MIE = 21e-6;
const float H_RAYLEIGH = 8000.0;
const float H_MIE = 1200.0;
const float MIE_G = 0.758;

// distance to the far intersection with a sphere of radius r centred at origin
vec2 raySphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float disc = b * b - c;
  if (disc < 0.0) return vec2(1e9, -1e9);
  disc = sqrt(disc);
  return vec2(-b - disc, -b + disc);
}

vec3 scatter(vec3 dir, vec3 sunDir, float sunIntensity) {
  vec3 origin = vec3(0.0, R_PLANET + 12.0, 0.0);
  vec2 atm = raySphere(origin, dir, R_ATMOS);
  if (atm.x > atm.y) return vec3(0.0);
  vec2 gnd = raySphere(origin, dir, R_PLANET);
  float far = atm.y;
  // rays that dive into the planet stop at the surface, which lets the table
  // stay sensible a little below the horizon (where the ocean lives)
  if (gnd.x > 0.0) far = min(far, gnd.x);
  float start = max(atm.x, 0.0);

  const int STEPS = 20;
  const int LIGHT_STEPS = 6;
  float stepSize = (far - start) / float(STEPS);
  float t = start + stepSize * 0.5;

  vec3 totalR = vec3(0.0);
  vec3 totalM = vec3(0.0);
  float odR = 0.0;
  float odM = 0.0;

  for (int i = 0; i < STEPS; i++) {
    vec3 p = origin + dir * t;
    float h = length(p) - R_PLANET;
    float hr = exp(-h / H_RAYLEIGH) * stepSize;
    float hm = exp(-h / H_MIE) * stepSize;
    odR += hr;
    odM += hm;

    // optical depth from this sample toward the sun
    vec2 lAtm = raySphere(p, sunDir, R_ATMOS);
    float lStep = lAtm.y / float(LIGHT_STEPS);
    float lt = lStep * 0.5;
    float lodR = 0.0;
    float lodM = 0.0;
    bool shadowed = false;
    for (int j = 0; j < LIGHT_STEPS; j++) {
      vec3 lp = p + sunDir * lt;
      float lh = length(lp) - R_PLANET;
      if (lh < 0.0) { shadowed = true; break; }
      lodR += exp(-lh / H_RAYLEIGH) * lStep;
      lodM += exp(-lh / H_MIE) * lStep;
      lt += lStep;
    }
    if (!shadowed) {
      vec3 tau = K_RAYLEIGH * (odR + lodR) + K_MIE * 1.1 * (odM + lodM);
      vec3 att = exp(-tau);
      totalR += hr * att;
      totalM += hm * att;
    }
    t += stepSize;
  }

  float mu = dot(dir, sunDir);
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g2 = MIE_G * MIE_G;
  float phaseM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) /
                 ((2.0 + g2) * pow(1.0 + g2 - 2.0 * MIE_G * mu, 1.5));

  return sunIntensity * (phaseR * K_RAYLEIGH * totalR + phaseM * K_MIE * totalM);
}
`;

/**
 * Sky lookup + sun + aerial perspective. Included by the dome, the ocean, the
 * terrain, the town and the boat so that everything shares one atmosphere.
 */
export const SKY_SAMPLE_GLSL = /* glsl */`
uniform sampler2D uSkyLUT;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCameraPos;
uniform float uFogDensity;
uniform float uFogHeight;

vec3 skyRadiance(vec3 dir) {
  float c = clamp(dot(dir, uSunDir), -1.0, 1.0);
  float u = pow(0.5 + 0.5 * c, 3.0);
  float v = sqrt(clamp((dir.y + 0.2) / 1.2, 0.0, 1.0));
  u = mix(${(0.5 / LUT_W).toFixed(6)}, ${(1.0 - 0.5 / LUT_W).toFixed(6)}, u);
  v = mix(${(0.5 / LUT_H).toFixed(6)}, ${(1.0 - 0.5 / LUT_H).toFixed(6)}, v);
  return texture2D(uSkyLUT, vec2(u, v)).rgb;
}

// Height-fogged aerial perspective. Density falls off exponentially with
// altitude, integrated analytically along the view ray, and the fog takes the
// colour of the sky in that exact direction — so distant hills dissolve into
// the haze instead of fading to a flat grey.
vec3 applyAerial(vec3 color, vec3 worldPos) {
  vec3 v = worldPos - uCameraPos;
  float dist = length(v);
  if (dist < 1e-4) return color;
  vec3 dir = v / dist;

  float y0 = max(uCameraPos.y, 0.0);
  float dy = dir.y;
  float integral;
  if (abs(dy) < 1e-4) {
    integral = dist * exp(-y0 / uFogHeight);
  } else {
    integral = (uFogHeight / dy) * exp(-y0 / uFogHeight) * (1.0 - exp(-dy * dist / uFogHeight));
  }
  float amount = 1.0 - exp(-max(integral, 0.0) * uFogDensity);
  vec3 fogColor = skyRadiance(dir);
  // a touch of forward scattering: haze brightens when you look toward the sun
  float mu = max(dot(dir, uSunDir), 0.0);
  fogColor += uSunColor * pow(mu, 8.0) * 0.35 * amount;
  return mix(color, fogColor, clamp(amount, 0.0, 1.0));
}
`;

/**
 * Cloud layer: a flat slab of animated fbm raymarched with two taps toward the
 * sun for self-shadowing. Cheap, but it gives the silver-lined cumulus that
 * make the reflections on the water read as a real sky.
 */
export const CLOUD_GLSL = /* glsl */`
uniform sampler2D uNoiseTex;
uniform float uCloudTime;
uniform float uCloudCover;

float cloudFbm(vec2 p) {
  float f = 0.0;
  f += 0.5000 * texture2D(uNoiseTex, p * 0.50).r;
  f += 0.2500 * texture2D(uNoiseTex, p * 1.13 + vec2(0.31, 0.17)).g;
  f += 0.1250 * texture2D(uNoiseTex, p * 2.31 + vec2(0.73, 0.41)).a;
  f += 0.0625 * texture2D(uNoiseTex, p * 4.71 + vec2(0.11, 0.83)).b;
  return f / 0.9375;
}

float cloudDensity(vec2 p) {
  vec2 drift = vec2(uCloudTime * 0.004, uCloudTime * 0.0016);
  float base = cloudFbm(p * 0.9 + drift);
  float detail = cloudFbm(p * 3.1 - drift * 2.3);
  float d = base + detail * 0.28 - (1.0 - uCloudCover) * 0.92;
  return clamp(d * 2.6, 0.0, 1.0);
}

// returns rgb premultiplied cloud colour and coverage in .a
vec4 clouds(vec3 dir, vec3 sunDir, vec3 sunColor, vec3 skyCol) {
  if (dir.y < 0.005) return vec4(0.0);
  float layerH = 1500.0;
  float t = layerH / dir.y;
  if (t > 90000.0) return vec4(0.0);
  vec2 p = dir.xz * t * 0.000105;

  float d = cloudDensity(p);
  if (d <= 0.001) return vec4(0.0);

  // two shadow taps up-sun through the slab
  vec2 sunStep = sunDir.xz * 0.055 - vec2(0.0);
  float s1 = cloudDensity(p + sunStep);
  float s2 = cloudDensity(p + sunStep * 2.4);
  float shade = clamp(1.0 - (s1 * 0.55 + s2 * 0.35), 0.0, 1.0);

  vec3 lit = sunColor * (0.42 + 0.95 * pow(shade, 1.6));
  vec3 shadowCol = skyCol * 1.25 + vec3(0.035, 0.045, 0.06);
  vec3 col = mix(shadowCol, lit, pow(shade, 1.15));
  // silver lining when looking through a thin edge toward the sun
  float rim = pow(max(dot(dir, sunDir), 0.0), 18.0) * (1.0 - d) * shade;
  col += sunColor * rim * 1.6;

  // fade out into the horizon haze
  float horizon = smoothstep(0.005, 0.13, dir.y);
  float alpha = clamp(d * 1.25, 0.0, 1.0) * horizon;
  col = mix(skyCol * 1.1, col, horizon);
  return vec4(col, alpha);
}
`;

export const SUN_GLSL = /* glsl */`
// analytic sun disc and glow, added on top of the table which is far too
// coarse to resolve a half-degree object
vec3 sunDisc(vec3 dir, vec3 sunDir, vec3 sunColor) {
  float c = dot(dir, sunDir);
  float disc = smoothstep(0.99987, 0.99993, c);
  float glow = pow(max(c, 0.0), 2200.0) * 0.9 + pow(max(c, 0.0), 160.0) * 0.05;
  float horizonFade = smoothstep(-0.035, 0.06, sunDir.y);
  return sunColor * (disc * 26.0 + glow * 5.0) * horizonFade;
}
`;

const FULLSCREEN_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export class Sky {
  constructor(renderer, noiseTex) {
    this.renderer = renderer;

    const rtType = renderer.capabilities.isWebGL2 === false ? THREE.UnsignedByteType : THREE.HalfFloatType;
    this.lut = new THREE.WebGLRenderTarget(LUT_W, LUT_H, {
      type: rtType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
    });
    shared.uSkyLUT.value = this.lut.texture;

    // --- LUT generation pass -------------------------------------------------
    this.lutMaterial = new THREE.ShaderMaterial({
      uniforms: { uSunDir: shared.uSunDir, uSkyScale: shared.uSkyScale },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform vec3 uSunDir;
        uniform float uSkyScale;
        ${ATMOSPHERE_GLSL}
        void main() {
          // invert the (angle to sun, elevation) parameterisation
          float c = 2.0 * pow(clamp(vUv.x, 0.0, 1.0), 1.0 / 3.0) - 1.0;
          float e = clamp(vUv.y * vUv.y * 1.2 - 0.2, -0.2, 1.0);

          float hd = sqrt(max(1.0 - e * e, 0.0));
          float sy = clamp(uSunDir.y, -1.0, 1.0);
          float hs = sqrt(max(1.0 - sy * sy, 0.0));
          vec2 su = hs > 1e-4 ? normalize(uSunDir.xz) : vec2(0.0, 1.0);
          float cosAz = hd * hs > 1e-5 ? clamp((c - e * sy) / (hd * hs), -1.0, 1.0) : 1.0;
          float sinAz = sqrt(max(1.0 - cosAz * cosAz, 0.0));
          vec2 perp = vec2(-su.y, su.x);
          vec2 horiz = hd * (su * cosAz + perp * sinAz);
          vec3 dir = normalize(vec3(horiz.x, e, horiz.y));

          vec3 col = scatter(dir, uSunDir, 22.0) * uSkyScale;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.lutQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lutMaterial);
    this.lutQuad.frustumCulled = false;
    this.lutScene = new THREE.Scene().add(this.lutQuad);
    this.lutCamera = new THREE.Camera();

    // --- sky dome ------------------------------------------------------------
    this.domeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSkyLUT: shared.uSkyLUT,
        uSunDir: shared.uSunDir,
        uSunColor: shared.uSunColor,
        uCameraPos: shared.uCameraPos,
        uFogDensity: shared.uFogDensity,
        uFogHeight: shared.uFogHeight,
        uNoiseTex: { value: noiseTex },
        uCloudTime: shared.uCloudTime,
        uCloudCover: shared.uCloudCover,
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = (modelMatrix * vec4(position, 0.0)).xyz;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w; // pin to the far plane
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vDir;
        ${SKY_SAMPLE_GLSL}
        ${SUN_GLSL}
        ${CLOUD_GLSL}
        void main() {
          vec3 dir = normalize(vDir);
          vec3 col = skyRadiance(dir);
          vec4 cl = clouds(dir, uSunDir, uSunColor, col);
          vec3 sun = sunDisc(dir, uSunDir, uSunColor) * (1.0 - cl.a * 0.94);
          col = mix(col, cl.rgb, cl.a) + sun;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.domeMaterial);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;

    // --- environment cube for image based lighting ---------------------------
    this.cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: rtType, format: THREE.RGBAFormat });
    this.cubeCamera = new THREE.CubeCamera(0.05, 8, this.cubeRT);
    this.cubeScene = new THREE.Scene();
    this.cubeDome = new THREE.Mesh(this.dome.geometry, this.domeMaterial);
    this.cubeDome.frustumCulled = false;
    this.cubeScene.add(this.cubeDome);
    shared.uSkyCube.value = this.cubeRT.texture;

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileCubemapShader();
    this.envRT = null;

    this.sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.6;
    const sc = this.sunLight.shadow.camera;
    sc.near = 1; sc.far = 1400; sc.left = -420; sc.right = 420; sc.top = 420; sc.bottom = -420;

    this.ambient = new THREE.HemisphereLight(0x9fc4e8, 0x2a3a44, 0.55);

    this.needsUpdate = true;
    this._cubeTimer = 0;
  }

  /** azimuth: radians clockwise from north. elevation: radians above horizon. */
  setSun(azimuth, elevation) {
    const ce = Math.cos(elevation);
    shared.uSunDir.value.set(Math.sin(azimuth) * ce, Math.sin(elevation), Math.cos(azimuth) * ce).normalize();

    // warm and dim the direct light as the sun drops, the way real sunlight
    // reddens through the extra air mass near the horizon
    const e = Math.max(shared.uSunDir.value.y, -0.05);
    const t = Math.max(0, Math.min(1, e / 0.35));
    const r = 1.0;
    const g = 0.52 + 0.44 * Math.pow(t, 0.55);
    const b = 0.24 + 0.72 * Math.pow(t, 0.85);
    shared.uSunColor.value.setRGB(r, g, b);
    this.sunLight.color.copy(shared.uSunColor.value);
    this.sunLight.intensity = 3.1 * Math.max(0.0, Math.min(1, (e + 0.02) / 0.22));
    this.ambient.intensity = 0.22 + 0.30 * t;
    this.needsUpdate = true;
  }

  /** Anchor the shadow frustum over a point of interest. */
  setShadowFocus(target) {
    const d = shared.uSunDir.value;
    this.sunLight.position.set(target.x + d.x * 600, target.y + d.y * 600, target.z + d.z * 600);
    this.sunLight.target.position.copy(target);
    this.sunLight.target.updateMatrixWorld();
  }

  update(renderer, dt) {
    if (this.needsUpdate) {
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(this.lut);
      renderer.render(this.lutScene, this.lutCamera);
      renderer.setRenderTarget(prevTarget);
      this.needsUpdate = false;
      this._cubeTimer = 999;
    }

    // the cube map only feeds ambient light and rough reflections, so it can
    // lag the drifting clouds by a few frames without anyone noticing
    this._cubeTimer += dt;
    if (this._cubeTimer > 0.5) {
      this._cubeTimer = 0;
      this.cubeCamera.update(renderer, this.cubeScene);
      const next = this.pmrem.fromCubemap(this.cubeRT.texture);
      if (this.envRT) this.envRT.dispose();
      this.envRT = next;
      this.environment = next.texture;
      return true;
    }
    return false;
  }

  attach(scene) {
    scene.add(this.dome);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);
    scene.add(this.ambient);
  }
}
