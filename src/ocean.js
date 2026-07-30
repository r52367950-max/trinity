import * as THREE from 'three';
import { shared } from './shared.js';
import { WAVE_GLSL, waveUniforms } from './waves.js';
import { SKY_SAMPLE_GLSL, CLOUD_GLSL } from './atmosphere.js';

/**
 * The sea.
 *
 * Geometry is a radial grid pinned to the camera: ring spacing grows with a
 * quintic so there is roughly a metre of detail underfoot and kilometres of
 * coverage at the horizon, all from one 126k-triangle mesh that never needs
 * rebuilding.
 *
 * Shading is the full stack you would expect from a modern water shader —
 * Gerstner displacement with shoaling, three bands of scrolling detail normals,
 * Fresnel weighted planar reflection over an analytic sky, refraction with
 * Beer-Lambert absorption from a depth prepass, GGX sun glitter, wave-crest
 * subsurface scattering, and four separate sources of foam.
 */

const RINGS = 224;
const SEGMENTS = 288;
const R_MAX = 9500;
const R_NEAR = 300;

function buildRadialGrid() {
  const vertCount = (RINGS + 1) * SEGMENTS;
  const positions = new Float32Array(vertCount * 3);
  let p = 0;
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const r = R_NEAR * t + (R_MAX - R_NEAR) * Math.pow(t, 5);
    for (let j = 0; j < SEGMENTS; j++) {
      const a = (j / SEGMENTS) * Math.PI * 2;
      positions[p++] = Math.cos(a) * r;
      positions[p++] = 0;
      positions[p++] = Math.sin(a) * r;
    }
  }

  const indices = new Uint32Array(RINGS * SEGMENTS * 6);
  let k = 0;
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const j1 = (j + 1) % SEGMENTS;
      const a = i * SEGMENTS + j;
      const b = i * SEGMENTS + j1;
      const c = (i + 1) * SEGMENTS + j;
      const d = (i + 1) * SEGMENTS + j1;
      // wound so the surface normal points up: anything else and the whole
      // sea is quietly back-face culled
      indices[k++] = a; indices[k++] = b; indices[k++] = c;
      indices[k++] = b; indices[k++] = d; indices[k++] = c;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R_MAX * 1.5);
  return g;
}

