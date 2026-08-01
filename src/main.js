import * as THREE from 'three';
import { shared } from './shared.js';
import { makeWaterNormalTexture, makeFoamTexture, makeNoiseTexture, makeSandTexture } from './noise.js';
import { Sky } from './atmosphere.js';
import { Terrain, waterDepthAt, terrainHeight, ISLAND } from './terrain.js';
import { PROP_LAYER } from './layers.js';
import { buildTown, makeBirds } from './town.js';
import { buildMoorings } from './moorings.js';
import { Ocean } from './ocean.js';
import { Wake } from './wake.js';
import { Boat, LIVERIES } from './boat.js';
import { Powerboat } from './powerboat.js';
import { Droplet } from './droplet.js';
import { Skipper } from './skipper.js';
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
  vessel: 'sail',      // which helm you are standing at: sail / power / drop
  view: 'helm',        // helm / orbit / flyby
  orbitDist: 16,
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

let sky, terrain, ocean, wake, boat, post, hud, input, town, birds, moorings;
let rival, rivalWake, skipper;
let power, powerWake, powerWakeIdle = 99;
let droplet, dropWake, dropWakeIdle = 99;
const mooring = { pos: new THREE.Vector3(0, 0, 0), heading: 0 };

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

  // Every one of these is read at a grazing angle across a receding surface,
  // which is exactly the case trilinear filtering blurs into mush.
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const tex of [waterNormal, foamTex, sandTex]) {
    tex.anisotropy = aniso;
    tex.needsUpdate = true;
  }

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
  moorings = await step(86, 'Mooring the fleet…', () => buildMoorings(scene, town));

  await step(90, 'Flooding the bay…', () => {
    configureWaves(state.wind.from, state.wind.speed);
    ocean = new Ocean(renderer, { waterNormal, foam: foamTex, noise: noiseTex, terrain });
    scene.add(ocean.mesh);
    wake = new Wake(renderer, { size: 512, region: 320 });
    rivalWake = new Wake(renderer, { size: 256, region: 260 });
    powerWake = new Wake(renderer, { size: 384, region: 420 });
    // the probe covers ground fast enough that its window has to be huge
    dropWake = new Wake(renderer, { size: 384, region: 1400 });
  });

  await step(96, 'Rigging the boat…', () => {
    boat = new Boat(scene, { livery: LIVERIES.player, name: 'Leeward' });
    // The rival starts to leeward on the line, which is the honest place for
    // a boat you are supposed to be able to beat.
    rival = new Boat(scene, {
      livery: LIVERIES.rival, name: 'Mistral',
      position: new THREE.Vector3(-26, 0, 292), heading: Math.PI, efficiency: 0.965,
    });
    for (const b of [boat, rival]) b.setAnisotropy(aniso);
    buildCourse();
    skipper = new Skipper(rival, state.marks, { tack: -1 });

    // Kingfisher lies alongside the jetty head, bow pointing out to sea, which
    // is both where you would actually leave her and a reason to sail in.
    const end = town.jettyEnd || new THREE.Vector2(0, 60);
    const dir = town.jettyDir || new THREE.Vector2(0, 1);
    mooring.heading = Math.atan2(dir.x, dir.y);
    mooring.pos.set(end.x + dir.y * 5.6, 0, end.y - dir.x * 5.6);
    power = new Powerboat(scene, { position: mooring.pos, heading: mooring.heading });

    droplet = new Droplet(scene);
    droplet.setNoise(noiseTex);
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
    // 12 m, not the 5.5 a buoy would technically float in: a mark laid on the
    // edge of the shelf is one no boat can round without touching bottom
    const p = pushToDeepWater(x, z, 12);
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

/**
 * Distance still to sail, following the marks. Comparing this between the two
 * boats is the only honest way to say who is winning: raw separation would
 * call a boat ahead when she is merely further up the wrong leg.
 */
function courseRemaining(markIndex, pos) {
  if (markIndex >= state.marks.length) return 0;
  let d = Math.hypot(state.marks[markIndex].pos.x - pos.x, state.marks[markIndex].pos.y - pos.z);
  for (let i = markIndex; i < state.marks.length - 1; i++) {
    d += state.marks[i].pos.distanceTo(state.marks[i + 1].pos);
  }
  return d;
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const qBoat = new THREE.Quaternion();
const qYaw = new THREE.Quaternion();
const qPitch = new THREE.Quaternion();
const eBoat = new THREE.Euler(0, 0, 0, 'YXZ');
const camAim = new THREE.Vector3(0, 3, 280);
const flyAnchor = new THREE.Vector3();
const tmp = new THREE.Vector3();
const heading2 = new THREE.Vector2();
let flyValid = false;

/** Whichever helm you are standing at. */
function helmed() {
  return state.vessel === 'power' ? power : state.vessel === 'drop' ? droplet : boat;
}

export const VIEWS = ['helm', 'orbit', 'flyby'];
const VIEW_NAMES = { helm: 'At the helm', orbit: 'Orbit — drag to swing, wheel to zoom', flyby: 'Fly-by' };

function updateCamera(dt) {
  const v = helmed();
  v.root.updateMatrixWorld(true);
  camera.up.set(0, 1, 0);

  // the point every external view looks at: the middle of the thing, not a
  // mast height above it
  const aimY = v.position.y + (v.chaseAim ?? 3.4);
  camAim.lerp(tmp.set(v.position.x, aimY, v.position.z), 1 - Math.exp(-dt * 14));

  if (state.view === 'orbit') {
    // Placed, not chased. The old camera lerped toward a moving offset in
    // world space, which is fine at six knots and hopeless at two hundred and
    // eighty — it simply never caught up. Anchoring the offset to the vessel
    // means it cannot fall behind at any speed, and the only smoothing left is
    // on the aim point.
    const a = v.heading + Math.PI + input.lookYaw;
    const p = clamp(input.lookPitch + 0.16, -1.15, 1.30);
    const d = state.orbitDist;
    const flat = Math.cos(p) * d;
    camera.position.set(
      camAim.x + Math.sin(a) * flat,
      Math.max(camAim.y + Math.sin(p) * d, sampleSeaY(v) + 0.6),
      camAim.z + Math.cos(a) * flat
    );
    camera.lookAt(camAim);
    return;
  }

  if (state.view === 'flyby') {
    // A fixed point in the world that the vessel goes past, re-anchored ahead
    // of it whenever it gets away. Nothing else shows you three hundred knots
    // for what it is.
    const away = flyAnchor.distanceTo(v.position);
    if (!flyValid || away > 260 || away < 12) {
      const lead = Math.max(45, Math.min(210, v.speed * 1.6));
      const side = (Math.random() < 0.5 ? 1 : -1) * (18 + Math.random() * 40);
      flyAnchor.set(
        v.position.x + Math.sin(v.heading) * lead + Math.cos(v.heading) * side,
        Math.max(2.5, v.position.y + 1.5 + Math.random() * 14),
        v.position.z + Math.cos(v.heading) * lead - Math.sin(v.heading) * side
      );
      flyValid = true;
    }
    camera.position.copy(flyAnchor);
    camera.lookAt(camAim);
    return;
  }

  v.helm.getWorldPosition(camera.position);
  // The camera looks down its own -Z, the boat sails along +Z, so the base
  // orientation is the hull turned through half a circle. Conjugating by that
  // half turn is what flips the signs on pitch and roll here.
  // A helmsman braces against the heel: the horizon tips, but less than the deck.
  eBoat.set(-v.pitch * 0.55, v.heading + Math.PI, (v.heel + v.waveRoll) * 0.52);
  qBoat.setFromEuler(eBoat);
  qYaw.setFromAxisAngle(UP, input.lookYaw);
  qPitch.setFromAxisAngle(RIGHT, input.lookPitch);
  camera.quaternion.copy(qBoat).multiply(qYaw).multiply(qPitch);
}

const _seaProbe = { y: 0, normal: new THREE.Vector3(), fold: 1 };
function sampleSeaY(v) {
  sampleOcean(v.position.x, v.position.z, state.time, _seaProbe);
  return _seaProbe.y;
}

function setView(next, quiet = false) {
  state.view = next;
  flyValid = false;
  if (next === 'orbit') {
    // Open on a quarter view rather than dead astern. Astern of a boat is her
    // transom and astern of the probe is a point aimed at your eye; three
    // quarters is where either of them actually has a profile.
    input.lookYaw = 0.62;
    input.lookPitch = 0.05;
    state.orbitDist = state.vessel === 'drop' ? 9 : state.vessel === 'power' ? 14 : 20;
  } else if (next === 'helm') {
    input.lookYaw = 0;
    input.lookPitch = -0.03;
  }
  if (!quiet) hud.toast(VIEW_NAMES[next]);
}

// ---------------------------------------------------------------------------

/**
 * Quality tiers. The expensive things here are the two auxiliary scene renders
 * the water needs and the water's own fragment shader, so that is what the
 * tiers turn down first.
 */
const TIERS = {
  ultra:  { name: 'Ultra',  reflScale: 0.85, cloudRefl: 1, msaa: 4, shadow: 4096, shadowEvery: 1, bloom: true,  planar: 1.0, maxScale: 1.00, foam: 1.0, detail: 1.15, micro: 1 },
  high:   { name: 'High',   reflScale: 0.68, cloudRefl: 1, msaa: 4, shadow: 3072, shadowEvery: 1, bloom: true,  planar: 1.0, maxScale: 1.00, foam: 1.0, detail: 1.00, micro: 1 },
  medium: { name: 'Medium', reflScale: 0.44, cloudRefl: 0, msaa: 2, shadow: 1024, shadowEvery: 3, bloom: true,  planar: 1.0, maxScale: 0.85, foam: 1.0, detail: 0.90, micro: 0 },
  low:    { name: 'Fast',   reflScale: 0.00, cloudRefl: 0, msaa: 0, shadow: 1024, shadowEvery: 5, bloom: false, planar: 0.0, maxScale: 0.70, foam: 0.9, detail: 0.75, micro: 0 },
};
const TIER_ORDER = ['ultra', 'high', 'medium', 'low'];

const perf = {
  tier: 'high',
  scale: 1.0,          // dynamic resolution multiplier on top of the tier cap
  basePixelRatio: Math.min(devicePixelRatio || 1, 2),
  frameMs: 16.7,
  adjustTimer: 0,
  demoted: false,      // once the tuner has had to give ground, it stops climbing
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
  ocean.uniforms.uDetailStrength.value = t.detail;
  ocean.uniforms.uMicroDetail.value = t.micro;
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
    perf.demoted = true;
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
  } else if (i > 0 && !perf.demoted && perf.frameMs < 9.5 && perf.scale >= tier.maxScale) {
    // Room to spare and nothing has ever had to be given back — climb. The
    // demoted latch is what stops this becoming an oscillator on a machine
    // that sits right on the boundary.
    applyTier(TIER_ORDER[i - 1]);
    hud.toast(`Quality: ${TIERS[perf.tier].name}`, 1.8);
  }
}

const _focus = new THREE.Vector3();
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
    setView(VIEWS[(VIEWS.indexOf(state.view) + 1) % VIEWS.length]);
  }
  const z = input.takeZoom();
  if (z && state.view === 'orbit') {
    state.orbitDist = clamp(state.orbitDist * Math.pow(1.16, z), 3.5, 400);
  }
  if (input.tapped('KeyT') && state.vessel === 'sail') {
    boat.autoTrim = !boat.autoTrim;
    hud.toast(boat.autoTrim ? 'Auto trim on' : 'Manual sheet — W / S');
  }
  if (input.tapped('KeyV')) boardNearest();
  if (input.tapped('KeyG')) summonDroplet();
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
    restart(boat, 0, 280);
    restart(rival, -26, 292);
    skipper.mark = 0; skipper.finished = false; skipper.finishTime = null;
    skipper.tack = -1; skipper.sinceTack = 99;
    state.currentMark = 0; state.raceStart = null; state.raceTime = 0; state.finished = false;
    state.vessel = 'sail';
    power.position.copy(mooring.pos);
    power.heading = mooring.heading;
    power.surge = 0; power.sway = 0; power.yawRate = 0; power.roll = 0; power.rollRate = 0;
    power.throttle = 0; power.steer = 0; power.battery = 1; power.moored = true;
    droplet.active = false; droplet.arriving = 0; droplet.surge = 0;
    droplet.shock.strength = 0; droplet.altitude = 8;
    hud.toast('Back to the start');
  }
}

