# Frontier Electric Traction Machine Benchmarks, 2023–2026

Compiled 2026-08-15. All figures traced to the Sources list at the end.

**Notation**
- `(claim)` — vendor/press marketing figure, no independent dyno verification found.
- `(dyno)` — vendor-published dynamometer/measured data (datasheet test tables).
- `†` — derived by this document (arithmetic on the two cited figures), not published as such.
- `?` — value not found in any source consulted.
- Peak-rating **duration** is almost universally undisclosed. Where a source does not state it, the cell reads `n/s` (not stated). Treat every peak number without a duration as unbounded-uncertainty.

**Scope caveat that governs the whole table:** vendors mix three different mass bases — (a) bare e-machine, (b) e-machine + inverter, (c) full e-axle (machine + inverter + gearbox + differential + housing). The `Mass basis` column records which. Cross-comparing kW/kg across different bases is invalid.

---

## 1. Master comparison table

### 1a. Axial-flux and hybrid ("raxial") machines

| Machine | Topology | Peak kW | Peak duration | Cont. kW | Peak Nm | Cont. Nm | Max rpm | Mass kg | Mass basis | kW/kg | Nm/kg | Peak eff % | DC bus V | Cooling | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| YASA 750R | Axial, YASA yokeless segmented armature, dual-rotor SPM | 200 @700 Vdc (100 @400 Vdc) | n/s | 70 @3000 rpm, 40 °C coolant | 790 @450 A_rms | 400 | 3250 | 37 | machine only | 5.41† | 21.4† | >95 | 400–700 | liquid jacket (40 °C ref.) | dyno (datasheet) |
| YASA P400 R | Axial, YASA, dual-rotor SPM | 160 @700 Vdc | n/s | 20–100 | 370 | up to 200 | 8000 | from 24 | machine only | 6.67† | 15.4† | 96 | up to 700 | liquid | dyno (datasheet) |
| YASA 2025 record prototype | Axial, YASA | 750 | "short-term peak", n/s | est. 350–400 | ? | ? | ? | 12.7 | machine only (stated) | 59.1 | ? | ? | ? | ? | claim (vendor test, unofficial record) |
| YASA 2025 prior record (summer) | Axial, YASA | 550 | n/s | ? | ? | ? | ? | 13.1 | machine only | 42.0 | ? | ? | ? | ? | claim |
| Mercedes-AMG / YASA production (AMG.EA) | Axial, YASA | 1000 kW system (3 units, Concept AMG GT XX) | n/s | ? | ? | ? | ? | ? | — | ? | ? | ? | ? | ? | claim; SOP at AMG 2026, built Berlin-Marienfelde |
| Evolito D250 | Axial, YASA-derived (Oxford YASA lineage) | 240 | n/s | one variant "90 % of peak" | ~208† (16 Nm/kg × 13 kg) | ? | ? | 13 | machine only | 18.5 | ~16 | ? | ? | dielectric liquid between edge coils | claim |
| Evolito D250 (high-cont. variant) | Axial | ? | — | cont. density 25 kW/kg stated — inconsistent with 18.5 kW/kg peak on same page; treat as different build | ? | ? | ? | ? | — | 25 (cont.) | ? | ? | ? | ? | claim, internally inconsistent |
| Evolito D500 | Axial | 12 kW/kg stated ⇒ ~240† | n/s | 125 | 500 | ? | 2500 | 20 | machine only | 6.25† (at 125 kW) / 12 (claimed peak) | 25† | ? | ? | liquid | claim |
| Evolito D1500 1×3 | Axial | 140 | n/s | ? | 1350 | ? | 2500 | 38.5 | machine only | 3.64† | 35.1† | ? | ? | liquid | claim |
| Evolito D1500 2×3 | Axial | 285 | n/s | ? | 1500 @1800 rpm | ? | 2500 | ~40 | machine only | 7.13† | 37.5† | ? | ? | liquid | claim |
| Koenigsegg Quark | "Raxial" (radial+axial hybrid), Aircore hollow-CF rotor, 300M steel | 250 (335 hp) | n/s | ? | 600 | ? | 9000 | 28.5 (some sources "<30") | machine only, 8 L | 8.77† (vendor states 8.3) | 21.1† | ? | 850 nominal | direct cooling | claim |
| Koenigsegg Dark Matter | "Raxial", 6-phase | ~596 (800 hp) | n/s | ? | 1250 | ? | 8500 | 39 | machine only; 383.3 × 381.5 × 135.5 mm | 15.3† | 32.1† | ? | ? | direct | claim ("world's most powerful automotive e-motor") |
| EMRAX 188 | Axial, dual-rotor SPM, iron-cored stator | 60 | n/s (datasheet peak is time-limited) | ? | 100 | ? | ? | ~7 | machine only | ~8.6† | ~14† | up to 98 (claim); >95 typ. | 100–800 by variant | air / liquid / combined | dyno (datasheet) |
| EMRAX 208 | Axial, dual-rotor SPM | 86 | n/s | ? | 150 | ? | ? | ? | machine only | ? | ? | up to 98 (claim) | variant | air / liquid / combined | dyno |
| EMRAX 228 | Axial, dual-rotor SPM | 124 | n/s | ? | 220 | ? | ? | 12 | machine only | 10.3† | 18.3† | up to 98 (claim) | variant | air / liquid / combined | dyno |
| EMRAX 268 | Axial, dual-rotor SPM | 210 | n/s | 117 | 500 | ? | ? | 21.4–22.3 | machine only | 9.8† | 23.4† | up to 98 (claim) | variant | air / water / combined | dyno |
| EMRAX 348 | Axial, dual-rotor SPM | 340 (420 "boost") | n/s | 145 | 1000 @4500 rpm | ? | ? | 43.1–43.9 (vendor also cites 42) | machine only; Ø348 × 112 mm | 7.9† at 340 kW; 10 claimed at boost | 23.2† | up to 98 (claim) | variant | air / water / combined | dyno + claim |
| Magnax AXF290 (now Traxial) | Axial, yokeless, grain-oriented steel | ~325† (13 kW/kg × 25 kg) | n/s | ? | ? | ? | ? | 25 | machine only | 13 anticipated; 15 peak / 7.5 nominal claimed | ? | 98 claimed | ? | ? | claim (prototype) |
| PanGood Power (with CAS Ningbo NIMTE) | Axial | ? — not disclosed | n/s | ? | ? | ? | >18 000 | not disclosed | **not disclosed** | 25.73 "effective" | 293 Nm/kg stated — implausible for a machine-level figure, definition undisclosed | ? | ? | ? | claim; research platform, not the commercially supplied product; rated output, peak output, system mass and inclusion boundary all undisclosed |
| Whylot (Renault, 21 % stake) | Axial | ? | — | ? | ? | ? | ? | ? | — | ? | ? | ? | ? | ? | no public hard specs; Renault claims −2.5 g/km CO₂ WLTP, large-scale hybrid production from 2025 |
| Saietta / Turntide AFT 140 | Axial, in-wheel/mid-drive | ? | — | ? | up to 140 | ? | ? | ? | — | ? | ? | ? | ? | liquid (first liquid-cooled Saietta in production) | claim |
| Traxial (ex-Magnax) | Axial, yokeless, double-rotor single-stator | up to 15 kW/kg claimed | — | ? | "up to 3× torque density, 2× power density vs existing EV motors" | ? | ? | ? | — | up to 15 | ? | ? | ? | patented stator + uniform-winding-temperature cooling | claim |
| Ricardo axial flux | — | ? | — | ? | ? | ? | ? | ? | — | ? | ? | ? | ? | ? | no public specs found |