export class Ocean {
  constructor(renderer, { waterNormal, foam, noise, terrain }) {
    this.renderer = renderer;

    const halfFloat = THREE.HalfFloatType;
    this.reflectionRT = new THREE.WebGLRenderTarget(1024, 1024, {
      type: halfFloat, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.refractionRT = new THREE.WebGLRenderTarget(1024, 1024, {
      type: halfFloat, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthTexture: new THREE.DepthTexture(1024, 1024, THREE.UnsignedIntType),
      stencilBuffer: false,
    });

    this.reflectionCamera = new THREE.PerspectiveCamera();
    this.reflectionCamera.layers.set(0);   // props are excluded, see layers.js
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1.2);

    this.uniforms = {
      ...waveUniforms,
      uSkyLUT: shared.uSkyLUT,
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor,
      uSunIntensity: shared.uSunIntensity,
      uCameraPos: shared.uCameraPos,
      uFogDensity: shared.uFogDensity,
      uFogHeight: shared.uFogHeight,
      uNoiseTex: { value: noise },
      uCloudTime: shared.uCloudTime,
      uCloudCover: shared.uCloudCover,
      uWindDir: shared.uWindDir,
      uWindSpeed: shared.uWindSpeed,
      uTime: shared.uTime,

      uCenter: { value: new THREE.Vector2() },
      uTerrainHeight: { value: terrain.heightTexture },
      uTerrainInfo: { value: new THREE.Vector3(terrain.center.x, terrain.center.y, terrain.size) },

      uWaterNormal: { value: waterNormal },
      uFoamTex: { value: foam },
      uReflection: { value: this.reflectionRT.texture },
      uRefraction: { value: this.refractionRT.texture },
      uDepthTex: { value: this.refractionRT.depthTexture },
      uReflMatrix: { value: new THREE.Matrix4() },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.15 },
      uFar: { value: 30000 },

      uWake: { value: null },
      uWakeCenter: { value: new THREE.Vector2() },
      uWakeRegion: { value: 320 },

      uExtinction: { value: new THREE.Vector3(0.42, 0.115, 0.058) },
      uScatterColor: { value: new THREE.Color(0.045, 0.21, 0.235) },
      uDeepColor: { value: new THREE.Color(0.010, 0.046, 0.080) },
      uFoamAmount: { value: 1.0 },
      uPlanarStrength: { value: 1.0 },
      uRefractionValid: { value: 1.0 },
      uCloudReflections: { value: 1.0 },
      uDetailStrength: { value: 1.0 },
      uDebug: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: this.vertexShader(),
      fragmentShader: this.fragmentShader(),
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.Mesh(buildRadialGrid(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.matrixAutoUpdate = false;
  }

  vertexShader() {
    return /* glsl */`
      precision highp float;
      ${WAVE_GLSL}

      uniform vec2 uCenter;
      uniform sampler2D uTerrainHeight;
      uniform vec3 uTerrainInfo;   // centre.x, centre.z, size
      uniform mat4 uReflMatrix;

      varying vec3 vWorld;
      varying vec3 vWaveNormal;
      varying float vFold;
      varying float vWaterDepth;
      varying float vBreak;
      varying float vDist;
      varying float vCrest;
      varying vec4 vReflUV;
      varying float vViewDepth;

      float seabed(vec2 p) {
        vec2 uv = (p - uTerrainInfo.xy) / uTerrainInfo.z + 0.5;
        float edge = smoothstep(0.5, 0.44, max(abs(uv.x - 0.5), abs(uv.y - 0.5)));
        float h = texture2D(uTerrainHeight, clamp(uv, 0.0, 1.0)).r;
        return mix(-300.0, h, edge);
      }

      void main() {
        vec2 worldXZ = position.xz + uCenter;
        float dist = length(position.xz);

        float ground = seabed(worldXZ);
        float depth = max(-ground, 0.0);
        vec2 sf = shoalFactors(depth);

        // shed the short components with distance, then flatten everything
        // out entirely long before the horizon so nothing aliases
        float lodFade = smoothstep(90.0, 2600.0, dist) * 0.55;
        float ampFade = 1.0 - smoothstep(1400.0, 7000.0, dist) * 0.82;

        vec3 disp, nrm;
        float fold;
        oceanSurface(worldXZ, sf.x * ampFade, lodFade, disp, nrm, fold);

        vec3 world = vec3(worldXZ.x + disp.x, disp.y, worldXZ.y + disp.z);

        vWorld = world;
        vWaveNormal = nrm;
        vFold = fold;
        vWaterDepth = depth;
        vBreak = sf.y;
        vDist = dist;
        vCrest = disp.y;

        vec4 mv = modelViewMatrix * vec4(world, 1.0);
        vViewDepth = -mv.z;
        vReflUV = uReflMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `;
  }

  fragmentShader() {
    return /* glsl */`
      precision highp float;
      #define PI 3.14159265359

      ${SKY_SAMPLE_GLSL}
      ${CLOUD_GLSL}

      uniform float uSunIntensity;
      uniform sampler2D uWaterNormal, uFoamTex, uReflection, uRefraction, uDepthTex, uWake;
      uniform vec2 uResolution, uWindDir, uWakeCenter;
      uniform float uNear, uFar, uTime, uWindSpeed, uWakeRegion;
      uniform float uFoamAmount, uCloudReflections, uDetailStrength;
      uniform float uPlanarStrength, uRefractionValid;
      uniform float uDebug;
      uniform vec3 uExtinction;
      uniform vec3 uScatterColor, uDeepColor;

      varying vec3 vWorld;
      varying vec3 vWaveNormal;
      varying float vFold;
      varying float vWaterDepth;
      varying float vBreak;
      varying float vDist;
      varying float vCrest;
      varying vec4 vReflUV;
      varying float vViewDepth;

      float linearDepth(float d) {
        float z = d * 2.0 - 1.0;
        return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
      }

      vec3 unpackNormal(vec4 t) { return t.xyz * 2.0 - 1.0; }

      // three bands of scrolling detail, each dropped as it stops being
      // resolvable, which keeps the far water smooth instead of boiling
      vec3 detailNormal(vec2 p, float dist, float strength) {
        vec2 w = normalize(uWindDir + 1e-5);
        vec2 perp = vec2(-w.y, w.x);
        float t = uTime;

        vec3 n1 = unpackNormal(texture2D(uWaterNormal, p * 0.0715 + w * t * 0.0125));
        vec3 n2 = unpackNormal(texture2D(uWaterNormal, p * 0.2350 * vec2(1.0, -1.0) - w * t * 0.0290 + 0.37));
        vec3 n3 = unpackNormal(texture2D(uWaterNormal, p * 0.7400 + perp * t * 0.0480 + 0.71));

        float f2 = 1.0 - smoothstep(130.0, 460.0, dist);
        float f3 = 1.0 - smoothstep(26.0, 120.0, dist);

        // A fourth band whose world scale grows with distance, so it stays a
        // few pixels wide all the way out. Without it the mid-distance sea
        // mips into a flat mirror and the far shore smears across it.
        float farScale = 0.075 / (1.0 + dist * 0.0075);
        vec3 n4 = unpackNormal(texture2D(uWaterNormal, p * farScale - w * t * 0.006));
        float f4 = smoothstep(80.0, 280.0, dist);

        vec3 n = n1 * (1.0 - f4 * 0.45) + n2 * (0.72 * f2) + n3 * (0.46 * f3) + n4 * (0.85 * f4);
        n.xz *= strength;
        n.y = max(n.y, 0.35);
        return normalize(n);
      }

      float ggx(float NoH, float rough) {
        float a = rough * rough;
        float a2 = a * a;
        float d = NoH * NoH * (a2 - 1.0) + 1.0;
        return a2 / (PI * d * d + 1e-7);
      }

      void main() {
        vec3 V = uCameraPos - vWorld;
        float viewDist = length(V);
        V /= viewDist;

        // ---- normal ---------------------------------------------------------
        vec3 waveN = normalize(vWaveNormal);
        float chop = mix(0.35, 1.15, clamp(uWindSpeed / 14.0, 0.0, 1.0)) * uDetailStrength;
        vec3 d = detailNormal(vWorld.xz, viewDist, chop);
        vec3 B = normalize(cross(vec3(1.0, 0.0, 0.0), waveN));
        vec3 T = cross(waveN, B);
        vec3 N = normalize(T * d.x + B * d.z + waveN * d.y);
        // ease the surface flat with distance: an unresolvable normal is a
        // mirror-flat one, not a random one
        float flat_ = smoothstep(420.0, 4200.0, viewDist);
        N = normalize(mix(N, vec3(0.0, 1.0, 0.0), flat_));

        float NoV = max(dot(N, V), 1e-3);
        vec3 L = uSunDir;
        float NoL = max(dot(N, L), 0.0);

        // ---- refraction and absorption --------------------------------------
        vec2 screenUV = gl_FragCoord.xy / uResolution;
        vec3 sunTint = uSunColor * (0.35 + 0.65 * max(uSunDir.y, 0.0));
        // upwelling light is lit by sun and sky together, which is what keeps
        // water from going black wherever the reflection happens to be dark
        vec3 waterLight = sunTint * uSunIntensity * 0.55 + skyRadiance(vec3(0.0, 1.0, 0.0)) * 0.55;

        float thickness = 220.0;
        vec3 bottom = vec3(0.0);
        vec3 underwater = uDeepColor * waterLight * 1.8;

        // The prepass is skipped entirely in deep water, where the result is
        // indistinguishable: 30 m of sea absorbs everything below it.
        if (uRefractionValid > 0.5) {
          float distortScale = 0.42 / (1.0 + viewDist * 0.06);
          vec2 refrUV = clamp(screenUV + N.xz * distortScale, vec2(0.002), vec2(0.998));

          float sceneZ = linearDepth(texture2D(uDepthTex, refrUV).x);
          thickness = sceneZ - vViewDepth;
          if (thickness < 0.0) {
            // the offset picked up something in front of the water: fall back
            refrUV = screenUV;
            sceneZ = linearDepth(texture2D(uDepthTex, refrUV).x);
            thickness = max(sceneZ - vViewDepth, 0.0);
          }
          thickness = min(thickness, 220.0);

          bottom = texture2D(uRefraction, refrUV).rgb;
          vec3 transmit = exp(-uExtinction * thickness);
          vec3 inscatter = uScatterColor * (1.0 - exp(-thickness * 0.16));
          underwater = bottom * transmit + inscatter * waterLight;
          underwater = mix(underwater, uDeepColor * waterLight * 1.8, smoothstep(12.0, 60.0, thickness));
        }

        // ---- reflection ------------------------------------------------------
        vec3 R = reflect(-V, N);
        R.y = max(R.y, 0.008);            // never sample below the horizon
        vec3 skyRefl = skyRadiance(R);
        if (uCloudReflections > 0.5) {
          vec4 cl = clouds(R, uSunDir, uSunColor, skyRefl);
          skyRefl = mix(skyRefl, cl.rgb, cl.a);
        }

        vec2 ruv = vReflUV.xy / max(vReflUV.w, 1e-4);
        // Reflections smear vertically far more than laterally, and the
        // displacement has to stay large at distance: at grazing angles a wave
        // face tilted a few degrees swings the reflected ray clean off the
        // shoreline and into open sky, which is what breaks a far reflection
        // up into glitter instead of a mirror.
        vec2 rOffset = vec2(N.x, N.z * 3.0) * (0.10 + 0.17 * smoothstep(40.0, 420.0, viewDist));
        vec2 duv = ruv + rOffset;
        vec4 planar = texture2D(uReflection, clamp(duv, vec2(0.0), vec2(1.0)));
        vec2 edge = smoothstep(vec2(0.0), vec2(0.045), duv) *
                    (1.0 - smoothstep(vec2(0.955), vec2(1.0), duv));
        // the mirror is only trustworthy nearby; past that the analytic sky
        // is both cheaper and better looking than a stretched low-res sample
        float valid = planar.a * edge.x * edge.y * step(0.0, vReflUV.w);
        valid *= (1.0 - smoothstep(260.0, 1100.0, viewDist)) * uPlanarStrength;
        vec3 reflection = mix(skyRefl, planar.rgb, valid);

        // ---- fresnel ---------------------------------------------------------
        float F = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
        F = mix(F, 0.02 + 0.98 * pow(1.0 - NoV, 4.0), flat_ * 0.5);

        // ---- sun specular ----------------------------------------------------
        vec3 H = normalize(L + V);
        float NoH = max(dot(N, H), 0.0);
        float rough = mix(0.055, 0.30, smoothstep(30.0, 1400.0, viewDist)) *
                      mix(0.85, 1.25, clamp(uWindSpeed / 14.0, 0.0, 1.0));
        float D = ggx(NoH, rough);
        float vis = 0.5 / max(mix(2.0 * NoL * NoV, NoL + NoV, rough * rough), 1e-4);
        vec3 spec = uSunColor * uSunIntensity * D * vis * NoL * (0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0));
        spec = min(spec, vec3(70.0));

        // ---- subsurface: light bleeding through the back of a wave -----------
        float upness = clamp(vCrest * 0.85 + 0.25, 0.0, 1.5);
        float backlit = pow(clamp(dot(V, -L) * 0.5 + 0.5, 0.0, 1.0), 4.0);
        float sss = upness * backlit * (1.0 - flat_) * max(uSunDir.y, 0.0);
        vec3 sssColor = vec3(0.09, 0.42, 0.36) * uSunColor * uSunIntensity * sss * 0.55;

        vec3 color = mix(underwater, reflection, F) + spec + sssColor;

        // ---- foam ------------------------------------------------------------
        vec2 fuv = vWorld.xz * 0.055;
        vec4 fTex = texture2D(uFoamTex, fuv + uWindDir * uTime * 0.004);
        vec4 fTex2 = texture2D(uFoamTex, fuv * 2.7 - uWindDir * uTime * 0.011);
        float bubbles = fTex.r * 0.65 + fTex2.g * 0.55;

        float crest = smoothstep(0.68, 0.12, vFold);
        // a shoaling wave dumps foam down its face as it topples
        float breaker = vBreak * smoothstep(-0.1, 0.45, vCrest) * 2.1;

        // surf line: foam piles up in the last couple of metres and washes in
        // and out on the swell period
        float wash = 0.55 + 0.45 * sin(uTime * 0.62 - vWaterDepth * 1.15);
        float shore = smoothstep(3.6, 0.10, vWaterDepth) * (0.55 + 0.85 * wash);
        shore *= smoothstep(0.0, 0.22, vWaterDepth);

        vec2 wuv = (vWorld.xz - uWakeCenter) / uWakeRegion + 0.5;
        float inWake = step(0.0, wuv.x) * step(wuv.x, 1.0) * step(0.0, wuv.y) * step(wuv.y, 1.0);
        float wake = texture2D(uWake, clamp(wuv, 0.0, 1.0)).r * inWake;

        float foam = clamp(crest * 0.85 + breaker + shore + wake * 1.15, 0.0, 1.0);
        foam = clamp(foam * (0.42 + 1.05 * bubbles), 0.0, 1.0) * uFoamAmount;
        foam *= 1.0 - smoothstep(900.0, 2600.0, viewDist);

        vec3 skyAmbient = skyRadiance(vec3(0.0, 1.0, 0.0));
        vec3 foamColor = (uSunColor * uSunIntensity * (0.30 + 0.55 * NoL) + skyAmbient * 0.9) *
                         (0.72 + 0.42 * fTex2.g);
        color = mix(color, foamColor, foam);
        // a glint of wet sparkle riding on the foam
        color += foamColor * fTex.a * foam * 0.25;

        color = applyAerial(color, vWorld);

        // uDebug is a development aid: 0 is the real shading path
        if (uDebug > 0.5) {
          if (uDebug < 1.5) color = vec3(thickness / 40.0);
          else if (uDebug < 2.5) color = bottom;
          else if (uDebug < 3.5) color = vec3(planar.a, valid, 0.0);
          else if (uDebug < 4.5) color = skyRefl;
          else if (uDebug < 5.5) color = vec3(F);
          else if (uDebug < 6.5) color = N * 0.5 + 0.5;
          else if (uDebug < 7.5) color = vec3(foam);
          else if (uDebug < 8.5) color = underwater;
          else color = planar.rgb;
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `;
  }

  setSize(width, height, auxScale = 0.55) {
    this.uniforms.uResolution.value.set(width, height);
    const scale = auxScale > 0 ? auxScale : 0.3;
    const rw = Math.max(160, Math.min(1600, Math.floor(width * scale)));
    const rh = Math.max(160, Math.min(1600, Math.floor(height * scale)));
    this.reflectionRT.setSize(rw, rh);
    this.refractionRT.setSize(rw, rh);
    this.refractionRT.depthTexture.image.width = rw;
    this.refractionRT.depthTexture.image.height = rh;
  }

  /** Mirror the main camera through the water plane (three's Reflector math). */
  updateReflectionCamera(camera) {
    const rc = this.reflectionCamera;
    const normal = _n1.set(0, 1, 0);
    const planePoint = _v1.set(0, 0, 0);
    const camPos = _v2.setFromMatrixPosition(camera.matrixWorld);

    _m1.extractRotation(camera.matrixWorld);
    const lookAt = _v3.set(0, 0, -1).applyMatrix4(_m1).add(camPos);

    _v4.subVectors(planePoint, camPos).reflect(normal).negate().add(planePoint);
    rc.position.copy(_v4);
    rc.up.set(0, 1, 0).applyMatrix4(_m1).reflect(normal);
    _v4.subVectors(planePoint, lookAt).reflect(normal).negate().add(planePoint);
    rc.lookAt(_v4);

    rc.near = camera.near;
    rc.far = camera.far;
    rc.fov = camera.fov;
    rc.aspect = camera.aspect;
    rc.updateProjectionMatrix();
    rc.updateMatrixWorld(true);
    rc.matrixWorldInverse.copy(rc.matrixWorld).invert();

    this.uniforms.uReflMatrix.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(rc.projectionMatrix)
      .multiply(rc.matrixWorldInverse);
  }

  /**
   * Renders the two auxiliary views the water needs. `hidden` is the set of
   * objects that must not appear in them (the water itself and the sky dome —
   * the sky is added back analytically, at full resolution, in the shader).
   */
  renderAuxiliary(renderer, scene, camera, hidden, want = {}) {
    const doRefl = want.reflection !== false;
    const doRefr = want.refraction !== false;
    this.uniforms.uRefractionValid.value = doRefr ? 1 : 0;
    if (!doRefl && !doRefr) return;

    const prevClear = renderer.getClearAlpha();
    const prevShadow = renderer.shadowMap.autoUpdate;
    for (const o of hidden) o.visible = false;
    renderer.setClearAlpha(0);
    renderer.shadowMap.autoUpdate = false;

    if (doRefl) {
      this.updateReflectionCamera(camera);
      renderer.clippingPlanes = [this.clipPlane];
      renderer.setRenderTarget(this.reflectionRT);
      renderer.clear();
      renderer.render(scene, this.reflectionCamera);
      renderer.clippingPlanes = [];
    }

    if (doRefr) {
      renderer.setRenderTarget(this.refractionRT);
      renderer.clear();
      renderer.render(scene, camera);
    }

    renderer.setRenderTarget(null);
    renderer.setClearAlpha(prevClear);
    renderer.shadowMap.autoUpdate = prevShadow;
    for (const o of hidden) o.visible = true;

    this.uniforms.uNear.value = camera.near;
    this.uniforms.uFar.value = camera.far;
  }

  update(camera, wake) {
    this.uniforms.uCenter.value.set(camera.position.x, camera.position.z);
    if (wake) {
      this.uniforms.uWake.value = wake.texture;
      this.uniforms.uWakeCenter.value.copy(wake.center);
      this.uniforms.uWakeRegion.value = wake.region;
    }
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _n1 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
