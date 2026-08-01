import * as THREE from 'three';
import { shared, KNOTS } from './shared.js';
import { SKY_SAMPLE_GLSL, CLOUD_GLSL } from './atmosphere.js';
import { sampleOcean } from './waves.js';
import { clamp, damp } from './utils.js';

/**
 * The probe.
 *
 * A teardrop of strong-interaction material: three and a half metres long,
 * absolutely smooth, absolutely rigid, and a perfect mirror. Nothing else in
 * this scene is a perfect mirror — the sea is only a partial one and everything
 * else is rough — so it does not sit in the world so much as quote it back.
 *
 * It obeys none of the rest of the physics. There is no hull speed, no
 * resistance curve, no inertia worth the name: it holds three hundred knots,
 * stops in the space of a frame, reverses at nearly two hundred, and changes
 * heading through an acute angle without the trace of a turning circle. That
 * is not a shortcut. A thing that can do those four things is a thing whose
 * momentum is not its own problem, and the way it moves is the only evidence
 * of that you ever get.
 */

const LENGTH = 3.5;
const MAX_AHEAD = 148;      // m/s — about 288 knots
const MAX_ASTERN = 96;      // about 187 knots
const ACCEL = 190;          // m/s^2; it reaches cruise in under a second
const TURN_RATE = 13.0;     // rad/s at full deflection — a corner, not a circle
const HOVER_MIN = 1.2;
const HOVER_MAX = 900;

// ---------------------------------------------------------------------------
// shape
// ---------------------------------------------------------------------------

/**
 * Radius along the axis, u = 0 at the needle tip, u = 1 at the tail pole.
 *
 *   r(u) = u^a * sqrt(1 - u^2)
 *
 * The sqrt closes the tail with a vertical tangent, which is what makes that
 * end read as a round pole rather than a second point; the u^a makes the tip
 * approach zero with zero slope, which is what makes it a needle rather than a
 * cone. a puts the widest section at sqrt(a/(a+1)) — about three quarters of
 * the way aft, which is where a falling drop carries it.
 */
const PROFILE_A = 1.62;
function dropRadius(u) {
  const c = 1 - u * u;
  if (c <= 0) return 0;
  return Math.pow(u, PROFILE_A) * Math.sqrt(c);
}

