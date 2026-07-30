# Leeward

A first-person sailing game. You stand at the tiller of a 9.5 metre sloop in a
bay with a whitewashed town stacked up the hillside, and you sail — properly,
against apparent wind, unable to point closer than about 40° to the breeze.

Everything is generated at load time. There are no textures, no models and no
assets on disk: the sea, the sky, the island, the town and the boat are all
built from code in about two seconds.

```bash
npm start          # or: node server.mjs
# open http://localhost:8080

npm run bundle     # -> dist/leeward.html, one self-contained file
```

ES modules need a real origin, so the page must be served over HTTP —
double-clicking `index.html` will not work. `python3 -m http.server 8080` does
the job just as well. three.js is vendored into `vendor/`, so nothing is
fetched from the network and the game runs offline.

Needs a WebGL2 browser. Click the canvas to capture the mouse.

## Controls

| Key | |
|---|---|
| `A` / `D` | steer (hold `Shift` for hard over) |
| `W` / `S` | sheet in / ease the mainsail |
| `Space` | centre the rudder |
| `T` | auto-trim on/off |
| `C` | helm view / chase camera |
| `[` `]` | move the sun |
| `-` `=` | wind strength |
| `H` | hide the key list · `F` quality tier · `R` restart |
| mouse | look around (drag if pointer lock is unavailable) |
| touch | hold bottom-left / bottom-right to steer, drag to look |

Round the five orange marks in order. The clock starts at the first one.

## How it sails

Forces are computed from **apparent** wind — true wind minus the boat's own
velocity — which is what makes sailing feel like sailing:

- Head up too far and the angle of attack collapses, the sails flog, and you
  stop. Get properly in irons and you will have to bear away to escape.
- On a reach the apparent wind draws forward as you accelerate, so the sails
  need sheeting in as speed builds.
- Lift and drag come from one flat-plate model, so beating is lift-driven and
  running is drag-driven without any special-casing.
- Heeling is the sail's side force acting through the centre of effort against
  the righting moment, and the heel feeds back as weather helm.
- A soft wall at hull speed (1.34·√LWL ≈ 7 knots) keeps her honest.

Run aground and she stops and shoves off the shelf.

## How it looks

**Sea.** A radial grid pinned to the camera — metre-scale detail underfoot,
kilometres of coverage at the horizon, from one mesh that never rebuilds. Nine
Gerstner components with correct deep-water dispersion (ω = √(gk)), so long
swell rolls through slowly while short chop scuttles across it. Waves feel the
bottom near the beach: they slow, steepen, grow, and collapse into surf.

Shading is Fresnel-weighted reflection over refraction. The reflection is a
planar mirror pass blended against the analytic sky, with the wave normal
displacing the sample hard enough that a tilted wave face at a grazing angle
swings off the shoreline and into open sky — which is what breaks a distant
reflection into glitter instead of leaving a mirror. Refraction comes from a
depth prepass and is absorbed through Beer–Lambert extinction, so shallow water
over sand goes turquoise and deep water goes blue for the right reason. On top
of that: GGX sun glitter, subsurface scattering through backlit wave crests,
and four sources of foam — wave-crest folding from the Jacobian, breaking surf
from the shoaling term, a wash-line at the beach, and a persistent boat wake.

**Sky.** A Rayleigh + Mie scattering integral, evaluated once into a small
lookup table indexed by (angle to sun, view elevation). For a fixed sun that
pair determines the view direction exactly — the sky is symmetric about the
sun's meridian — so the table is exact, not an approximation, and cheap enough
that the ocean, the terrain, the town and the boat can all ask "what colour is
the sky in this direction?" per pixel. They share one atmosphere, which is why
the horizon reads as continuous space rather than a plane in front of a
backdrop. Clouds are an animated fbm slab, lit with two shadow taps up-sun, and
they reflect in the water.

**Wake.** A single-channel buffer covering a square of ocean that scrolls with
the boat. Each frame it resamples itself at the new offset, blurs a little,
fades a little, and the hull stamps in fresh turbulence — stern churn plus the
two diverging arms of a Kelvin wake. The trail persists in world space for
about half a minute.

## Performance

Three quality tiers — high, medium, fast — plus dynamic resolution on top. The
tuner watches real frame time and gives back pixels first, because that is the
cheapest thing to give back; only when the resolution hits its floor does the
tier itself step down. `F` cycles the tiers by hand, and the readout in the
corner shows tier and render scale. Software rasterisers (SwiftShader,
llvmpipe) are detected up front and start at the bottom tier, since they will
never win that fight.

What the tiers actually turn off, in order of what it buys:

- **The refraction prepass is skipped in deep water.** It is a whole extra scene
  render, and it only changes the image where you can see the bottom — past
  about 30 m the water has absorbed everything anyway. Out in the bay it simply
  does not run.
- **Trees, rocks and gulls are excluded from the reflection pass** via a render
  layer. They are thousands of instances contributing almost nothing to a
  wave-distorted mirror.
- **The shadow map updates every 2–5 frames.** The sun does not move and the
  town does not walk about; only the boat needs the map to keep up.
- **The environment cube and its PMREM convolution refresh every 6 seconds**
  rather than twice a second. Drifting cloud barely moves ambient light.
- Cloud reflections in the water shader, MSAA sample count, shadow map size and
  the reflection buffer scale all step down with the tier; at the bottom tier
  the planar mirror is dropped entirely and the water reflects the analytic sky
  alone, which still looks like water.

## Layout

```
index.html          markup, HUD, styles
server.mjs          zero-dependency static server
src/
  main.js           bootstrap, frame loop, render order, race course
  waves.js          Gerstner spectrum — evaluated identically on CPU and GPU
  ocean.js          sea mesh, water shader, reflection/refraction passes
  atmosphere.js     scattering LUT, sky dome, clouds, environment map
  terrain.js        analytic island heightfield and its shader
  town.js           houses, harbour, lighthouse, trees, rocks, gulls
  boat.js           hull loft, rig, sails, sailing physics
  wake.js           persistent world-space foam buffer
  post.js           HDR, bloom, ACES, vignette, dither
  materials.js      aerial perspective injected into stock three materials
  noise.js          tiling procedural textures
  hud.js  input.js  utils.js  shared.js
  layers.js         which objects the reflection pass is allowed to skip
build.mjs           bundles everything into one self-contained HTML file
vendor/three/       three.js r180 (MIT), vendored so this runs offline
```

The boat's buoyancy calls the same wave function the vertex shader uses, so the
hull always sits in exactly the water it looks like it is sitting in.

Three scene renders happen per frame — reflection, refraction, then the beauty
pass — which is why the town is baked down into a handful of merged meshes.

`window.__leeward` is exposed for tinkering from the console, and
`__leeward.ocean.uniforms.uDebug.value` (1–8) switches the water shader to show
thickness, refraction, reflection validity, sky reflection, Fresnel, normals,
foam, or the underwater term on its own.
