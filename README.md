# Leeward

A first-person sailing game. You stand at the tiller of a 9.5 metre sloop in a
bay with a whitewashed town stacked up the hillside, and you sail — properly,
against apparent wind, unable to point closer than about 40° to the breeze.
*Mistral*, an AI-skippered rival, races you round the same five marks under the
same physics. *Kingfisher*, an electric dayboat, lies at the jetty if you would
rather have a throttle than an argument with the wind. And press `G`.

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
| `A` / `D` | steer (hold `Shift` for hard over — on the probe, an acute corner) |
| `W` / `S` | sheet in / ease the mainsail — or throttle, in the powerboat |
| `Space` | centre the rudder / back to neutral |
| `V` | step across to whatever is alongside |
| `G` | call the probe down · press again to send it away |
| `Q` / `E` | descend / climb (the probe only) |
| `T` | auto-trim on/off |
| `C` | cycle view: helm · orbit · fly-by |
| wheel | orbit distance |
| `[` `]` | move the sun |
| `-` `=` | wind strength |
| `H` | hide the key list · `F` quality tier · `R` restart |
| mouse | look around (drag if pointer lock is unavailable) |
| touch | hold bottom-left / bottom-right to steer, drag to look |

Round the five orange marks in order. The clock starts at the first one, and the
panel top-left shows how far ahead or astern of *Mistral* you are.

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

## Cameras

Three, cycled on `C`. **Helm** is first person from wherever the eyes belong on
that craft. **Orbit** swings around it on the mouse with the wheel for distance.
**Fly-by** drops a fixed point in the world ahead of you and lets you go past it,
re-anchoring when you get away — which is the only view that shows three hundred
knots for what it is.

The orbit camera is *placed*, not chased. The old one lerped toward a moving
offset in world space, which is fine at six knots and hopeless at two hundred
and eighty: it simply never caught up. Anchoring the offset to the vessel means
it cannot fall behind at any speed, and the only smoothing left is on the point
it aims at. It also opens on a three-quarter view rather than dead astern —
astern of a boat is her transom, and astern of the probe is a point aimed at
your eye.

Boarding the probe puts you straight into orbit, because there is nothing to see
from inside it.

## The probe

Press `G` and something decelerates out of the sky and stops beside you.

It is three and a half metres of strong-interaction material: a teardrop with a
needle at one end and a bulb at the other, absolutely smooth and a perfect
mirror. Nothing else in the scene is a perfect mirror — the sea is only a
partial one, everything else is rough — so it does not sit in the world so much
as quote it back at you.

The shape is one surface of revolution, `r(u) = u^a · √(1 − u²)`. The square
root closes the tail with a vertical tangent, which is what makes that end read
as a round pole rather than a second point; the `u^a` makes the tip approach
zero with zero slope, which is what makes it a needle rather than a cone. `a`
puts the widest section at `√(a/(a+1))` — about three quarters of the way aft,
which is where a falling drop carries it.

The bulb leads and the needle trails, which is how it flies in the book and
also the better silhouette head-on. Rings are spaced on a cosine so they bunch
at both poles, where all the curvature is and where a mirror shows faceting
first.

The mirror is analytic, not a cube map. Every reflected ray goes to one of two
places: up, and it is the same scattering table the sky dome and the ocean use,
so the probe agrees with the horizon behind it exactly; down, and it is the sea,
which is itself mostly a mirror, so what comes back is the sky again,
Fresnel-weighted over the water's own colour. Two lookups, no render targets,
and it is *more* correct at the horizon than a 256-pixel cube would have been.

What comes back is then treated as **metal, not glass**. A true mirror under
this sky is pale blue all over and the eye reads that as a soap bubble. Silver
Fresnel (F0 ≈ 0.97, 0.95, 0.91), reflectivity under one, ten percent of the sky
averaged toward the surface normal for the few degrees of lobe polished steel
actually has, half the chroma pulled out — and then, crucially, a mild power
curve to put the contrast back. Desaturating closes the tonal gap; the curve
reopens it, and without that step the thing reads as matte porcelain rather
than as something machined. What you want is bright where it takes the sky,
genuinely dark where it takes the sea, and a hard horizon line between.

