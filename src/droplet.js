import * as THREE from 'three';
import { shared, KNOTS } from './shared.js';
import { SKY_SAMPLE_GLSL, CLOUD_GLSL } from './atmosphere.js';
import { sampleOcean } from './waves.js';
import { clamp, damp, makeRng } from './utils.js';

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
const BRAKE = 950;          // and sheds it in a sixth of one
const COAST = 15;           // what it gives back when you ask for nothing
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
  // A mirror shows its own silhouette more honestly than anything else in the
  // scene does, so this is worth the triangles.
  const NU = 180, NV = 96;
  // normalise so the widest section is exactly maxDiameter across
  const uMax = Math.sqrt(PROFILE_A / (PROFILE_A + 1));
  const scale = (maxDiameter / 2) / dropRadius(uMax);

  const pos = new Float32Array((NU + 1) * (NV + 1) * 3);
  const nrm = new Float32Array((NU + 1) * (NV + 1) * 3);
  const idx = [];
  let k = 0;
  for (let i = 0; i <= NU; i++) {
    // cosine spacing: rings bunch at both poles, which is where all the
    // curvature is and where a mirror shows faceting first
    const u = 0.5 - 0.5 * Math.cos(Math.PI * (i / NU));
    const r = dropRadius(u) * scale;
    // The bulb leads and the needle trails — which is how the thing flies in
    // the book, and it is also the better silhouette head-on.
    const z = (u - 0.5) * length;
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
  // both ends are singular points, and averaging around a zero-radius ring
  // gives garbage; aim them straight down the axis instead
  const n = g.getAttribute('normal');
  const last = NU * (NV + 1);
  for (let j = 0; j <= NV; j++) {
    n.setXYZ(j, 0, 0, -1);            // the needle, trailing
    n.setXYZ(last + j, 0, 0, 1);      // the bulb, leading
  }
  n.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------
// mirror shading
// ---------------------------------------------------------------------------

/**
 * Polished steel, evaluated analytically rather than from a cube map.
 *
 * Every reflected ray goes to one of two places. Up, and it is the same
 * scattering table the sky dome and the ocean use, so the probe agrees with
 * the horizon behind it exactly. Down, and it is the sea, which is itself
 * mostly a mirror — so what comes back is the sky again, Fresnel-weighted over
 * the water's own colour, plus whatever the sun is doing on it. Two lookups
 * and no render targets, and it is *more* correct at the horizon than a
 * 256-pixel cube would be.
 *
 * What comes back then gets treated as *metal* rather than as a soap bubble.
 * A perfect mirror under this sky is mostly pale blue, which reads as glass;
 * a silver Fresnel term, a reflectivity under one, and pulling half the
 * chroma out of the reflection is what turns it into something you would
 * believe was machined.
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
      // under one: steel returns a little less than everything, and the gap is
      // most of what separates metal from glass
      uReflectivity: { value: 0.86 },
      uCharge: { value: 0 },       // 0..1, flares while it is manoeuvring hard
      uAura: { value: 0 },         // 0..1, the opposite: up while it waits
    },
    vertexShader: /* glsl */`
      precision highp float;
      varying vec3 vWorld;
      varying vec3 vNormal2;
      varying float vAxial;    // -1 at the needle, +1 at the bulb
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal2 = normalize(mat3(modelMatrix) * normal);
        vAxial = position.z / ${(LENGTH * 0.5).toFixed(3)};
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      #define PI 3.14159265359
      ${SKY_SAMPLE_GLSL}
      ${CLOUD_GLSL}

      uniform float uSunIntensity, uCharge, uReflectivity, uAura, uTime;
      uniform vec3 uSeaColor;
      varying vec3 vWorld;
      varying vec3 vNormal2;
      varying float vAxial;

      void main() {
        vec3 N = normalize(vNormal2);
        vec3 V = normalize(uCameraPos - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        vec3 R = reflect(-V, N);
        float NoV = max(dot(N, V), 0.0);

        vec3 env;
        if (R.y > 0.0) {
          env = skyRadiance(R);
          vec4 cl = clouds(R, uSunDir, uSunColor, env);
          env = mix(env, cl.rgb, cl.a);
        } else {
          // the ray goes into the sea, which sends most of it straight back up
          vec3 up = vec3(R.x, -R.y, R.z);
          vec3 skyBack = skyRadiance(up);
          vec4 cl = clouds(up, uSunDir, uSunColor, skyBack);
          skyBack = mix(skyBack, cl.rgb, cl.a);
          float f = 0.02 + 0.98 * pow(1.0 - min(-R.y, 1.0), 5.0);
          vec3 water = uSeaColor * (uSunColor * uSunIntensity * 0.6 +
                                    skyRadiance(vec3(0.0, 1.0, 0.0)) * 0.7) * 1.25;
          env = mix(water, skyBack, f);
          // the sun's track on the water, smeared the way a real one is
          float glint = pow(max(dot(up, uSunDir), 0.0), 220.0);
          env += uSunColor * uSunIntensity * glint * 3.5;
        }

        // A trace of gloss. Polished steel is not a liquid mirror: it carries
        // a lobe a few degrees wide, and mixing in the sky averaged toward the
        // surface normal is that lobe for one extra table lookup.
        env = mix(env, skyRadiance(normalize(mix(R, N, 0.55))), 0.10);

        // Silver, with the faint warmth polished steel has. Schlick on a metal
        // barely moves — F0 is already near one — but the little it does move
        // is what keeps the rim brighter than the belly.
        vec3 F0 = vec3(0.968, 0.947, 0.906);
        vec3 F = F0 + (1.0 - F0) * pow(1.0 - NoV, 5.0);
        vec3 col = env * F * uReflectivity;

        // Half the chroma comes out. A true mirror under this sky is pale
        // blue all over, which the eye reads as glass; steel keeps the shape
        // of the reflection but not its colour.
        col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 0.48);
        col *= vec3(1.04, 1.005, 0.945);

        // Steel lives on contrast — bright where it takes the sky, genuinely
        // dark where it takes the sea. Pulling the chroma out closes that gap;
        // a mild power curve is what opens it again, and without it the thing
        // reads as matte porcelain rather than as something machined.
        col = pow(max(col, 0.0), vec3(1.28)) * 1.36;

        // The sun, which a surface this smooth genuinely returns: a hard point
        // riding on a tighter-than-usual lobe, not a broad roughness smear.
        float RoS = max(dot(R, uSunDir), 0.0);
        col += uSunColor * uSunIntensity * pow(RoS, 2600.0) * 260.0;
        col += uSunColor * uSunIntensity * pow(RoS, 140.0) * 1.1;
        col += uSunColor * uSunIntensity * pow(RoS, 14.0) * 0.055;

        // it lights up along its own axis when it is working
        float graze = pow(1.0 - NoV, 4.0);
        col += vec3(0.35, 0.62, 0.95) * uCharge * graze * 1.6;

        // and the last of the needle takes a little of the idle glow, so the
        // halo behind it looks like it is coming *out* of the thing rather
        // than hanging in the water on its own
        float tail = smoothstep(-0.30, -0.94, vAxial);
        col += vec3(0.20, 0.55, 1.0) * uAura * tail * (0.10 + graze * 0.62) *
               (0.7 + 0.3 * sin(uTime * 2.1));

        col = applyAerial(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// the charging aura
// ---------------------------------------------------------------------------

/**
 * What it does while it is doing nothing.
 *
 * Two thin rings and a scatter of points, hanging in the water astern of the
 * needle, turning slowly and breathing. They come up when it comes to rest and
 * are gone the instant it moves — which is the right way round: a thing that
 * accelerates like this is not straining while it runs, it is straining while
 * it waits.
 *
 * All of it is additive with no depth write, so it reads as light rather than
 * as geometry, and none of it is lit — the probe's own shell is the only thing
 * in the scene that answers to the sun.
 */
function buildAura(length) {
  const group = new THREE.Group();
  const uniforms = {
    uAura: { value: 0 },
    uTime: shared.uTime,
    uTint: { value: new THREE.Color(0.20, 0.55, 1.0) },
  };

  const ringMat = (inner, outer) => new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uAura, uTime;
      uniform vec3 uTint;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        // soft on both edges, so the band has no cut line anywhere
        float band = smoothstep(${inner.toFixed(3)}, ${((inner + outer) * 0.5).toFixed(3)}, r) *
                     (1.0 - smoothstep(${((inner + outer) * 0.5).toFixed(3)}, ${outer.toFixed(3)}, r));
        // a slow breath, and a few brighter arcs chasing round it
        float a = atan(vP.y, vP.x);
        float chase = 0.62 + 0.38 * sin(a * 3.0 - uTime * 1.7);
        float pulse = 0.55 + 0.45 * sin(uTime * 2.1);
        float i = band * chase * pulse * uAura;
        if (i < 0.004) discard;
        // additive blending here is src*alpha + dst, so the contribution goes
        // as i squared — which is what keeps the faint end genuinely faint
        gl_FragColor = vec4(uTint * i * 0.85, i * 0.60);
      }
    `,
  });

  const r1 = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.46, 64, 1), ringMat(0.18, 0.44));
  r1.position.z = -length * 0.5 - 0.22;
  const r2 = new THREE.Mesh(new THREE.RingGeometry(0.30, 0.74, 64, 1), ringMat(0.32, 0.72));
  r2.position.z = -length * 0.5 - 0.62;
  group.add(r1, r2);

  // the points: a loose shell of them, drifting round the axis
  const N = 30;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  const rnd = makeRng(4211);
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.20 + rnd() * 0.62;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.sin(a) * r;
    pos[i * 3 + 2] = -length * 0.5 - 0.15 - rnd() * 1.5;
    seed[i] = rnd();
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const points = new THREE.Points(pg, new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime, uAura;
      varying float vI;
      void main() {
        // each one turns about the axis at its own rate and bobs a little
        float a = uTime * (0.25 + aSeed * 0.65);
        float c = cos(a), s = sin(a);
        vec3 p = vec3(position.x * c - position.y * s,
                      position.x * s + position.y * c,
                      position.z + sin(uTime * 1.4 + aSeed * 8.0) * 0.09);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // they wink in and out, which is what stops it reading as a decal
        vI = uAura * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 2.6 + aSeed * 21.0), 2.0));
        gl_PointSize = (1.1 + aSeed * 1.9) * (34.0 / max(-mv.z, 0.6));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uTint;
      varying float vI;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float g = 1.0 - smoothstep(0.0, 1.0, d);
        g *= g;
        float i = g * vI;
        if (i < 0.004) discard;
        gl_FragColor = vec4(uTint * i * 0.9, i * 0.55);
      }
    `,
  }));
  points.frustumCulled = false;
  group.add(points);

  group.renderOrder = 20;      // additive light goes down after the opaque pass
  return { group, uniforms };
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
    this.aura = 0;               // the idle halo, up when it is holding still
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

    const aura = buildAura(LENGTH);
    this.auraUniforms = aura.uniforms;
    this.root.add(aura.group);

    // the eye rides just behind the tip, looking out along the axis
    this.helm = new THREE.Group();
    this.helm.position.set(0, 0, LENGTH * 0.30);
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
      // Hold to accelerate, let go and it winds down. Stopping is not the same
      // problem as starting for a thing whose momentum is not its own: the
      // brake is five times the accelerator, so S kills three hundred knots in
      // a sixth of a second and is still something you can steer through.
      if (input.trim < 0) {
        this.surge = Math.min(MAX_AHEAD, this.surge + (this.surge < 0 ? BRAKE : ACCEL) * dt);
      } else if (input.trim > 0) {
        this.surge = Math.max(-MAX_ASTERN, this.surge - (this.surge > 0 ? BRAKE : ACCEL) * dt);
      } else {
        const give = COAST * dt;
        this.surge = Math.abs(this.surge) <= give ? 0 : this.surge - Math.sign(this.surge) * give;
      }

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

    // The aura is the other way round: it takes its time coming up once the
    // thing has settled, and vanishes the instant it moves.
    const still = Math.abs(this.surge) < 1.5;
    this.aura = damp(this.aura, still ? 1 : 0, still ? 0.9 : 7.0, dt);
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
    this.mat.uniforms.uAura.value = this.aura;
    this.auraUniforms.uAura.value = this.aura;
  }

  /**
   * What the ocean shader needs: where the well is, how high it is being held,
   * and how hard. Returns null when the probe is not on station.
   */
  writeOceanUniforms(uDroplet, uDropTrail, uShock) {
    if (!this.active) {
      uDroplet.value.set(0, 0, 999, 0);
      uDropTrail.value.set(0, 1, 0);
    } else {
      const h = Math.max(0, this.position.y - this.seaLast);
      // it stops dishing the sea out once it is well clear of it
      const strength = clamp(1 - (h - 2) / 26, 0, 1) * (this.arriving > 0 ? 0.4 : 1);
      uDroplet.value.set(this.position.x, this.position.z, Math.min(h, 24), strength);
      // the trench runs the way it came from, and the faster it is going the
      // longer the water takes to fall back in behind it
      const sign = this.surge >= 0 ? -1 : 1;
      uDropTrail.value.set(
        Math.sin(this.heading) * sign,
        Math.cos(this.heading) * sign,
        clamp(Math.abs(this.surge) * 1.35, 0, 260)
      );
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
