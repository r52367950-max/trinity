import * as THREE from 'three';
import { shared } from './shared.js';
import { makeWaterNormalTexture, makeFoamTexture, makeNoiseTexture, makeSandTexture } from './noise.js';
import { Sky } from './atmosphere.js';
import { Terrain, waterDepthAt, terrainHeight, ISLAND } from './terrain.js';
import { PROP_LAYER } from './layers.js';
import { buildTown, makeBirds } from './town.js';
import { Ocean } from './ocean.js';
import { Wake } from './wake.js';
import { Boat } from './boat.js';
import { Post } from './post.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { configureWaves, setDepthProvider, sampleOcean, waveUniforms } from './waves.js';
import { applyAtmosphere } from './materials.js';
import { clamp, damp, makeRng } from './utils.js';

const canvas = document.getElementById('view');
const gate = document.getElementById('gate');
const bar = document.querySelector('#bar i');
const loadLabel = document.getElementById('loadlabel');
const playBtn = document.getElementById('play');

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, stencil: false, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.NoToneMapping;   // tone mapping happens in the composite
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.environmentIntensity = 0.82;
const camera = new THREE.PerspectiveCamera(57, 2, 0.15, 30000);

const state = {
  time: 0,
  chase: false,
  quality: 1,
  sunAzimuth: 1.95,
  sunElevation: 0.42,
  wind: { from: 0.92, speed: 7.5, baseFrom: 0.92, baseSpeed: 7.5 },
  marks: [],
  currentMark: 0,
  raceStart: null,
  raceTime: 0,
  finished: false,
  paused: true,
};

let sky, terrain, ocean, wake, boat, post, hud, input, town, birds;

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
async function step(pct, label, fn) {
  bar.style.width = pct + '%';
  loadLabel.textContent = label;
  await nextFrame();
  await nextFrame();
  const out = fn();
  return out;
}

async function boot() {
  const t0 = performance.now();

  const noiseTex = await step(8, 'Weaving noise…', () => makeNoiseTexture(256, 5));
  const waterNormal = await step(24, 'Carving ripples…', () => makeWaterNormalTexture(512, 11));
  const foamTex = await step(38, 'Whipping up foam…', () => makeFoamTexture(512, 91));
  const sandTex = await step(46, 'Sifting sand…', () => makeSandTexture(512, 61));

  await step(54, 'Lighting the sky…', () => {
    sky = new Sky(renderer, noiseTex);
    sky.attach(scene);
    sky.setSun(state.sunAzimuth, state.sunElevation);
  });

  terrain = await step(66, 'Raising the island…', () => {
    const t = new Terrain({ sandTex, noiseTex });
    scene.add(t.mesh);
    setDepthProvider(waterDepthAt);
    return t;
  });

  town = await step(80, 'Building the town…', () => buildTown(scene));
  birds = makeBirds(scene);

  await step(90, 'Flooding the bay…', () => {
    configureWaves(state.wind.from, state.wind.speed);
    ocean = new Ocean(renderer, { waterNormal, foam: foamTex, noise: noiseTex, terrain });
    scene.add(ocean.mesh);
    wake = new Wake(renderer, { size: 512, region: 320 });
  });

  await step(96, 'Rigging the boat…', () => {
    boat = new Boat(scene);
    buildCourse();
    post = new Post(renderer);
    hud = new Hud();
    input = new Input(canvas);
    if (matchMedia('(pointer: coarse)').matches) {
      input.installTouch(canvas);
      document.body.classList.add('touch');
    }
    camera.layers.enable(PROP_LAYER);   // props are hidden from the mirror pass
    applyTier(detectTier());
    updateCamera(0.016);
  });

  bar.style.width = '100%';
  loadLabel.textContent = `Ready in ${((performance.now() - t0) / 1000).toFixed(1)}s`;
  playBtn.classList.add('ready');
  playBtn.addEventListener('click', () => {
    gate.classList.add('gone');
    state.paused = false;
    try { const p = canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch { /* drag to look instead */ }
    setTimeout(() => gate.remove(), 900);
  });
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// race course
// ---------------------------------------------------------------------------

const MARK_NAMES = ['Harbour mark', 'Beach mark', 'Headland mark', 'Outer mark', 'Finish'];

function pushToDeepWater(x, z, minDepth = 5) {
  const c = ISLAND.center;
  let px = x, pz = z;
  for (let i = 0; i < 220; i++) {
    if (-terrainHeight(px, pz) >= minDepth) break;
    const dx = px - c.x, dz = pz - c.y;
    const len = Math.hypot(dx, dz) || 1;
    px += (dx / len) * 6;
    pz += (dz / len) * 6;
  }
  return new THREE.Vector2(px, pz);
}

function buildCourse() {
  const raw = [[-235, -95], [40, -215], [330, -150], [300, 240], [95, 330]];
  const buoyMat = applyAtmosphere(new THREE.MeshStandardMaterial({
    color: 0xff7a2f, roughness: 0.5, emissive: 0x2a0d00, emissiveIntensity: 1,
  }));
  const darkMat = applyAtmosphere(new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.7 }));

  raw.forEach(([x, z], i) => {
    const p = pushToDeepWater(x, z, 5.5);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.86, 1.5, 12), buoyMat);
    body.position.y = 0.25;
    body.castShadow = true;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.1, 12), buoyMat);
    cone.position.y = 1.55;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), darkMat);
    mast.position.y = 2.6;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), darkMat);
    top.position.y = 3.85;
    g.add(body, cone, mast, top);
    scene.add(g);
    state.marks.push({ pos: p, group: g, name: MARK_NAMES[i] });
  });
}