It obeys none of the rest of the physics — no hull speed, no resistance curve,
no inertia worth the name. Three hundred knots held, a hundred and eighty
astern, a full stop inside a single frame, and a heading change through an
acute angle with a turn radius under twenty metres at full speed, which on a
three-metre object is not a turn at all. That is not a shortcut: a thing that
can do those four things is a thing whose momentum is not its own problem, and
the way it moves is the only evidence of that you ever get.

### The corner

The turn is the thing it is famous for, so it is worth being able to check
rather than take on trust. Two ways:

- The **`TURN` field on the HUD** reads the live radius in metres.
- The **trench keeps the record.** Swing the orbit camera round behind you, or
  switch to fly-by, and look at what you left.

Held helm at three hundred knots is a **17 m** radius — five hull lengths, and
*wider than the trench's own half-width of 15 m*. That is the test that matters,
and it fails it: a corner is only a corner if it is sharper than the mark it
leaves, and at 17 m what you get is a hairpin, however tight the number sounds.

**Shift + A/D** is the corner: **2.5 m**, which is 0.7 hull lengths and a sixth
of the trench width. Measured by flying it at a fixed 20 ms step — a 126° change
of heading in **two frames, 0.04 seconds**, with the track showing a clean V and
no arc at all.

Three things make that drivable rather than nauseating:

- It runs off the **raw key**, not the ramped helm. A hundred and fifty
  milliseconds of soft entry is precisely what rounds a kink into an arc.
- The **camera keeps its own heading**, a quarter of a second behind the real
  one. This is the whole trick: the world turn is one frame so the trench takes
  a genuine kink, but the picture swings round at a speed a person can read.
  Snap both and it is unusable; smooth both and it is not a corner any more.
- Ordinary `A`/`D` is untouched, so all the fine aiming still behaves.

The path recorder drops a node on heading change as well as on distance, or a
corner taken in two frames falls between samples and gets chorded straight back
off again.

### Everything else about how it moves

Stopping is not the same problem as starting for something like that, so the
brake is five times the accelerator: `S` kills three hundred knots in about a
sixth of a second and is still something you can steer through, and `Space` is
the absolute version. Let go of everything and it winds down gently rather than
holding — hold to go, release to slow, which is what hands expect and what a
boat's throttle lever deliberately is not.

And it does something while it is doing nothing. Two thin rings and a scatter
of blue points hang in the water astern of the needle, turning slowly and
breathing; they come up when it settles and are gone the instant it moves.
That is the right way round. A thing that accelerates like this is not
straining while it runs — it is straining while it waits.

The sea knows about it. The ocean's vertex shader takes a pressed well and a
raised rim with the normal tilted to match, so it shades as a dish rather than
a painted hole. Standing still that is a dish; moving, it is a trench with the
water held apart along both walls, widening with speed and closing back a
couple of hundred metres astern. Stop dead and a ring runs out across the water
and dies.

The trench is swept along **the track the probe has actually flown**, kept as a
short decaying path history, not along the direction it currently points.
Anchoring it to the heading was wrong in two visible ways: the whole
two-hundred-metre gash swung round with the nose, and it snapped end for end
the moment speed crossed zero. Reversing now simply drives back up a trench
that is already there.

Two details that matter more than they look:

- The walk builds a **distance field** to the track and evaluates the profile
  once, rather than evaluating a profile per segment and taking the maximum.
  Those are not the same thing. The rim of one capsule is a closed stadium
  outline, and with the ring sitting about a segment-length out from the spine,
  unioning them chains the wall into a string of loops instead of two parallel
  lines.
- The waves are **told about it**. Inside the well the surface is being forced
  and cannot carry its own swell through, so the Gerstner amplitude is damped
  there; along the rim the displaced water has to go somewhere, so it is lifted.
  That is one multiply on the gain and it is the difference between a trench cut
  through the sea and a trench painted on top of it.