### 1b. Radial-flux machines and e-axles

| Machine | Topology | Peak kW | Peak duration | Cont. kW | Peak Nm | Max rpm | Mass kg | Mass basis | kW/kg | Nm/kg | Peak eff % | DC bus V | Cooling | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tesla Model S Plaid, rear unit | Radial IPM/SynRM, carbon-fibre-sleeved rotor (Tesla-built winding machine, high-tension wrap) | ~250 per motor (3 motors, 760 kW / 1020 hp system, battery-limited) | n/s | ? | ? | 20 000 @200 mph | ? (6.22 kW/kg cited third-hand by Xiaomi) | machine only | 6.22 (claim, via Xiaomi comparison) | ? | ? | ~400 | oil | mixed claim |
| Tesla 3D1 | Radial IPM-SynRM | 202 | n/s | ? | 404 | ~18 000 | ~80 (drive unit) | e-axle | 2.53† | 5.05† | ? | ~400 | oil (rotor jet-oil + stator) | third-party teardown |
| Tesla 3D6 | Radial IPM-SynRM | 220 | n/s | ? | 440 | ~18 000 | ~80 (drive unit) | e-axle | 2.75† | 5.5† | ? | ~400 | oil | third-party teardown |
| Lucid Air production drive unit | Radial, continuous-wave winding, microjet oil | 500 (670 hp) | n/s | ? | ? | ? | 74 | e-axle: motor + inverter + gearbox + diff | 6.76† (vendor: 9.0 hp/kg) | ? | ? | ~900 (Air pack) | microjet oil | claim (vendor) |
| Lucid motorsports drive unit (Formula E Gen3) | Radial, same CW winding + microjet oil | 350 (469 hp) | n/s | ? | ? | 19 500 rotor | 32 | motor + inverter + diff + transmission | 10.9† (vendor: 14.7 hp/kg) | ? | ? | ? | microjet oil | claim (vendor) |
| Porsche Taycan Turbo S, rear | Radial PSM, hairpin winding (~70 % copper fill vs ~45 % round-wire) | 335 | n/s (Taycan overboost is 2.5 s launch control) | ? | 550 | 16 000 | 170 | drive unit incl. 2-speed transmission | 1.97† (Xiaomi cites 5.29 for Taycan Turbo motor only) | 3.24† | ? | 800 | water jacket + oil | mixed |
| Rimac Nevera, rear motor (×2) | Radial SPM, carbon-sleeve rotor | 480 each | n/s | ? | 900 each | ? | ? | machine only | ? | ? | ? | ~730 | oil | claim |
| Rimac Nevera, front motor (×2) | Radial SPM, carbon-sleeve rotor | 220 each | n/s | ? | 280 each | ? | ? | machine only | ? | ? | ? | ~730 | oil | claim |
| Rimac Nevera system | 4 independent motors | 1408 (1888 hp) | n/s | ? | 2360 | ? | 2300 (vehicle) | — | — | — | ? | ~730 | oil | claim |
| Nidec Ni200Ex (E-Axle) | Radial, integrated 3-in-1 | 200 | n/s | ? | 384 | ? | 95 | e-axle | 2.11† | 4.04† | ? | ? | oil (proprietary oil-cooling structure) | vendor spec |
| Nidec Ni150Ex | Radial, 3-in-1 | 150 | n/s | ? | ? | ? | 87 | e-axle | 1.72† | ? | ? | ? | oil | vendor spec |
| ZF EVSys800 | Radial, ZF "braided winding", SiC inverter, reduction gear | 275 | n/s | 206 (75 % of peak) | 70 Nm/kg → >5000 Nm at axle | ? | 74 | e-axle | 3.72† peak / 2.78† cont. | 70 (axle torque per kg, ZF definition) | ? | 800 | ? | vendor spec |
| BorgWarner iDM220 (400 V) | Radial, hairpin, 220 mm stator OD, off-axis gearbox, Si inverter | >200 (covers 150–250) | n/s | ? | ~4500 at wheel | ? | ? | e-axle | ? | ? | ? | 400 | ? | vendor spec |
| BorgWarner iDM220 (800 V) | Radial, hairpin, SiC | "up to 500" stated; covers 160–300 in application | n/s | ? | up to 5300 at wheel | ? | ? | e-axle | ? | ? | ? | 800 | ? | vendor spec, internally inconsistent |
| BorgWarner iDM146 | Radial, 146 mm stator OD, Si inverter | 135 | n/s | ? | ? | ? | ? | e-axle | ? | ? | ? | 400 | ? | vendor spec |
| Xiaomi HyperEngine V8s | Radial, 960 MPa ultra-high-strength silicon steel rotor laminations | 425 | n/s | ? | 635 | 27 200 | ~41.9† (from 10.15 kW/kg) | machine only (implied) | 10.15 | 15.2† | 98.11 | 800 (SU7 Ultra) | bidirectional full oil cooling, S-shaped circuit, dual-cycle stator circuit (+100 % heat-dissipation area, −20 °C) | claim |
| Xiaomi HyperEngine V6s | Radial | 275 | n/s | ? | ? | 21 000 | ? | machine only | ? | ? | ? | 800 | oil | claim |
| Huawei DriveONE (2026, GAC Toyota Bozhi 7) | Radial, integrated multi-in-one | ? | — | ? | ? | 22 000 | "10 kg lighter" (no absolute) | e-axle | ? | ? | 97.5 motor efficiency | 800 | intelligent oil cooling 2.0 | claim |
| BYD Super e-Platform motor (Mar 2025) | Radial, SiC | 580 (778 hp) rear; 230 (308 hp) front | n/s | ? | ? | 30 511 | ? | machine only | ? | ? | ? | ~1000 | ? | claim |
| BYD e-Platform 3.0, 8-in-1 | Radial, 8-in-1 integration | ? | — | ? | ? | ? | ? | e-axle | ? | ? | 89 % **system** efficiency | 400/800 | ? | claim |