function restart(b, x, z) {
  b.position.set(x, 0, z);
  b.heading = Math.PI;
  b.surge = 0; b.sway = 0; b.yawRate = 0; b.heel = 0; b.heelRate = 0; b.rudder = 0;
}

/**
 * Step across to whichever craft is alongside. Deliberately not a teleport:
 * Kingfisher lies at the jetty, so getting to her is a short sail into the bay
 * rather than a keystroke.
 */
const BOARDING_RANGE = 45;
const VESSELS = {
  sail: { get it() { return boat; }, hint: () => `${boat.name} — 回到舵柄` },
  power: { get it() { return power; }, hint: () => `${power.name} — W / S 油门 · A / D 转向` },
  drop: { get it() { return droplet; }, hint: () => '水滴 — W / S 推进 · A / D 转向 · Q / E 升降 · Space 急停' },
};

function boardNearest() {
  const here = state.vessel;
  const from = helmed();
  let best = null, bestD = Infinity;
  for (const key of Object.keys(VESSELS)) {
    if (key === here) continue;
    const v = VESSELS[key].it;
    if (key === 'drop' && !v.active) continue;      // it is not here yet
    const d = Math.hypot(from.position.x - v.position.x, from.position.z - v.position.z);
    if (d < bestD) { bestD = d; best = key; }
  }
  if (!best) return;
  if (bestD > BOARDING_RANGE) {
    const to = VESSELS[best].it;
    hud.toast(`${to.name} 在 ${Math.round(bestD)} m 外 · ${to.name} is ${Math.round(bestD)} m off`, 3.2);
    return;
  }
  state.vessel = best;
  // there is nothing to look at from inside the probe, so it opens on the
  // outside view; the boats have decks worth standing on
  setView(best === 'drop' ? 'orbit' : 'helm', true);
  hud.toast(VESSELS[best].hint());
}