function updateCourse(dt) {
  const sample = { y: 0, normal: new THREE.Vector3(), fold: 1 };
  state.marks.forEach((m, i) => {
    sampleOcean(m.pos.x, m.pos.y, state.time, sample);
    m.group.position.set(m.pos.x, sample.y - 0.35, m.pos.y);
    m.group.rotation.z = Math.atan2(sample.normal.x, sample.normal.y) * 0.8;
    m.group.rotation.x = -Math.atan2(sample.normal.z, sample.normal.y) * 0.8;
    const active = i === state.currentMark && !state.finished;
    m.group.scale.setScalar(active ? 1.25 : 1);
  });

  if (state.finished) return;
  const m = state.marks[state.currentMark];
  const d = Math.hypot(boat.position.x - m.pos.x, boat.position.z - m.pos.y);
  if (d < 24) {
    if (state.raceStart === null) state.raceStart = state.time;
    state.currentMark++;
    if (state.currentMark >= state.marks.length) {
      state.finished = true;
      hud.toast(`Course complete — ${fmtTime(state.raceTime)}`, 6);
    } else {
      hud.toast(`Rounded ${m.name} → ${state.marks[state.currentMark].name}`);
    }
  }
  if (state.raceStart !== null && !state.finished) state.raceTime = state.time - state.raceStart;
}

const fmtTime = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const qBoat = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const qPitch = new THREE.Quaternion();
const eBoat = new THREE.Euler(0, 0, 0, 'YXZ');
const chasePos = new THREE.Vector3(0, 6, 320);
const chaseAim = new THREE.Vector3();
const tmp = new THREE.Vector3();
const heading2 = new THREE.Vector2();

function updateCamera(dt) {
  boat.root.updateMatrixWorld(true);

  if (state.chase) {
    const off = tmp.set(Math.sin(boat.heading + 2.6) * 15, 6.2, Math.cos(boat.heading + 2.6) * 15);
    chasePos.lerp(off.add(boat.position), 1 - Math.exp(-dt * 2.6));
    chaseAim.lerp(tmp.copy(boat.position).setY(boat.position.y + 3.4), 1 - Math.exp(-dt * 5));
    camera.position.copy(chasePos);
    camera.up.set(0, 1, 0);
    camera.lookAt(chaseAim);
    return;
  }

  boat.helm.getWorldPosition(camera.position);
  // The camera looks down its own -Z, the boat sails along +Z, so the base
  // orientation is the hull turned through half a circle. Conjugating by that
  // half turn is what flips the signs on pitch and roll here.
  // A helmsman braces against the heel: the horizon tips, but less than the deck.
  eBoat.set(-boat.pitch * 0.55, boat.heading + Math.PI, (boat.heel + boat.waveRoll) * 0.52);
  qBoat.setFromEuler(eBoat);
  qYaw.setFromAxisAngle(UP, input.lookYaw);
  qPitch.setFromAxisAngle(RIGHT, input.lookPitch);
  camera.quaternion.copy(qBoat).multiply(qYaw).multiply(qPitch);
}