**Highest verified-basis power densities in the set** (machine-only mass, vendor-stated):
59 kW/kg (YASA prototype, claim) > 25.73 (PanGood, claim, undisclosed basis) > 18.5 (Evolito D250, claim) > 15.3† (Dark Matter) > 15 (Traxial/Magnax, claim) > 10.3† (EMRAX 228) > 10.15 (Xiaomi V8s, claim).
On an **e-axle mass basis** the field is far tighter: 6.76† (Lucid Air) > 3.72† (ZF EVSys800) > 2.75† (Tesla 3D6) > 2.11† (Nidec Ni200Ex).

---

## 2. Airgap shear stress and current density — the sizing numbers

Torque scales as `T = σ · A_gap · r`, i.e. torque ∝ (rotor volume enclosed by the airgap) × (airgap shear stress σ). σ itself is the product of the magnetic loading (airgap flux density) and the electric loading (linear current density), so it is **thermally limited, not magnetically limited**, once B_g is at the ~0.9–1.0 T practical ceiling. Every step in the cooling ladder below is a step in permissible electric loading.

### 2a. Airgap shear stress σ by cooling class

| Cooling class | Continuous σ (kPa) | Notes / provenance |
|---|---|---|
| Industrial TEFC (totally-enclosed fan-cooled), radial | ~20 | "commonly possible to achieve an average Maxwell stress tangential component of around 20 kPa in industrial totally-enclosed-fan-cooled motors" — Pyrhönen-lineage figure |
| Axial flux, good air- **or** liquid-cooling | 20–40 continuous; "peaks can be higher briefly" | Directly stated for AFMs. Worked example in the same body of literature: a single-sided AFM producing 100 Nm designed at σ = 20 kPa |
| Water jacket, radial traction | ~30–50 (inferred) | Not directly sourced as a σ range. Inferred by scaling the TEFC 20 kPa by the water-jacket current-density ratio in §2b. **Treat as an estimate.** |
| Direct oil spray / oil jet, radial traction | ~45–75 (inferred) | Direct liquid (oil jet) cooling gives ~1.5× the power density of indirect liquid (water jacket) cooling, or the same torque in a 20–40 % smaller machine — that 1.5× applies directly to σ at fixed speed. Independently, Tesla Model 3 composite oil cooling is reported to raise **continuous torque by 40–50 %** vs an ordinary water-cooled motor, which is the same multiplier. |
| High-speed machines generally | "often trivial, <100 kPa" | Explicit upper bound stated in the high-speed machine cooling review. High-speed machines get power from ω, not σ. |
| Extreme prototypes / short-duration peak | >100 kPa transient | No source consulted publishes a σ figure above 100 kPa. The 59 kW/kg YASA prototype does not disclose torque or airgap area, so σ cannot be back-computed. **The >100 kPa regime is unsubstantiated in the open literature reviewed here.** |

**Sizing rule of thumb this supports:** for a liquid-cooled axial-flux traction machine, design continuous at **25–40 kPa**, and do not assume more than **~2×** that transiently without a thermal-transient model that resolves slot-copper mass and the winding-to-coolant path. The single most load-bearing caveat: the 20–40 kPa AFM band is *continuous*; all the headline kW/kg numbers in §1 are *peak*, and none of them disclose duration.

### 2b. Slot/conductor current density J by cooling method