function buildDroplet(length = LENGTH, maxDiameter = 1.55) {
  const NU = 132, NV = 72;
  // normalise so the widest section is exactly maxDiameter across
  const uMax = Math.sqrt(PROFILE_A / (PROFILE_A + 1));
  const scale = (maxDiameter / 2) / dropRadius(uMax);

  const pos = new Float32Array((NU + 1) * (NV + 1) * 3);
  const nrm = new Float32Array((NU + 1) * (NV + 1) * 3);
  const idx = [];
  let k = 0;
  for (let i = 0; i <= NU; i++) {
    // bunch the rings toward the tip, where all the curvature is
    const u = Math.pow(i / NU, 1.35);
    const r = dropRadius(u) * scale;
    // the tip points along +Z, so the thing flies the way it is pointing
    const z = (0.5 - u) * length;
    for (let j = 0; j <= NV; j++) {
      const a = (j / NV) * Math.PI * 2;
      pos[k] = Math.cos(a) * r;
      pos[k + 1] = Math.sin(a) * r;
      pos[k + 2] = z;
      k += 3;
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j;
      idx.push(a, a + 1, a + NV + 1, a + 1, a + NV + 2, a + NV + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the tip is a singular point and averaging around it gives garbage; aim it
  // straight down the axis instead
  const n = g.getAttribute('normal');
  for (let j = 0; j <= NV; j++) n.setXYZ(j, 0, 0, 1);
  n.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------
// mirror shading
// ---------------------------------------------------------------------------

/**
 * A perfect mirror, evaluated analytically rather than from a cube map.
 *
 * Every reflected ray goes to one of two places. Up, and it is the same
 * scattering table the sky dome and the ocean use, so the probe agrees with
 * the horizon behind it exactly. Down, and it is the sea, which is itself
 * mostly a mirror — so what comes back is the sky again, Fresnel-weighted over
 * the water's own colour, plus whatever the sun is doing on it. Two lookups
 * and no render targets, and it is *more* correct at the horizon than a
 * 256-pixel cube would be.
 */
function dropletMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSkyLUT: shared.uSkyLUT,
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor,
      uSunIntensity: shared.uSunIntensity,
      uCameraPos: shared.uCameraPos,
      uFogDensity: shared.uFogDensity,
      uFogHeight: shared.uFogHeight,
      uCloudTime: shared.uCloudTime,
      uCloudCover: shared.uCloudCover,
      uNoiseTex: { value: null },
      uTime: shared.uTime,
      uSeaColor: { value: new THREE.Color(0.012, 0.055, 0.095) },
      uCharge: { value: 0 },       // 0..1, flares while it is manoeuvring hard
    },
    vertexShader: /* glsl */`
      precision highp float;
      varying vec3 vWorld;
      varying vec3 vNormal2;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal2 = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      #define PI 3.14159265359
      ${SKY_SAMPLE_GLSL}
      ${CLOUD_GLSL}

      uniform float uSunIntensity, uCharge;
      uniform vec3 uSeaColor;
      varying vec3 vWorld;
      varying vec3 vNormal2;

      void main() {
        vec3 N = normalize(vNormal2);
        vec3 V = normalize(uCameraPos - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        vec3 R = reflect(-V, N);

        vec3 col;
        if (R.y > 0.0) {
          col = skyRadiance(R);
          vec4 cl = clouds(R, uSunDir, uSunColor, col);
          col = mix(col, cl.rgb, cl.a);
        } else {
          // the ray goes into the sea, which sends most of it straight back up
          vec3 up = vec3(R.x, -R.y, R.z);
          vec3 skyBack = skyRadiance(up);
          vec4 cl = clouds(up, uSunDir, uSunColor, skyBack);
          skyBack = mix(skyBack, cl.rgb, cl.a);
          float f = 0.02 + 0.98 * pow(1.0 - min(-R.y, 1.0), 5.0);
          vec3 water = uSeaColor * (uSunColor * uSunIntensity * 0.6 +
                                    skyRadiance(vec3(0.0, 1.0, 0.0)) * 0.7) * 2.2;
          col = mix(water, skyBack, f);
          // the sun's track on the water, smeared the way a real one is
          float glint = pow(max(dot(up, uSunDir), 0.0), 220.0);
          col += uSunColor * uSunIntensity * glint * 3.5;
        }

        // The sun itself, as a mirror this good actually returns it: a hard
        // point that blooms out along the curvature, not a soft roughness lobe.
        float sun = pow(max(dot(R, uSunDir), 0.0), 3400.0);
        col += uSunColor * uSunIntensity * sun * 340.0;
        col += uSunColor * uSunIntensity * pow(max(dot(R, uSunDir), 0.0), 90.0) * 0.9;

        // A whisper of grazing lift, so the silhouette never goes flat against
        // a bright sky. Metal has no Fresnel to speak of; this is the little
        // that a curved one does show.
        float graze = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        col *= 1.0 + graze * 0.35;

        // and it lights up along its own axis when it is working
        col += vec3(0.35, 0.62, 0.95) * uCharge * graze * 1.8;

        col = applyAerial(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// ---------------------------------------------------------------------------

export class Droplet {
  constructor(scene, opts = {}) {
    this.name = opts.name || '水滴';
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);

    this.position = new THREE.Vector3(0, 40, 0);
    if (opts.position) this.position.copy(opts.position);
    this.heading = opts.heading ?? 0;
    this.pitchAim = 0;           // where the nose points in elevation
    this.surge = 0;
    this.altitude = 8;           // metres above the local sea surface
    this.charge = 0;
    this.active = false;         // summoned and under control
    this.arriving = 0;
    this.stopFlash = 0;
    this.seaLast = 0;

    // its own state, so nothing else has to special-case it
    this.sway = 0;
    this.yawRate = 0;
    this.heel = 0;
    this.waveRoll = 0;
    this.pitch = 0;
    this.aground = 0;

    this.mat = dropletMaterial();
    this.mesh = new THREE.Mesh(buildDroplet(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;      // a mirror casting a soft shadow reads wrong
    this.root.add(this.mesh);

    // the eye rides just behind the tip, looking out along the axis
    this.helm = new THREE.Group();
    this.helm.position.set(0, 0, LENGTH * 0.24);
    this.root.add(this.helm);

    this.shock = { x: 0, z: 0, r: 0, strength: 0 };
    this.chaseAim = 0.1;         // the chase camera looks at it, not over it
  }

  setNoise(tex) { this.mat.uniforms.uNoiseTex.value = tex; }

  get forward() { return _df.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  get starboard() { return _ds.set(Math.cos(this.heading), 0, -Math.sin(this.heading)); }
  get speed() { return Math.abs(this.surge); }
  get knots() { return this.surge * KNOTS; }

  /** Called it down out of the sky. It arrives the only way it knows how. */
  summon(nearPos, nearHeading) {
    this.active = true;
    const off = _d1.set(Math.cos(nearHeading), 0, -Math.sin(nearHeading)).multiplyScalar(26);
    this.position.set(nearPos.x + off.x, 220, nearPos.z + off.z);
    this.heading = nearHeading + Math.PI * 0.5;
    this.surge = 0;
    this.altitude = 6;
    this.arriving = 1.0;
  }

  update(dt, input, time) {
    if (!this.active) return;

    if (this.arriving > 0) {
      // the descent: straight down, fast, and it simply stops
      this.arriving = Math.max(0, this.arriving - dt * 0.7);
      const target = this.seaAt(time) + this.altitude;
      this.position.y = damp(this.position.y, target, 3.2, dt);
      if (this.position.y - target < 1.0) this.arriving = 0;
      this.charge = 1;
      return;
    }

    if (input) {
      // Heading slews at a rate that has nothing to do with speed, which is
      // what produces the corner instead of a turn.
      // Held down at speed this puts the turn radius inside twenty metres,
      // which on a three-metre object is not a turn at all — it is a corner.
      // Eased off near rest only so that aiming it by hand is possible.
      const rate = TURN_RATE * (0.24 + 0.76 * Math.min(1, Math.abs(this.surge) / 40));
      this.heading -= input.rudder * rate * dt;
      // It has no drag and no momentum to speak of, so the throttle is a
      // statement of intent rather than a request: hold a key and it winds to
      // the stop, let go and it simply holds whatever it was doing.
      if (input.trim < 0) this.surge = Math.min(MAX_AHEAD, this.surge + ACCEL * dt);
      else if (input.trim > 0) this.surge = Math.max(-MAX_ASTERN, this.surge - ACCEL * dt);

      // dead stop
      if (input.neutral && Math.abs(this.surge) > 2) {
        this.stopFlash = 1;
        this.shock.x = this.position.x;
        this.shock.z = this.position.z;
        this.shock.r = 3;
        this.shock.strength = clamp(Math.abs(this.surge) / 60, 0.35, 1.6);
      }
      if (input.neutral) this.surge = 0;

      if (input.climb) this.altitude = clamp(this.altitude + (60 + this.altitude) * dt * input.climb, HOVER_MIN, HOVER_MAX);
    }

    this.position.addScaledVector(this.forward, this.surge * dt);

    // it holds a fixed height over whatever the sea is doing underneath
    const target = this.seaAt(time) + this.altitude;
    this.position.y = damp(this.position.y, target, 7, dt);

    // the shock ring runs out and dies
    if (this.shock.strength > 0) {
      this.shock.r += dt * 110;
      this.shock.strength = Math.max(0, this.shock.strength - dt * 0.55);
      if (this.shock.r > 260) this.shock.strength = 0;
    }
    this.stopFlash = Math.max(0, this.stopFlash - dt * 2.2);

    // it glows along its axis in proportion to how hard it is working
    const work = Math.abs(this.surge) / MAX_AHEAD + (input ? Math.abs(input.rudder) * 0.6 : 0);
    this.charge = damp(this.charge, clamp(work, 0, 1) * 0.8 + this.stopFlash, 6, dt);
  }

  seaAt(time) {
    const s = sampleOcean(this.position.x, this.position.z, time, _dSample);
    return s.y;
  }

  updateVisual(dt, time) {
    this.root.visible = this.active;
    if (!this.active) return;

    // The nose tips into the direction of travel — not because drag says so,
    // but because it is aimed, and aiming is the only thing it ever does.
    const aim = clamp(this.surge / MAX_AHEAD, -1, 1) * 0.09;
    this.pitchAim = damp(this.pitchAim, aim, 6, dt);
    this.pitch = this.pitchAim;

    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;
    this.root.rotation.x = this.pitchAim;
    this.root.rotation.z = 0;
    this.mat.uniforms.uCharge.value = this.charge;
  }

  /**
   * What the ocean shader needs: where the well is, how high it is being held,
   * and how hard. Returns null when the probe is not on station.
   */
  writeOceanUniforms(uDroplet, uShock) {
    if (!this.active) {
      uDroplet.value.set(0, 0, 999, 0);
    } else {
      const h = Math.max(0, this.position.y - this.seaLast);
      // it stops dishing the sea out once it is well clear of it
      const strength = clamp(1 - (h - 2) / 26, 0, 1) * (this.arriving > 0 ? 0.4 : 1);
      uDroplet.value.set(this.position.x, this.position.z, Math.min(h, 24), strength);
    }
    uShock.value.set(this.shock.x, this.shock.z, this.shock.r, this.shock.strength);
  }

  /** Cached each frame so writeOceanUniforms does not re-sample the sea. */
  cacheSea(time) { this.seaLast = this.seaAt(time); }
}

const _df = new THREE.Vector3();
const _ds = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _dSample = { y: 0, normal: new THREE.Vector3(), fold: 1 };