// ---------------------------------------------------------------------------

/**
 * Quality tiers. The expensive things here are the two auxiliary scene renders
 * the water needs and the water's own fragment shader, so that is what the
 * tiers turn down first.
 */
const TIERS = {
  high:   { name: 'High',   reflScale: 0.55, cloudRefl: 1, msaa: 4, shadow: 2048, shadowEvery: 2, bloom: true,  planar: 1.0, maxScale: 1.00, foam: 1.0 },
  medium: { name: 'Medium', reflScale: 0.42, cloudRefl: 0, msaa: 2, shadow: 1024, shadowEvery: 3, bloom: true,  planar: 1.0, maxScale: 0.85, foam: 1.0 },
  low:    { name: 'Fast',   reflScale: 0.00, cloudRefl: 0, msaa: 0, shadow: 1024, shadowEvery: 5, bloom: false, planar: 0.0, maxScale: 0.70, foam: 0.9 },
};
const TIER_ORDER = ['high', 'medium', 'low'];

const perf = {
  tier: 'high',
  scale: 1.0,          // dynamic resolution multiplier on top of the tier cap
  basePixelRatio: Math.min(devicePixelRatio || 1, 2),
  frameMs: 16.7,
  adjustTimer: 0,
  autoTiered: false,
  frames: 0,
};

/** Software rasterisers never win this fight; do not make them try. */
function detectTier() {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|software|llvmpipe|basic render/i.test(name)) return 'low';
  } catch { /* renderer string is optional */ }
  return 'high';
}

function applyTier(name) {
  perf.tier = name;
  const t = TIERS[name];
  ocean.uniforms.uCloudReflections.value = t.cloudRefl;
  ocean.uniforms.uPlanarStrength.value = t.planar;
  ocean.uniforms.uFoamAmount.value = t.foam;
  post.enabled = t.bloom;
  post.setSamples(t.msaa);
  sky.setShadowSize(t.shadow);
  perf.scale = Math.min(perf.scale, t.maxScale);
  resize();
}

function resize() {
  const w = Math.floor(canvas.clientWidth || innerWidth);
  const h = Math.floor(canvas.clientHeight || innerHeight);
  const tier = TIERS[perf.tier];
  const pr = perf.basePixelRatio * Math.min(perf.scale, tier.maxScale);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const bw = Math.max(2, Math.floor(w * pr));
  const bh = Math.max(2, Math.floor(h * pr));
  post.setSize(bw, bh);
  ocean.setSize(bw, bh, tier.reflScale);
}
addEventListener('resize', () => { if (post) resize(); });

/**
 * Dynamic resolution, then tier fallback. Framerate is spent on pixels first
 * because that is the cheapest thing to give back; only if dropping to the
 * tier's floor still misses the target does the tier itself step down.
 */