| Cooling method | Continuous J (A/mm²) | Peak J | Provenance |
|---|---|---|---|
| Natural/forced convection air | 2–4 | n/s | directly stated |
| Conventional machines, general envelope | ~3–12 | n/s | directly stated |
| Water stator jacket (indirect liquid) | 6–14; max allowable slot J with axial water jacket 15.6 | n/s | directly stated |
| Flat/hairpin wire + direct cooling | ~20 achieved | n/s | directly stated |
| Direct oil spray on end-windings / liquid-cooled conductors | ~25 continuous | n/s | directly stated ("machines running 25 A/mm² continuously use liquid-cooled conductors or oil-spray cooling on the end-windings") |
| Novel direct conductor cooling (Fraunhofer IFAM) | up to 51.25 | n/s | directly stated; laboratory |

Note explicitly stated in the source material: values in the 25 A/mm² class "are certainly not possible continuously in ordinary air-cooled machines or even machines cooled with water-jackets."

**Peak J is not published by any source consulted.** The usual design convention (2–3× continuous for tens of seconds, bounded by adiabatic copper heating) is **not** sourced here and is flagged as engineering practice, not citation.

---

## 3. Axial-flux topology tradeoffs

| Topology | Structure | Torque density | Manufacturability | Axial force balance |
|---|---|---|---|---|
| **Single-sided** (1 stator, 1 rotor) | simplest | lowest of the AF family | easiest | **Worst**: full magnetic attraction reacted by the bearing; the rotor is pulled toward the stator |
| **TORUS NN** (dual-rotor, toroidally wound slotted/slotless stator, N-N facing) | flux passes circumferentially through stator yoke | good winding characteristics (short, simple toroidal winding) | moderate | balanced (symmetric dual rotor) |
| **TORUS NS** (N-S facing) | flux passes axially straight through the stator | "slightly higher power density and peak efficiency compared to NN Torus-S" | moderate | balanced |
| **AFIR** (axial flux internal rotor: 2 stators, 1 rotor) | rotor between two stators | high; two active airgaps | more parts, two stators to cool | balanced if symmetric |
| **YASA** (yokeless and segmented armature) | no stator yoke; discrete segmented stator poles, dual rotor | Stator iron cut **~50 %** vs other AF topologies → **~20 % overall torque-density increase**. 23 kg Oxford YASA prototype: **700 Nm peak → >30 Nm/kg** | segments allow pre-wound coils and high fill factor, but assembly fixturing and segment retention are the hard parts | balanced: the two rotor discs apply equal, opposing forces on the stator and are tied directly by a shaft ring, so the forces cancel and no net axial load reaches the internal bearing |

The stated design gap YASA closed: "no topology reported combines the excellent winding characteristics of the NN Torus-S machine with the short stator yoke possible by using the NS Torus-S machine" — YASA gets both by deleting the yoke entirely. Cost: the segments must be individually located and retained, and the flux path relies on the rotor back-iron discs.

Industry-wide manufacturability position: axial flux "has always been known to be a challenge in terms of manufacturability, with most motor companies producing this type of motor limited to prototyping and hand-crafted manufacturing"; automated mass production "has proved extremely difficult." Mercedes-Benz's Berlin-Marienfelde YASA line (~100 production processes, SOP 2026) is the first announced automotive-volume counter-example.

---

## 4. Halbach arrays in axial flux

**Mechanism and back-iron.** A Halbach array focuses the field on one side of the array with near-zero field on the other, which makes rotor back-iron unnecessary and cuts total active mass. Practical qualifier stated in the same literature: while an ideal Halbach array needs no ferromagnetic back-iron, in practice a *smaller* back-iron circuit is often still advantageous for overall performance. So the honest design position is back-iron *reduction*, not elimination.

**Airgap flux density.** Halbach arrays suppress airgap flux-density harmonics and intensify the fundamental. There is an **optimum combination of magnet thickness and pole number** for maximum airgap flux density — it is not monotonic in magnet thickness, which matters because the naive "add magnet" response to a low-B_g design will overshoot the optimum.

**Segments per pole.** The segmentation study computes flux density for 4, 6, 8, 12, 16, 24 and 32 segments (per Halbach cylinder). Findings: small segment counts *severely* limit the achievable flux density; **16 segments reaches 95 % of the ideal continuously-rotating-magnetization Halbach flux density** and is realizable in real-world assembly. That is the practical knee — going to 24 or 32 buys a few percent for a large increase in magnet-piece count, bond joints, and assembly fixturing.

**Reported torque gain vs conventional SPM.** The best-quantified recent comparison found: a dual-skewed Halbach-array double-sided axial-flux PM motor for EVs achieves **248.15 Nm average torque vs 230.2 Nm for the benchmark — +7.8 %** (Scientific Reports, 2025). Note that this is Halbach + skew combined against a benchmark, so the Halbach-only share is smaller than 7.8 %.

**No source consulted supports a specific "+16 % airgap flux density from 4 segments/pole" figure.** If that number is in your notes, it is unsourced here.

**Key papers to pull in full** (search returned metadata only; WebFetch unavailable this session):
- NASA, *Halbach Array Permanent-Magnet Ironless Axial-Flux Motor*, NTRS 20170000878
- *3-D Analytical Model of Axial-Flux Permanent Magnet Machine with Segmented Multipole-Halbach Array* (ResearchGate 366857807)
- *An Appreciation of using Halbach Magnets Array in Axial Flux Permanent Magnet Machines* (ResearchGate 365594394)
- *Analysis of Axial Flux Halbach Permanent-Magnet Machine* (ResearchGate 282546212)
- UK SPARK / IEEE ICRERA 2023, coreless axial-flux Halbach PCB-stator generator
- Bjørk, *Optimization and improvement of Halbach cylinder design*, arXiv 1409.3859 — source of the 4/6/8/12/16/24/32-segment sweep