A bounding circle round the live path lets the vertex shader reject the whole
walk with one dot product, which for a nine-kilometre grid is almost every
vertex — that is what keeps a sixteen-node search affordable per vertex.

And it does something while it is doing nothing: a scatter of faint blue points
hangs in the water astern of the needle, drifting round the axis and winking,
coming up when it settles and gone the instant it moves. There were solid rings
here too and they looked like decals — geometry pretending to be light, which
is what a hard-edged annulus always reads as.

## The powerboat

*Kingfisher* is a 7 metre electric centre-console, moored at the jetty. Sail up
to her and press `V` to step across; `V` again puts you back on the yacht. It is
deliberately not a teleport — getting to her is a short sail into the bay, which
is the only reason the harbour is worth visiting.

She exists to be the opposite of the yacht. No trim, no apparent wind, no no-go
zone: just a throttle. The physics that makes her interesting is the transition
halfway up the rev range. Below about 11 knots she is pushing water aside and
dragging a growing bow wave with her — the resistance hump — and she squats and
noses up as she climbs it. Through it, the hull lifts onto its own bottom, the
wetted area collapses, and drag *falls* while speed rises; she levels off and
goes, to about 28 knots. Turning is thrust vectoring off the outboard rather
than a rudder, so she steers on the throttle and leans **into** a turn, which is
the one thing a keelboat can never do.

The throttle is held rather than set — hold `W` for power, let go and it winds
back to nothing and the hull's own drag brings her down. A real boat's lever
does stay where you leave it, but nobody expects the same key to mean "sheet
in" on one hull and "leave it there" on the next.

The battery is the price: ten minutes flat out, less if you are heavy-handed,
and it trickles back from the panels while she idles. Flat, she limps at a
fifth of thrust rather than leaving you drifting.

The hull is a hard-chine deep-V — deadrise falls from about 52° at the stem to
19° at the transom, and the knuckle where bottom meets topside is not
decoration: it is the edge the water separates from, and it is what makes a
planing boat read as one. She has a real cockpit well rather than furniture on a
lozenge: side decks, an inner liner, bulkheads fore and aft and a self-draining
sole.

## The rival

*Mistral* is steered by the same `{rudder, trim}` interface the keyboard drives,
so she is sailing under your physics, not a scripted path. The interesting part
of racing is that you cannot steer at the mark: the no-go zone forbids it upwind,
and running dead downwind is slower than tacking down. So five times a second
she sweeps a fan of candidate headings and scores each by **velocity made
good** — boatspeed from a rough polar, projected onto the bearing to the mark —
minus two penalties:

- **Corridor.** How far she is off the rhumb line, measured square to the wind.
  The corridor narrows as the mark approaches, which turns a beat into a
  converging zig-zag that arrives on the layline instead of two long legs.
- **Depth.** What the seabed does along that heading, probed out to 190 m. This
  is the term that keeps her off a lee shore; without it she sails the direct
  bearing straight onto the beach. The probes stop at the mark and fade over the
  last 30 m, or a mark laid anywhere near the shelf is one she circles forever.

Beating and gybing angles are not hardcoded — they fall out of the polar. A
cooldown stops her tacking herself to a standstill in a header, and if she does
touch bottom the scoring flips to "get off the shelf" until she is clear. She
sails a lap in about fifteen minutes; she is a little slower than your boat, so
sailing well beats her.

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
and foam from six sources — wave-crest folding from the Jacobian, breaking surf
from the shoaling term, a wash-line at the beach, a persistent wake per hull,
and the probe's dish and shock ring.

**Foam.** Foam is not paint, and treating it as paint is what makes water look
like spilled milk. Two things fix it. First the coverage is *cut* against the
bubble texture rather than faded through it — a `smoothstep` against
`coverage × bubbles` instead of a linear ramp — so the raft tears open at its
edges and has holes in it. Second, colour is a function of how deep the raft is,
not whether it exists: thin foam is aerated *water* and keeps the sea's own
colour and in-scattering, and only where it piles up does it start behaving
like a bright diffuse surface. It never goes fully opaque either, so the water
underneath still shows through the thin parts.