function autoTune(dt, rawMs) {
  // measure the real frame time, not the timestep the physics was clamped to,
  // or a machine slow enough to hit the clamp can never see how slow it is
  perf.frameMs = perf.frameMs * 0.86 + Math.min(rawMs, 4000) * 0.14;
  perf.adjustTimer += dt;
  perf.frames++;
  if (perf.adjustTimer < 1.0 || perf.frames < 4) return;
  perf.adjustTimer = 0;

  const tier = TIERS[perf.tier];
  const slow = perf.frameMs > 20.5;    // below ~49 fps
  const dire = perf.frameMs > 90.0;    // below ~11 fps: give up ground fast
  const fast = perf.frameMs < 13.0;    // above ~77 fps

  const i = TIER_ORDER.indexOf(perf.tier);
  const canTier = i < TIER_ORDER.length - 1;
  const FLOOR = 0.5;

  if (slow) {
    if (dire && canTier) {
      // far off the pace: shedding features beats shaving pixels
      perf.scale = 1.0;
      applyTier(TIER_ORDER[i + 1]);
      hud.toast(`Quality: ${TIERS[perf.tier].name}`, 1.8);
    } else if (perf.scale > FLOOR) {
      perf.scale = Math.max(FLOOR, perf.scale - (dire ? 0.15 : 0.1));
      resize();
    } else if (canTier) {
      perf.scale = 1.0;
      applyTier(TIER_ORDER[i + 1]);
      hud.toast(`Quality: ${TIERS[perf.tier].name}`, 1.8);
    }
  } else if (fast && perf.scale < tier.maxScale) {
    perf.scale = Math.min(tier.maxScale, perf.scale + 0.06);
    resize();
  }
}

const _probe = new THREE.Vector3();
/**
 * The refraction prepass is a whole extra scene render, and it only matters
 * where you can actually see the bottom. Past ~30 m the water has absorbed
 * everything anyway, so out in the bay the pass is simply skipped.
 */
function needsRefraction() {
  if (waterDepthAt(camera.position.x, camera.position.z) < 34) return true;
  camera.getWorldDirection(_probe);
  for (const d of [120, 280, 500]) {
    const x = camera.position.x + _probe.x * d;
    const z = camera.position.z + _probe.z * d;
    if (waterDepthAt(x, z) < 34) return true;
  }
  return false;
}

function hotkeys() {
  if (input.tapped('KeyC')) {
    state.chase = !state.chase;
    hud.toast(state.chase ? 'Chase camera' : 'At the helm');
  }
  if (input.tapped('KeyT')) {
    boat.autoTrim = !boat.autoTrim;
    hud.toast(boat.autoTrim ? 'Auto trim on' : 'Manual sheet — W / S');
  }
  if (input.tapped('KeyH')) document.getElementById('help').classList.toggle('hidden');
  if (input.tapped('KeyF')) {
    const i = (TIER_ORDER.indexOf(perf.tier) + 1) % TIER_ORDER.length;
    perf.scale = 1.0;
    applyTier(TIER_ORDER[i]);
    hud.toast(`Quality: ${TIERS[perf.tier].name}`);
  }
  if (input.down('BracketLeft')) setSun(-0.35);
  if (input.down('BracketRight')) setSun(0.35);
  if (input.down('Minus')) setWind(-2.5);
  if (input.down('Equal')) setWind(2.5);
  if (input.tapped('KeyR')) {
    boat.position.set(0, 0, 280);
    boat.heading = Math.PI; boat.surge = 0; boat.sway = 0; boat.yawRate = 0; boat.heel = 0;
    state.currentMark = 0; state.raceStart = null; state.raceTime = 0; state.finished = false;
    hud.toast('Back to the start');
  }
}

let sunTimer = 0;
function setSun(rate) {
  const dt = Math.min(0.05, lastDt);
  state.sunElevation = clamp(state.sunElevation + rate * dt * 0.35, -0.06, 1.35);
  state.sunAzimuth += rate * dt * 0.12;
  sky.setSun(state.sunAzimuth, state.sunElevation);
}
function setWind(rate) {
  const dt = Math.min(0.05, lastDt);
  state.wind.baseSpeed = clamp(state.wind.baseSpeed + rate * dt, 2.0, 17.0);
}

// ---------------------------------------------------------------------------

let last = performance.now();
let lastDt = 0.016;
let fpsAcc = 0, fpsCount = 0;
const rngGust = makeRng(5150);
const gustSeed = [rngGust(), rngGust(), rngGust()];