---

## 5. Known failure and manufacturing problems in axial flux

**5.1 Axial magnetic attraction force.** No source consulted publishes an absolute kN figure. What is documented qualitatively and repeatedly:
- Axial magnetic machines "tend to generate enough force between the rotor and stator discs to actually deflect the rotor against the stator and cause a failure." Rotor-to-stator contact is the terminal mode.
- In a single-rotor AFM, magnetic attraction pulls the rotor toward the stator and the rotor–stator bearing "is subject to axial force… easily damaged."
- **Dual-rotor does not fully solve it.** "When the machining accuracy is not ideal, the rotors of an axial flux motor with a double air gap will produce an axial force and exert it on the bearing, affecting the life of the bearing." The cancellation is only as good as the airgap symmetry, i.e. as good as your stack tolerances. This is the design item that most often bites in practice: the nominal design shows zero net axial load, and the as-built machine does not.
- Mitigations documented: (i) tie the two rotor discs directly to each other via a shaft ring so the equal-and-opposing forces close through the rotor structure and leave no load on the internal bearing (YASA approach); (ii) double-row angular-contact ball bearings sized to carry the residual axial load.

**5.2 Rotor disc deflection.** Direct consequence of 5.1 — the attraction force is distributed over a large-diameter thin disc, which is a poor structure in bending. Deflection closes the airgap non-uniformly, which increases local attraction, which increases deflection: the loading is destabilizing, not self-limiting. Airgaps in AFMs are commonly 0.3–1.5 mm, with larger diameters and higher speeds pushing toward the larger end **for safety margin**, which directly costs σ.

**5.3 Magnet retention at high tip speed.**
- Centrifugal load is proportional to the radius of the magnet centre of mass and the **square** of angular speed — so an axial machine, which is inherently large-diameter, is the worst geometry for this.
- "The adhesive bond in such designs is subject to failure at high rotor speeds." Bonded-only retention is the documented failure path.
- Documented mitigation: carbon-fibre retaining rings to secure magnets against centrifugal force; "without this, magnets could detach during high-speed operation — posing a serious failure risk."
- Cross-reference: the radial-flux frontier machines solve exactly this problem the same way — Tesla Model S Plaid's carbon-fibre sleeve is wound over the rotor at high tension by a purpose-built Tesla Automation machine specifically because at 20 000 rpm "centrifugal force wants to expand the rotor"; Rimac Nevera and Koenigsegg (Aircore hollow carbon-fibre rotor) use the same approach.

**5.4 Bearing axial loading.** See 5.1. Summary: single-rotor → bearing carries the full attraction; dual-rotor → bearing carries only the tolerance-driven imbalance; either way the bearing selection is driven by axial, not radial, load, which is the opposite of a radial machine.

**5.5 Assembly and fixturing.**
- "Magnet assembly and bonding represent a particularly challenging aspect of axial flux motor production": magnets must be precisely positioned and securely bonded to the rotor disc while maintaining perfect alignment **and preventing demagnetization during the curing process.**
- Cure temperature is a two-sided constraint: "excessive heat can compromise magnet performance, yet insufficient curing leads to mechanical failures." There is a narrow process window and it is coupled to magnet grade.
- "Current manufacturing tolerances and assembly techniques often prove insufficient for achieving the precision required for stable high-speed operation, leading to increased noise, vibration, and potential mechanical failure."

**5.6 Unbalanced magnetic pull (ironless AFMs).** Treated as its own analysis problem — see *Unbalanced Magnetic Pull Calculation in Ironless Axial Flux Motors*, Energies 18(9), 2397.

**5.7 Airgap fluid drag (oil-cooled machines).** Oil from the lubricating/cooling circuit works into the airgap; with small gaps, high speed and large rotor diameter this introduces drag reported at **over 600 W** of loss at vehicle speed. Large-diameter axial machines are the worst case for this term, and it is frequently omitted from efficiency claims.

---

## 6. Data-integrity notes

1. **Duration is missing everywhere.** Not one machine in §1 has a published peak-rating duration. YASA's 750 kW is described only as "short-term peak." Assume nothing tighter than "a few seconds to tens of seconds."
2. **PanGood's 293 Nm/kg is not a machine-level torque density.** For reference, the best machine-level figure in this table is ~37.5 Nm/kg (Evolito D1500 2×3). 293 Nm/kg is ~8× the state of the art and is almost certainly a different quantity (e.g. Nm per kg of active material, or Nm/L misreported). The source itself notes rated output, peak output, system mass, and the inclusion boundary of the power-density calculation are all undisclosed, and that the figures are from a research platform, not the commercial product.
3. **Evolito D250 is internally inconsistent** across vendor pages: 18.5 kW/kg peak on one hand, "continuous power density of 25 kW/kg" for "one iteration" on the other. Continuous > peak is not possible for the same machine; these are different builds or different mass bases.
4. **BorgWarner iDM220 800 V "up to 500 kW"** conflicts with the application coverage range given in the same material (160–300 kW). Likely a family/peak-capability statement vs an application-rating statement.
5. **Xiaomi's comparison figures for competitors** (Tesla Model S Plaid 6.22 kW/kg, Taycan Turbo 5.29 kW/kg) are Xiaomi's own marketing comparisons, not measurements by a neutral party, and the mass basis is not stated. Tesla and Porsche do not publish bare-motor masses.
6. **Equipmake APM-120/APM-200 and HTM-3500 are radial spoke-type / IPM machines, not axial flux** — listed in §1a only because they were grouped that way in the request. APM-200's 220 kW / 450 Nm is quoted with an integral 5.5:1 epicyclic gearbox, so its Nm/kg is not comparable to gearless machines.
7. **YASA 750R's 790 Nm is quoted at 450 A_rms and its 70 kW continuous at 40 °C coolant** — both are conditions, not ratings. Continuous power at a realistic 65–85 °C coolant will be materially lower.