/** Call it down. It arrives the only way it knows how. */
function summonDroplet() {
  if (droplet.active && state.vessel !== 'drop') {
    droplet.active = false;
    hud.toast('水滴离开了 · the probe withdraws');
    return;
  }
  if (droplet.active) { hud.toast('已经在船上了'); return; }
  const from = helmed();
  droplet.summon(from.position, from.heading);
  hud.toast('有东西正在减速 · something is decelerating', 4.5);
}

/** The helm of a boat nobody is standing at. */
const UNATTENDED = { rudder: 0, trim: 0, neutral: false };

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
    boat.updateVisual(dt, state.time);
    rival.updateVisual(dt, state.time);
    power.updateVisual(dt, state.time);
    droplet.cacheSea(state.time);
    droplet.updateVisual(dt, state.time);
    updateCourse(dt);
    updateCamera(dt);
    birds(state.time);
    moorings(state.time);
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

  const atSail = state.vessel === 'sail';
  const atDrop = state.vessel === 'drop';
  if (atSail && input.trim !== 0) boat.autoTrim = false;

  // Fixed substeps: the rig, the heel spring and the rudder all need a short
  // timestep to stay stable, but clamping the frame delta instead would put
  // the whole boat into slow motion on a slow machine.
  const steps = Math.min(10, Math.max(1, Math.ceil(dt / 0.020)));
  const sub = dt / steps;
  let rig;
  const helm = skipper.update(dt, state.wind, t, boat);
  // An unattended yacht is not a parked car: she keeps sailing with the helm
  // centred, which means she will round up and lie luffing soon enough.
  const sailInput = atSail ? input : UNATTENDED;
  for (let i = 0; i < steps; i++) {
    const st = t - dt + sub * (i + 1);
    rig = boat.update(sub, sailInput, state.wind, st);
    rival.update(sub, helm, state.wind, st);
    power.update(sub, state.vessel === 'power' ? input : null, st);
    droplet.update(sub, atDrop ? input : null, st);
  }

  // Sails, buoyancy and pose are per-frame work: rebuilding them once per
  // substep is ten times the cost for an image nobody sees.
  boat.updateVisual(dt, t);
  rival.updateVisual(dt, t);
  power.updateVisual(dt, t);
  droplet.cacheSea(t);
  droplet.updateVisual(dt, t);
  droplet.writeOceanUniforms(ocean.uniforms.uDroplet, ocean.uniforms.uDropTrail,
    ocean.uniforms.uShock);

  heading2.set(Math.sin(boat.heading), Math.cos(boat.heading));
  wake.update(dt, boat.position, heading2, Math.abs(boat.surge), 9.5);
  heading2.set(Math.sin(rival.heading), Math.cos(rival.heading));
  rivalWake.update(dt, rival.position, heading2, Math.abs(rival.surge), 9.5);
  // The powerboat's buffer only runs while there is something in it to see —
  // she spends most of the game tied up, and a wake nobody made costs a
  // render target switch every frame.
  powerWakeIdle = power.speed > 0.25 ? 0 : powerWakeIdle + dt;
  const powerTrail = powerWakeIdle < 30;
  if (powerTrail) {
    heading2.set(Math.sin(power.heading), Math.cos(power.heading));
    powerWake.update(dt, power.position, heading2, power.speed * 1.35, 7.0);
  }

  // The probe tears the surface open rather than parting it, so what it leaves
  // is a gash the width of the dish it is dragging, not a Kelvin wake — hence
  // the absurd hull length handed to the stamp.
  const dropWorking = droplet.active && droplet.arriving <= 0 &&
                      droplet.altitude < 26 && droplet.speed > 1.0;
  dropWakeIdle = dropWorking ? 0 : dropWakeIdle + dt;
  const dropTrail = dropWakeIdle < 26;
  if (dropTrail) {
    heading2.set(Math.sin(droplet.heading), Math.cos(droplet.heading));
    dropWake.update(dt, droplet.position, heading2,
      dropWorking ? 6.0 : 0, 26 - droplet.altitude * 0.5);
  }

  updateCourse(dt);
  updateCamera(dt);
  birds(t);
  moorings(t);

  renderScene(dt, t, powerTrail, dropTrail);

  if (atDrop) hud.updateDroplet({ droplet, time: t });
  else if (atSail) {
    hud.update({ boat, wind: state.wind, boomAngle: rig.boomAngle * rig.tackSign, tackSign: rig.tackSign, time: t });
  } else {
    hud.updatePower({ power, wind: state.wind, time: t });
  }
  hud.el.mark.textContent = state.finished ? 'Complete' : state.marks[state.currentMark].name;
  hud.el.timer.textContent = state.raceStart === null ? '--:--' : fmtTime(state.raceTime);
  hud.updateRival(courseRemaining(state.currentMark, boat.position), skipper.remaining(),
    state.finished, skipper.finished);

  fpsAcc += rawMs / 1000; fpsCount++;
  if (fpsAcc > 0.5) {
    const fps = Math.round(fpsCount / fpsAcc);
    hud.el.fps.textContent = `${fps} fps · ${TIERS[perf.tier].name.toLowerCase()} · ${Math.round(perf.scale * 100)}%`;
    fpsAcc = 0; fpsCount = 0;
  }
}

function renderScene(dt, t, powerTrail = false, dropTrail = false) {
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
  // the shadow frustum follows you along the water, not up into the sky with
  // the probe — nothing at 900 m needs a shadow map
  if (boat) {
    const h = helmed().position;
    sky.setShadowFocus(_focus.set(h.x, 0, h.z));
  } else {
    sky.setShadowFocus(_focus.set(0, 0, 0));
  }
  sky.dome.position.copy(camera.position);

  ocean.update(camera, [wake, rivalWake, powerTrail ? powerWake : null,
    dropTrail ? dropWake : null]);
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
  get rival() { return rival; }, get skipper() { return skipper; }, get input() { return input; },
  get power() { return power; }, get town() { return town; }, get droplet() { return droplet; },
  get sky() { return sky; }, get post() { return post; }, state, perf, TIERS,
  setTier: (n) => applyTier(n), THREE };

boot();