function loop(now) {
  requestAnimationFrame(loop);
  const dtRaw = (now - last) / 1000;
  last = now;
  // a generous cap: long enough to survive a slow frame, short enough that
  // coming back from a backgrounded tab does not teleport the boat
  const dt = Math.min(0.25, Math.max(0.0005, dtRaw));
  lastDt = dt;
  const rawMs = Math.max(0.5, dtRaw * 1000);

  state.time += dt;
  if (state.paused) {
    // keep the sea alive behind the title card
    updateCourse(dt);
    updateCamera(dt);
    birds(state.time);
    renderScene(dt, state.time);
    return;
  }

  input.update(dt);
  hotkeys();
  autoTune(dt, rawMs);

  // gusts and shifts: the breeze is never quite steady
  const t = state.time;
  const gust = Math.sin(t * 0.13 + gustSeed[0] * 9) * 0.55 + Math.sin(t * 0.37 + gustSeed[1] * 9) * 0.3;
  const shift = Math.sin(t * 0.081 + gustSeed[2] * 9) * 0.14 + Math.sin(t * 0.21) * 0.05;
  state.wind.speed = damp(state.wind.speed, state.wind.baseSpeed * (1 + gust * 0.16), 1.5, dt);
  state.wind.from = state.wind.baseFrom + shift;

  if (input.trim !== 0) boat.autoTrim = false;

  // Fixed substeps: the rig, the heel spring and the rudder all need a short
  // timestep to stay stable, but clamping the frame delta instead would put
  // the whole boat into slow motion on a slow machine.
  const steps = Math.min(10, Math.max(1, Math.ceil(dt / 0.020)));
  const sub = dt / steps;
  let rig;
  for (let i = 0; i < steps; i++) {
    rig = boat.update(sub, input, state.wind, t - dt + sub * (i + 1));
  }

  heading2.set(Math.sin(boat.heading), Math.cos(boat.heading));
  wake.update(dt, boat.position, heading2, Math.abs(boat.surge), 9.5);

  updateCourse(dt);
  updateCamera(dt);
  birds(t);

  renderScene(dt, t);

  hud.update({ boat, wind: state.wind, boomAngle: rig.boomAngle * rig.tackSign, tackSign: rig.tackSign, time: t });
  hud.el.mark.textContent = state.finished ? 'Complete' : state.marks[state.currentMark].name;
  hud.el.timer.textContent = state.raceStart === null ? '--:--' : fmtTime(state.raceTime);

  fpsAcc += rawMs / 1000; fpsCount++;
  if (fpsAcc > 0.5) {
    const fps = Math.round(fpsCount / fpsAcc);
    hud.el.fps.textContent = `${fps} fps · ${TIERS[perf.tier].name.toLowerCase()} · ${Math.round(perf.scale * 100)}%`;
    fpsAcc = 0; fpsCount = 0;
  }
}

function renderScene(dt, t) {
  // shared uniforms — one write, every shader sees it
  shared.uTime.value = t;
  shared.uCloudTime.value = t;
  shared.uCameraPos.value.copy(camera.position);
  shared.uInvView.value.copy(camera.matrixWorld);
  shared.uWindDir.value.set(Math.sin(state.wind.from), Math.cos(state.wind.from));
  shared.uWindSpeed.value = state.wind.speed;
  waveUniforms.uWaveTime.value = t;
  configureWaves(state.wind.from, state.wind.speed);

  camera.updateMatrixWorld(true);

  if (sky.update(renderer, dt)) scene.environment = sky.environment;
  sky.setShadowFocus(boat ? boat.position : new THREE.Vector3());
  sky.dome.position.copy(camera.position);

  ocean.update(camera, wake);
  ocean.renderAuxiliary(renderer, scene, camera, [ocean.mesh, sky.dome], {
    refraction: needsRefraction(),
    reflection: TIERS[perf.tier].reflScale > 0,
  });

  // the sun does not move and the town does not walk about, so the shadow map
  // only really needs to keep up with the boat
  const every = TIERS[perf.tier].shadowEvery;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = (perf.frames % every) === 0;

  renderer.setRenderTarget(post.sceneRT);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  post.render(t);
}

// handy for tuning from the console
window.__leeward = { get scene() { return scene; }, get renderer() { return renderer; },
  get camera() { return camera; }, get ocean() { return ocean; }, get boat() { return boat; },
  get sky() { return sky; }, get post() { return post; }, state, perf, TIERS,
  setTier: (n) => applyTier(n), THREE };

boot();