---

## Sources

**YASA**
- https://yasa.com/media/2021/05/yasa-750rdatasheet-rev-11.pdf
- https://stealthev.com/wp-content/uploads/2024/11/YASA-750-R-Product-Sheet.pdf
- https://yasa.com/yasa-p400-r/
- https://yasa.com/media/2021/05/yasa-p400rdatasheet-rev-14.pdf
- http://vialidad.usb.ve/materias/ec5136/Motores_axiales/YASA_P400_Product_Sheet.pdf
- https://www.everythingpe.com/products/ev-traction-motors/yasa/1069-1467-yasa-750-r
- https://yasa.com/technology/
- https://yasa.com/news/yasa-smashes-own-unofficial-power-density-world-record-pushing-state-of-the-art-electric-motor-to-staggering-new-59kw-kg-benchmark/
- https://chargedevs.com/newswire/the-tech/yasa-reports-new-axial-flux-motor-with-59-kw-kg-peak-power-density/
- https://electrek.co/2025/10/22/yasa-record-power-density-axial-flux-motor/
- https://insideevs.com/news/776572/yasa-axial-flux-motor-new-power-density-record/
- https://cleantechnica.com/2025/10/23/yasa-axial-flux-electric-motor-makes-1000-hp-but-weighs-just-28-pounds/
- https://electrek.co/2025/12/02/yasa-record-setting-axial-flux-motor-in-wheel-powertrain-1000-bhp/
- https://spectrum.ieee.org/axial-flux-motor-yasa

**Mercedes-AMG / YASA production**
- https://yasa.com/news/concept-amg-gt-xx-a-new-dimension-of-performance/
- https://www.carscoops.com/2025/10/mercedes-axial-flux-motor-weighs-less-than-a-toddler-and-makes-over-1000-hp/
- https://chargedevs.com/newswire/mercedes-owned-yasa-reveals-a-737-hp-axial-flux-electric-motor-that-weighs-just-29-pounds/
- https://www.automotivemanufacturingsolutions.com/powertrain/yasa-industrialises-axial-flux-motor-production-under-mercedes-benz/2703254
- https://en.wikipedia.org/wiki/Mercedes-AMG_Concept_GT_XX

**Evolito**
- https://evolito.aero/axial-flux-motors/
- https://www.unmannedsystemstechnology.com/company/evolito/d250-electric-motors/
- https://www.unmannedsystemstechnology.com/company/evolito/
- https://newatlas.com/aircraft/evolito-axial-flux-aircraft-motors/
- https://evtol.news/news/evolitos-breakthrough-axial-motors
- https://drivesncontrols.com/uk-axial-flux-motors-will-power-french-cargo-carrying-airships/
- https://en.wikipedia.org/wiki/Evolito_Ltd

**Koenigsegg**
- https://www.koenigsegg.com/quark-emotor
- https://www.koenigsegg.com/dark-matter
- https://mb.cision.com/Public/18511/3803118/89c15d8e3d4d9a18.pdf
- https://www.greencarcongress.com/2022/02/20220203-quark.html
- https://newatlas.com/automotive/dark-matter-koenigsegg-ev-motor/
- https://paultan.org/2023/07/20/koenigsegg-dark-matter-revealed/
- https://www.motorauthority.com/news/1134932_koenigsegg-s-quark-electric-motor-weighs-63-lb-delivers-335-hp
- https://www.koenigsegg.com/technical-specifications-gemera-2023

**Equipmake**
- https://equipmake.com/products/apm-200/
- https://equipmake.co.uk/products/apm-120/
- https://equipmake.com/products/htm-3500/
- https://www.emobility-engineering.com/equipmake-heavy-duty-motor-htm3500/
- https://www.sustainable-bus.com/components/equipmake-new-motor-heavy-duty-vehicles-htm-3500/
- https://www.autoevolution.com/news/new-heavy-duty-electric-motor-promises-3500-nm-at-1000-rpm-152918.html

**EMRAX**
- https://emrax.com/e-motors/
- https://emrax.com/e-motors/emrax-188/
- https://emrax.com/e-motors/emrax-208/
- https://emrax.com/e-motors/emrax-228/
- https://emrax.com/e-motors/emrax-268/
- https://emrax.com/e-motors/emrax-348/
- https://emrax.com/wp-content/uploads/2025/06/EMRAX_348_datasheet_V1.6.pdf
- https://emrax.com/wp-content/uploads/2025/08/EMRAX_268_datasheet_v1.6.pdf
- https://manualzz.com/doc/o/13xh40/emrax-188--208--228--268--348-user-manual-emrax-268-technical-data-table--dynamometer-test-data-
- http://www.mankeit.com/pdfs/Manual%20for%20EMRAX%20motors%20September%202016.pdf

**Magnax / Traxial**
- https://traxial.com/technology/
- https://traxial.com/blog/designing-an-axial-flux-motor-with-the-highest-power-density/
- https://traxial.com/blog/the-practice-resolving-the-challenges/
- https://traxial.com/features/next-generation-direct-drives-whitepaper/
- https://www.emobility-engineering.com/traxial-axial-flux-motor-ev-manufacturing/
- https://insideevs.com/news/361185/magnax-axial-flux-electric-motor/
- https://newatlas.com/magnax-axial-flux-electric-motor/54821/