**The rest of the bay.** A working fleet on its moorings behind the harbour
arm, forty-odd pot buoys strung through the shallows, and a stack of rock
standing offshore. Everything that floats rides the same wave function the
player's hull does, so a swell rolling in lifts the whole anchorage in sequence
instead of leaving a row of boats pasted flat on a moving surface. Each hull is
one merged mesh; the buoys are a single instanced draw on the prop layer, since
forty of them are worth almost nothing individually and nothing at all in a
wave-distorted mirror.

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
about half a minute. There are four buffers — the yacht, the rival, the
powerboat and the probe — and each only runs while there is something in it to
see, since most of them spend most of the game tied up or not here yet.

**A note on handedness.** Forward is +Z and up is +Y, so forward × up lands on
−X: the boats' local +X points to *port*, not starboard. The force
decomposition is written in that basis and is self-consistent in it, so the
physics is right and only the name is wrong. Every place a real side has to be
named or steered toward — the helm, the HUD's tack and heel labels, the dial,
the navigation lights — flips the sign at that point, with a comment saying why.

## Performance

Four quality tiers — ultra, high, medium, fast — plus dynamic resolution on top.
The tuner watches real frame time and gives back pixels first, because that is
the cheapest thing to give back; only when the resolution hits its floor does the
tier itself step down. It will also climb *up* to Ultra on a machine with
headroom, but only if it has never had to give ground — one latch, so a machine
sitting on the boundary does not turn into an oscillator. `F` cycles the tiers by
hand, and the readout in the corner shows tier and render scale. Software
rasterisers (SwiftShader, llvmpipe) are detected up front and start at the bottom
tier, since they will never win that fight.

Ultra is 85% reflection buffer, a 4096² shadow map refreshed every frame, MSAA
4×, a fifth band of capillary detail normals on the water inside 26 m, and
anisotropic filtering on every repeating texture — the last of which matters
because all of them are read at grazing angles across a receding surface, which
is exactly the case trilinear filtering blurs into mush.

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
- **Each boat is three draw calls, not forty.** Everything on deck that never
  moves relative to the hull is baked into three merged meshes split by finish —
  glossy paint, matte joinery, bright metal — with the paint carried in vertex
  colours. Only the boom, tiller, rudder, two sails and the running rigging stay
  separate, because they move.
- **Sails, buoyancy and pose are rebuilt once a frame, not once a substep.** The
  physics runs in fixed 20 ms steps so a slow frame cannot put the boat into slow
  motion; rebuilding two cambered sails ten times for one drawn image was work
  nobody ever looked at.
- Cloud reflections in the water shader, MSAA sample count, shadow map size, the
  fifth detail normal band and the reflection buffer scale all step down with the
  tier; at the bottom tier the planar mirror is dropped entirely and the water
  reflects the analytic sky alone, which still looks like water.

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
  boat.js           hull loft, deck gear, rig, sails, sailing physics
  powerboat.js      hard-chine deep-V, planing physics, battery
  droplet.js        the probe: teardrop of revolution, analytic steel
  moorings.js       the moored fleet, pot buoys, the offshore stack
  skipper.js        the rival's helmsman — VMG planner over candidate courses
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
pass — which is why the town, and now each boat, is baked down into a handful of
merged meshes.

The hull is lofted from station curves rather than assembled from primitives:
half-beam, canoe-body depth and sheer height are functions of position along the
waterline, and the topsides lean outboard forward (flare, which throws spray
clear) and inboard aft (tumblehome, which stops a wide stern looking like a
box). The paint reads off distance *below the sheer*, not absolute height, so
the cove stripe follows the sheer spring instead of cutting across it.

`window.__leeward` is exposed for tinkering from the console, and
`__leeward.ocean.uniforms.uDebug.value` (1–8) switches the water shader to show
thickness, refraction, reflection validity, sky reflection, Fresnel, normals,
foam, or the underwater term on its own.