**PanGood Power**
- https://www.electricmotorengineering.com/pangood-pushes-production-axial-flux-motor-to-25-73-kw-kg/
- https://carnewschina.com/2026/06/05/high-performance-axial-flux-breakthrough-chinese-team-hits-25-73-kw-kg-at-18000-rpm-report-says/
- https://interestingengineering.com/ai-robotics/chinese-axial-flux-motor-milestone
- https://tiencars.com/2026/07/china-moves-axial-flux-motors-toward-volume-production-as-pangood-hits-300000-unit-annual-capacity/
- https://www.electrive.com/2025/04/24/valeo-and-pangood-to-develop-axial-flux-generator/

**Whylot / Renault**
- https://www.greencarcongress.com/2021/11/20211124-whylot.html
- https://www.electrive.com/2021/11/23/renault-invests-in-motor-specialits-whylot/
- https://www.automotivepowertraintechnologyinternational.com/news/electric-powertrain-technologies/renault-invests-in-axial-flux-motor-startup.html

**Saietta / Turntide**
- https://turntide.com/resource-hub/turntide-axial-flux-motor-140/
- https://electricdrives.tv/its-confirmed-that-saietta-will-supply-their-aft-140-in-hub-advanced-axial-flux-electric-motors-for-the-new-eav-lightweight-inner-city-solution-lincs/
- https://en.wikipedia.org/wiki/Saietta_Group
- https://www.autoevolution.com/news/saiettas-aft-140-electric-motor-boosts-range-on-renault-twizy-by-10-percent-161260.html

**Tesla**
- https://insideevs.com/news/514385/tesla-models-plaid-engineering-analysis/
- https://www.tesmanian.com/blogs/tesmanian-blog/tesla-equips-model-s-plaid-with-innovative-new-electric-motor
- https://cleantechnica.com/2021/06/16/more-details-on-teslas-innovative-carbon-wrapped-motor/
- https://www.anttilehikoinen.fi/technology/electrical-engineering/teslas-carbon-wrapped-motor/
- https://insideevs.com/news/518692/tesla-model-3y-drive-units/
- https://www.marklines.com/en/teardown/tesla_model3
- https://www.marklines.com/en/report/rep1830_201903
- https://motorxp.com/wp-content/uploads/mxp_analysis_TeslaModel3.pdf
- https://en.17vin.com/engine/3D6/15515.html

**Lucid**
- https://ir.lucidmotors.com/news-releases/news-release-details/lucid-unveils-state-art-motorsports-electric-drive-unit-taking
- https://www.prnewswire.com/news-releases/lucid-motors-proprietary-electric-drivetrain-technology-powers-record-setting-performance-and-industry-leading-efficiency-in-the-lucid-air-301122827.html
- https://lucidmotors.com/technologies
- https://www.greencarcongress.com/2020/09/20200903-lucid.html
- https://insideevs.com/news/632971/lucid-drive-unit-formula-e/
- https://www.autoevolution.com/news/lucid-reveals-cutting-edge-motorsports-electric-drive-unit-it-s-already-on-the-racetrack-209083.html

**Porsche / Rimac**
- https://newsroom.porsche.com/en_AU/2021/products/technical-feature-the-porsche-taycan-23670.html
- https://newsroom.porsche.com/en/products/taycan/powertrain-18555.html
- https://newsroom.porsche.com/dam/jcr:36531be5-a8a3-46ec-b146-27272996361d/pag-taycan-turbo-s-td-en.pdf
- https://www.rimac-automobili.com/nevera/engineering/
- https://www.rimac-automobili.com/nevera/
- https://en.wikipedia.org/wiki/Rimac_Nevera

**Nidec / ZF / BorgWarner**
- https://www.nidec.com/en/product/news/2020/news0709-01/
- https://insideevs.com/news/541961/nidec-ni200ex-eaxle-zeekr-001/
- https://www.greencarcongress.com/2021/10/20211015-nidec.html
- https://press.zf.com/press/en/releases/release_57601.html
- https://www.zf.com/mobile/en/technologies/electric_mobility/stories/evbeat.html
- https://www.wardsauto.com/news/archive-wards-zf-reveals-evsys800-electric-powertrain/797171/
- https://www.emobility-engineering.com/zf-presents-ultra-compact-e-drive-for-passenger-cars/
- https://www.borgwarner.com/newsroom/press-releases/2022/02/15/borgwarner-s-all-new-800-volt-integrated-electric-drive-module-drives-leading-chinese-nev-brands-forward
- https://cti-symposium.world/borgwarners-integrated-drive-module-idm/
- https://www.borgwarner.com/newsroom/press-releases/2023/08/02/borgwarner-starts-to-supply-li-auto-new-energy-vehicles-with-integrated-drive-module

**Xiaomi / Huawei / BYD**
- https://www.electricmotorengineering.com/xiaomi-launches-its-electric-motors/
- https://en.xiaomitoday.it/xiaomi-hyperengine-v8s-v6s.html
- https://carnewschina.com/2024/07/19/new-xiaomi-su7-ultra-with-1548-horsepower-and-v8s-motor-unveiled-in-china/
- https://lamnow.com/xiaomi-su7-ev-hyperengine-v8s-motor-technology/
- https://en.wikipedia.org/wiki/Xiaomi_SU7
- https://digitalpower.huawei.com/en/driveone
- https://www.evmechanica.com/huawei-launches-new-ev-powertrain-brand-driveone-at-harmonyos-event/
- https://www.byd.com/en/news-list/BYD-Unveils-Super-e-Platform-Megawatt-Flash-Charging-Electric-Vehicles-Matching-Refueling-Speeds.html
- https://www.byd.com/eu/technology/byd-e-platform-3

**Shear stress, current density, sizing**
- http://www.eleceng.adelaide.edu.au/research/power/pebn/pebn009%20sizing%20of%20electrical%20machines.pdf
- https://www.anttilehikoinen.fi/research-work/shear-stress-versus-lorentz-force/
- https://www.mdpi.com/1996-1073/18/15/3954 (Cooling Systems for High-Speed Machines — Review and Design Considerations, Energies 18(15), 3954)
- https://www.mdpi.com/1996-1073/16/19/7006 (Recent Developments in Cooling Systems and Cooling Management for Electric Motors, Energies 16(19), 7006)
- https://doi.org/10.3390/en12234579 (Cooling Technologies for High Power Density Electrical Machines for Aviation Applications)
- https://www.emobility-engineering.com/challenge-of-power-torque-density/
- https://www.researchgate.net/figure/Airgap-Shear-of-the-reviewed-axial-flux-machine-designs-with-benchmark-radial-flux_fig2_369404580
- https://www.researchgate.net/figure/TYPICAL-CURRENT-DENSITIES-IN-ELECTRICAL-MACHINES_tbl3_275890030
- https://www.ifam.fraunhofer.de/en/magazine/direct-conductor-cooling.html
- https://wrap.warwick.ac.uk/id/eprint/181822/13/WRAP-influence-different-direct-cooling-systems-interior-permanent-magnet-traction-machine-performance-2023.pdf
- https://www.electronics-cooling.com/2022/09/electric-motor-thermal-management-for-green-transportation/
- https://www.academia.edu/36119607/Design_of_Rotating_Electrical_Machines_By_Juha_Pyrhonen_and_Tapani_Jokinen_and_Val_eria_Hrabovcova_1_
- https://www.academia.edu/8844661/Brushless_PM_motors_and_Reluctance_Motor_drives_by_TJE_Miller
- https://www.mdpi.com/2226-4310/11/7/585 (Cooling of 1 MW Electric Motors through Submerged Oil Impinging Jets)
- https://arxiv.org/pdf/2410.21875 / https://doi.org/10.3390/en18010084 (Thermal FE Model of an Electric Machine Cooled by Spray)
- https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11387712 (airgap oil shear drag, >600 W)

**Axial flux topology**
- https://www.researchgate.net/publication/4260186_Analysis_of_the_Yokeless_And_Segmented_Armature_Machine
- https://www.academia.edu/120422140/Analysis_of_the_yokeless_and_segmented_armature_machine
- https://www.researchgate.net/publication/338287303_Design_of_a_new_type_yokeless_and_segmented_armature_axial_flux_machine
- https://bpb-us-e2.wpmucdn.com/labs.utdallas.edu/dist/9/93/files/2022/07/ASCEND-EM-TIA-2022.pdf
- https://www.academia.edu/3795193/A_Comparison_of_Radial_and_Axial_Flux_Structures_in_Electrical_Machines
- https://www.electronicdesign.com/markets/automotive/article/21243040/electronic-design-the-lure-of-the-axial-flux-ev-motor
- https://www.emobility-engineering.com/axial-flux-motors/
- https://www.epj-conferences.org/articles/epjconf/pdf/2025/15/epjconf_cistem2024_01003.pdf
- https://www.researchgate.net/publication/286662581_Procedure_for_fast_electromagnetic_design_of_axial_flux_permanent_magnet_machines

**Halbach**
- https://ntrs.nasa.gov/api/citations/20170000878/downloads/20170000878.pdf
- https://www.nature.com/articles/s41598-025-10154-3 (dual-skewed Halbach double-sided AFPM, +7.8 % torque)
- https://arxiv.org/pdf/1409.3859 (Bjørk, Halbach cylinder segmentation, 4–32 segments, 16 → 95 % of ideal)
- https://www.researchgate.net/publication/365594394_An_Appreciation_of_using_Halbach_Magnets_Array_in_Axial_Flux_Permanent_Magnet_Machines
- https://www.researchgate.net/publication/366857807_3-D_Analytical_Model_of_Axial-Flux_Permanent_Magnet_Machine_with_Segmented_Multipole-Halbach_Array
- https://www.researchgate.net/publication/282546212_Analysis_of_Axial_Flux_Halbach_Permanent-Magnet_Machine
- https://sparklab.engr.uky.edu/sites/spark/files/2023%20IEEE%20ICRERA%20UK%20SPARK%20Vatani%20PCB%20Halbach%20Array%20Generator.pdf
- https://cd14.ijme.us/papers/088__Todd%20D.%20Batzel,%20Andrew%20M.%20Skraba,%20Ray%20D.%20Massi.pdf
- https://www.researchgate.net/publication/352529792_Design_and_Analysis_of_a_Novel_Axial-Radial_Flux_Permanent_Magnet_Machine_with_Halbach-Array_Permanent_Magnets

**Failure and manufacturing**
- https://doi.org/10.3390/en18092397 (Unbalanced Magnetic Pull Calculation in Ironless Axial Flux Motors, Energies 18(9), 2397)
- https://eureka.patsnap.com/report-how-to-advance-axial-flux-motor-speed-capabilities
- https://eureka.patsnap.com/report-how-to-optimize-manufacturing-techniques-for-axial-flux-motors
- https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11955845 (axial flux rotor with magnet retention device)
- https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12494686 (axial motor, powertrain — bearing axial force)
- https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10468955 / https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10141822 (axial flux BPM rotor)
- https://www.designworldonline.com/innovative-design-comes-to-electric-motors/
- https://leandesign.com/axial-flux-motor-ev-teardown/
- https://link.springer.com/article/10.1007/s00502-021-00866-5 (Mechanical stress and deformation in rotors of high-speed PMSM and IM)
- https://www.researchgate.net/publication/251961236_Shear_stress_concentrations_in_permanent_magnet_rotor_sleeves
