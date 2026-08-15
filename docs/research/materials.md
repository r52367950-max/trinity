# Material Property Database — Advanced Electric Machine Design

Compiled 2026-08-15. Intended as the seed data for a Python material database.

**Verification convention used throughout:**

| Tag | Meaning |
|---|---|
| *(no tag)* | Value appears in a manufacturer datasheet, standard, or peer-reviewed source retrieved during this research; URL in Sources. |
| **(unverified)** | Engineering-literature typical value or value derived from a grade-naming convention. Plausible and usable as a placeholder, but NOT confirmed against a primary datasheet in this pass. Re-check before use in a certification-grade calculation. |
| **(computed)** | Derived arithmetically in this document from a verified input; the formula is given. |

> **Access limitation on this pass.** Direct PDF retrieval (WebFetch) was unavailable, so numbers were harvested from search-index snippets of the primary datasheets plus the manufacturers' grade-naming conventions. Every manufacturer datasheet PDF URL is listed in Sources so the exact tables can be pulled directly. The four PDFs that would close the largest number of remaining gaps are flagged in [Priority Datasheets To Pull](#priority-datasheets-to-pull).

---

# A. Electrical Steel / Soft Magnetic Materials

## A.0 Reading the grade codes (needed to interpret the tables)

Loss notation `W(B)/(f)` = specific total core loss in W/kg at peak polarisation `B` (in tenths of a tesla, so `10` = 1.0 T, `15` = 1.5 T) and frequency `f` in Hz. Confirmed against Nippon Steel usage: *"W10/400 is the iron loss value at frequency of 400 Hz and a magnetic flux density of 1.0 T."*

Grade-code conventions:

| Producer | Pattern | Decode | Example |
|---|---|---|---|
| JFE conventional NO (`JN`, `JNE`, `JNP`) | `ttJNxxx` | `tt` = thickness ×100 mm; `xxx` = guaranteed max **W15/50** ×100 W/kg | `35JN210` → 0.35 mm, W15/50 ≤ 2.10 W/kg |
| JFE high-frequency (`JNEH`, `JNEX`, `JNHF`, `JNSF`, `JNRF`) | `ttJNxxNNNN` | `tt` = thickness ×100 mm; trailing number = guaranteed max **W10/400** ×100 W/kg **(unverified convention)** | `20JNEH1200` → 0.20 mm, W10/400 ≤ 12.00 W/kg |
| thyssenkrupp powercore traction | `NGO ttt-LLLYyyy` | `ttt` = thickness ×1000 mm; `LLL` = W10/400 ×10 W/kg; `Yyyy` = min. yield strength MPa | `NGO 025-125Y420` → 0.25 mm, W10/400 = 12.5 W/kg, Rp0.2 ≥ 420 MPa |
| Nippon Steel `HX` / `HXT` | `ttHX(T)nnnn` | `tt` = thickness ×100 mm; `HXT` = high-strength variant | `25HX1300` → 0.25 mm |
| EN 10106 (`M###-##A`) | `M(W15/50×100)-(t×100)A` | | `M235-35A` → 0.35 mm, W15/50 ≤ 2.35 W/kg |

## A.1 Ultra-thin / high-frequency non-oriented silicon steel

### A.1.1 JFE Super Core (6.5 wt% Si) and JNEH series

Measurement basis for the JFE numbers: 25 cm Epstein frame, specimens parallel to rolling direction.

| Property | Unit | 10JNEX900 | 10JNHF600 | 08JNHF500 | 15JNSF950 | 20JNEH1200 | 25JNEH1300 |
|---|---|---|---|---|---|---|---|
| Thickness | mm | **0.10** | **0.10** | 0.08 **(unv.)** | 0.15 **(unv.)** | 0.20 **(unv.)** | 0.25 **(unv.)** |
| Si content | wt% | **6.5** | **6.5** | 6.5 **(unv.)** | Si-gradient, surface 6.5 / core ~3 **(unv.)** | ~3.3 **(unv.)** | ~3.3 **(unv.)** |
| Density ρ_d | kg/m³ | **7490** | **7530** | 7530 **(unv.)** | 7600 **(unv.)** | 7650 **(unv.)** | 7650 **(unv.)** |
| Saturation Bs | T | 1.80 **(unv.)** | 1.80 **(unv.)** | 1.80 **(unv.)** | 1.95 **(unv.)** | 2.00 **(unv.)** | 2.00 **(unv.)** |
| B at 5000 A/m (B50) | T | 1.27–1.30 **(unv.)** | 1.30 **(unv.)** | 1.30 **(unv.)** | 1.48 **(unv.)** | 1.62 **(unv.)** | 1.64 **(unv.)** |
| Resistivity ρ | µΩ·m | 0.82 **(unv.)** | 0.82 **(unv.)** | 0.82 **(unv.)** | ~0.62 **(unv.)** | ~0.52 **(unv.)** | ~0.52 **(unv.)** |
| W15/50 | W/kg | n/a (Bmax limited) | n/a | n/a | 2.0 **(unv.)** | 2.4 **(unv.)** | 2.6 **(unv.)** |
| W10/50 | W/kg | ~1.0 **(unv.)** | ~0.7 **(unv.)** | ~0.6 **(unv.)** | ~0.9 **(unv.)** | ~1.1 **(unv.)** | ~1.2 **(unv.)** |
| **W10/400 (guaranteed max)** | W/kg | **≤ 9.0** *(from code)* | **≤ 6.0** *(from code)* | **≤ 5.0** *(from code)* | **≤ 9.5** *(from code)* | **≤ 12.0** *(from code)* | **≤ 13.0** *(from code)* |
| W10/800 | W/kg | ~17 **(unv.)** | ~13 **(unv.)** | ~11 **(unv.)** | ~21 **(unv.)** | ~30 **(unv.)** | ~35 **(unv.)** |
| W10/1000 | W/kg | ~21 **(unv.)** | ~16 **(unv.)** | ~14 **(unv.)** | ~27 **(unv.)** | ~40 **(unv.)** | ~47 **(unv.)** |
| W15/400 | W/kg | ~22 **(unv.)** | ~15 **(unv.)** | ~13 **(unv.)** | ~24 **(unv.)** | ~30 **(unv.)** | ~33 **(unv.)** |
| Yield strength Rp0.2 | MPa | ~560 **(unv.)** | ~560 **(unv.)** | ~560 **(unv.)** | ~450 **(unv.)** | ~400–420 **(unv.)** | ~400–420 **(unv.)** |
| Tensile strength Rm | MPa | ~600 **(unv.)** | ~600 **(unv.)** | ~600 **(unv.)** | ~540 **(unv.)** | ~520 **(unv.)** | ~520 **(unv.)** |
| Elongation A50 | % | ~2–5 **(unv.)**, brittle | ~2–5 **(unv.)** | ~2–5 **(unv.)** | ~8 **(unv.)** | ~12 **(unv.)** | ~14 **(unv.)** |
| Stacking factor | – | 0.90–0.92 **(unv.)** | 0.90–0.92 **(unv.)** | 0.88–0.90 **(unv.)** | 0.93 **(unv.)** | 0.95 **(unv.)** | 0.96 **(unv.)** |
| Magnetostriction λ | ppm | ≈ 0 (zero-λ grade) | small | small | small | ~5–8 **(unv.)** | ~5–8 **(unv.)** |

> ⚠ **Conflicting snippet.** A search index returned, for 10JNEX900 / 10JNHF600 respectively, *"5.7 / 6.4 W/kg at 50 Hz, 1.0 T"* and *"11.3 / 11.2 W/kg at 400 Hz, 1.0 T."* The 50 Hz figures are an order of magnitude above what a 0.10 mm 6.5 % Si sheet physically produces at 1.0 T, and the 400 Hz figures contradict the grade codes (900 → 9.0, 600 → 6.0). Treat all four as **(unverified, probably mis-scoped test point)**; resolve against catalogue F1E-002 before use.

Notes on why 6.5 % Si: resistivity is close to 2× that of 3 % Si, so classical eddy loss falls roughly by half at identical thickness and frequency, and magnetostriction passes through zero at ~6.5 % Si (the basis of the JNEX low-noise claim). Cost: brittleness forces CVD siliconising rather than conventional cold rolling, so €/kg is roughly 5–15× conventional NO steel **(unverified)**.

### A.1.2 thyssenkrupp powercore, ArcelorMittal iCARe, Nippon Steel NO

| Grade | Producer | Thickness (mm) | W10/400 (W/kg) | Rp0.2 min (MPa) | B50 (T) | Notes |
|---|---|---|---|---|---|---|
| powercore traction NGO 025-125Y420 | thyssenkrupp | **0.25** | **12.5** | **420** | ~1.61 **(unv.)** | Named traction grade; loss and yield read from the grade code, confirmed by tk's own "12.5 W/kg" statement |
| powercore traction NGO 025-130Y… | thyssenkrupp | 0.25 | **13.0** | – | – | Second grade in the same announcement; tk claims **up to 11 % lower loss** than its previous reference grades |
| powercore NO20 | thyssenkrupp | 0.20 **(unv.)** | ~10.5 **(unv.)** | ~400 **(unv.)** | ~1.60 **(unv.)** | Thin high-frequency NO |
| iCARe Save | ArcelorMittal | 0.20 / 0.25 / 0.30 | **guaranteed at 400 Hz**, indicative max at 700 Hz | – | – | "Save" = lowest-loss branch of the iCARe family |
| iCARe Speed | ArcelorMittal | 0.20–0.35 | – | high (mechanical branch) **(unv.)** | – | High-strength / high-tip-speed rotor branch |
| iCARe Torque | ArcelorMittal | 0.25–0.50 | – | – | highest B50 branch **(unv.)** | Maximum polarisation branch |
| 25HX1300 | Nippon Steel | 0.25 | – | – | – | Confirmed grade in NSC portfolio |
| 27HX1500 | Nippon Steel | 0.27 | – | – | – | Confirmed grade |
| 30HX1500 | Nippon Steel | 0.30 | – | – | – | Confirmed grade |
| 35HXT680T / 35HXT780T | Nippon Steel | 0.35 | – | ~680 / ~780 **(unv., from code)** | – | `HXT` = high-strength (rotor) variant; number reads as tensile class |
| 50HXT590T / 50HXT780T | Nippon Steel | 0.50 | – | ~590 / ~780 **(unv., from code)** | – | High-strength rotor grades |
| ST series (ultra-thin NGO strip) | Nippon Kinzoku | down to 0.05–0.10 **(unv.)** | – | – | – | Ultra-thin foil route |

**Generic non-oriented reference points (for sanity-checking a model):**

| Grade | t (mm) | W15/50 (W/kg) | ρ (µΩ·m) | ρ_d (kg/m³) | Stacking factor |
|---|---|---|---|---|---|
| M235-35A | 0.35 | ≤ 2.35 | 0.52 **(unv.)** | 7600 **(unv.)** | 0.97 **(unv.)** |
| M270-35A | 0.35 | ≤ 2.70 | 0.52 **(unv.)** | 7650 **(unv.)** | 0.97 **(unv.)** |
| M330-35A | 0.35 | ≤ 3.30 | 0.44 **(unv.)** | 7700 **(unv.)** | 0.97 **(unv.)** |
| NO20 | 0.20 | ~2.0 **(unv.)** | 0.52 **(unv.)** | 7600 **(unv.)** | 0.95 **(unv.)** |

## A.2 Cobalt-iron (49 % Co)

| Property | Unit | VACOFLUX 48 | VACODUR 49 | VACODUR S Plus | HIPERCO 50 / 50A |
|---|---|---|---|---|---|
| Nominal composition | wt% | 49Co-49Fe-2V **(unv.)** | 49Co-49Fe-2V **(unv.)** | 49Co-2V-Fe + strengthening **(unv.)** | 49Co-49Fe-2V |
| Saturation Bs | T | **up to 2.3** | **up to 2.3** | ~2.2 **(unv.)** | 2.3–2.4 **(unv.)** |
| (VACOFLUX 50, ref.) | T | **2.4 — highest of all soft-magnetic alloys** | | | |
| Coercivity Hc | A/m | **down to 35** | ~50–90 **(unv.)** | ~150–250 **(unv.)** | ~40–80 **(unv.)** |
| Yield strength Rp0.2 | MPa | ~200–350 **(unv.)** (magnetically optimised anneal) | ~400–500 **(unv.)** | **up to 800** | ~350–830 depending on anneal **(unv.)** |
| Loss W10/400 | W/kg | ~13 **(unv.)** at 0.20 mm | ~15 **(unv.)** at 0.20 mm | ~20 **(unv.)** | ~14 **(unv.)** at 0.15 mm |
| Loss W20/400 | W/kg | ~45 **(unv.)** | ~50 **(unv.)** | ~60 **(unv.)** | ~48 **(unv.)** |
| Resistivity ρ | µΩ·m | 0.40 **(unv.)** | 0.40 **(unv.)** | 0.42 **(unv.)** | 0.40 **(unv.)** |
| Density ρ_d | kg/m³ | 8120 **(unv.)** | 8120 **(unv.)** | 8120 **(unv.)** | 8110 **(unv.)** |
| Curie temperature | °C | ~940 **(unv.)** | ~940 **(unv.)** | ~940 **(unv.)** | ~940 **(unv.)** |
| Typical strip thickness | mm | 0.10 / 0.15 / 0.20 / 0.35 **(unv.)** | 0.15 / 0.20 / 0.35 **(unv.)** | 0.20 / 0.35 **(unv.)** | 0.15 / 0.36 **(unv.)** |
| **Raw-material cost** | €/kg | **~50–120 (10–30× NO silicon steel)** **(unverified)** | same | same | same |

VAC's own positioning: VACODUR alloys "exhibit the strength properties required for high-speed rotating machines," VACOFLUX prioritises the lowest coercivity. The **trade-off to encode in the model is monotonic**: as yield strength rises across VACOFLUX 48 → VACODUR 49 → VACODUR S Plus, coercivity and core loss rise with it.

**When CoFe pays for itself:** only when the machine is *saturation-limited*, not loss-limited — i.e. aerospace/eVTOL generators and starter-generators where the 2.3 T vs 2.0 T headroom (+15 % on flux, so ~+15 % torque at fixed geometry, or ~25 % mass reduction at fixed torque) beats the ~20× material cost.

## A.3 Nanocrystalline and amorphous ribbon

| Property | Unit | VITROPERM 500F (VAC) | FINEMET FT-3M (Proterial/Hitachi Metals) | Metglas 2605SA1 |
|---|---|---|---|---|
| Class | – | Nanocrystalline FeCuNbSiB | Nanocrystalline FeCuNbSiB | Fe-based amorphous |
| Composition | – | **Fe~73.5Cu1Nb3Si13–16B6–9** | **same family** | Fe-Si-B **(unv.)** |
| Saturation Bs | T | **1.2** | **1.2–1.3** | **1.56** |
| Ribbon thickness | µm | 17–20 **(unv.)** | 18 **(unv.)** | **25 ± 4** |
| Initial/effective µ | – | **20 000 (F-type, square µ(H_DC))** | 20 000–100 000 **(unv.)** | ~5 000–10 000 **(unv.)** |
| Resistivity ρ | µΩ·m | 1.15 **(unv.)** | 1.20 **(unv.)** | **1.3** |
| Density ρ_d | kg/m³ | 7350 **(unv.)** | 7300 **(unv.)** | **7180** |
| Curie temperature Tc | °C | ~600 **(unv.)** | ~570 **(unv.)** | **395** |
| Crystallisation temp Tx | °C | ~560 **(unv.)** | ~510 **(unv.)** | **510** |
| Loss @ 0.2 T, 1 kHz | W/kg | ~1.5 **(unv.)** | ~1.5 **(unv.)** | ~2.5 **(unv.)** |
| Loss @ 0.2 T, 10 kHz | W/kg | ~25 **(unv.)** | ~25 **(unv.)** | ~50 **(unv.)** |
| Loss @ 1.0 T, 1 kHz | W/kg | ~12 **(unv.)** | ~12 **(unv.)** | ~9 **(unv.)** |
| Loss @ 1.0 T, 10 kHz | W/kg | ~250 **(unv.)** | ~250 **(unv.)** | ~180 **(unv.)** |
| Magnetostriction λs | ppm | ~+2 **(unv.)** | ~+2 **(unv.)** | ~27 **(unv.)** |
| Stacking factor | – | 0.75–0.85 **(unv.)** | 0.75–0.85 **(unv.)** | 0.80–0.86 **(unv.)** |

**Why/when used in a machine:** ribbon thickness ~20 µm is 5× thinner than the thinnest practical rolled steel, so classical eddy loss (∝ t²) drops ~25×. This only matters above roughly 1–2 kHz fundamental — i.e. very-high-speed (>50 krpm) or high-pole-count axial-flux designs. The blockers are (a) Bs of only 1.2–1.3 T, which costs torque density directly, (b) the ribbon cannot be punched — cores must be wound, cut, or EDM'd, which rules out most slotted radial-flux stator geometries, and (c) brittleness after the nanocrystallisation anneal. Metglas 2605SA1 is the compromise: 1.56 T saturation at 25 µm, but a Curie point of only 395 °C, which limits stress-relief options.

## A.4 Soft Magnetic Composite (Höganäs Somaloy)

Family split confirmed by Höganäs: **1P = baseline, 3P = mechanical strength + permeability, 5P = lowest losses.** Somaloy 700 3P and 1000 3P are positioned "for motor applications that require both good component strength and high permeability at a relatively low frequency or for smaller components."

| Property | Unit | Somaloy 700 3P @800 MPa | Somaloy 700 3P @600 MPa | Somaloy 1000 3P @800 MPa | Somaloy 700 5P | Somaloy 1000 5P @800 MPa |
|---|---|---|---|---|---|---|
| Green density | kg/m³ | 7550 **(unv.)** | 7350 **(unv.)** | 7550 **(unv.)** | 7500 **(unv.)** | 7550 **(unv.)** |
| Induction @ 10 kA/m | T | 1.53 **(unv.)** | 1.44 **(unv.)** | 1.55 **(unv.)** | 1.50 **(unv.)** | 1.55 **(unv.)** |
| Induction @ 100 kA/m | T | 1.95 **(unv.)** | 1.85 **(unv.)** | 1.97 **(unv.)** | 1.93 **(unv.)** | 1.97 **(unv.)** |
| Saturation Bs | T | ~2.0 **(unv.)** | ~1.9 **(unv.)** | ~2.0 **(unv.)** | ~2.0 **(unv.)** | ~2.0 **(unv.)** |
| Max relative permeability µr,max | – | 500–850 **(unv.)** | 400–500 **(unv.)** | 550–900 **(unv.)** | 400–600 **(unv.)** | 500–700 **(unv.)** |
| Resistivity ρ | µΩ·m | ~200–400 **(unv.)** | ~400 **(unv.)** | ~300 **(unv.)** | ~2000–4000 **(unv.)** | ~4000 **(unv.)** |
| Loss @ 1.0 T, 50 Hz | W/kg | ~5 **(unv.)** | ~6 **(unv.)** | ~5 **(unv.)** | ~6 **(unv.)** | ~6 **(unv.)** |
| Loss @ 1.0 T, 400 Hz | W/kg | ~45 **(unv.)** | ~52 **(unv.)** | ~45 **(unv.)** | ~48 **(unv.)** | ~46 **(unv.)** |
| Loss @ 1.0 T, 1000 Hz | W/kg | ~130 **(unv.)** | ~150 **(unv.)** | ~130 **(unv.)** | ~120 **(unv.)** | ~115 **(unv.)** |
| Transverse rupture strength TRS | MPa | **82.7 ± 13.5** (at 700 MPa compaction, 550 °C / 15 min cure — measured optimum) | ~60 **(unv.)** | ~100 **(unv.)** | ~70 **(unv.)** | ~90 **(unv.)** |
| Model validity envelope | – | **verified to 1.5 T and 5000 Hz** | | | | |

Important measurement caveat straight from Höganäs: **SMC data is not obtained by the Epstein-frame method used for electrical steel sheet** — SMC is measured on pressed rings/toroids. Do not mix SMC and lamination loss curves in a single fitted model without re-normalising.

Höganäs also documents that **bulk resistivity falls as the heat-treatment temperature is raised**, because the phosphate insulation layer degrades. Cure temperature is therefore a direct trade knob: higher cure → higher TRS, lower resistivity, higher eddy loss. Encode cure temperature as a material variant, not a constant.

**Why SMC in an axial-flux machine:** SMC is magnetically and thermally isotropic. In an axial-flux or transverse-flux topology the flux path is genuinely 3-D (it turns out of the lamination plane), and a stack of laminations presents ~1/1000 of its in-plane permeability to out-of-plane flux while a lamination stack also cannot be net-shape formed into a claw or tooth-with-shoe geometry. SMC's ~10× lower permeability and ~10× higher low-frequency loss are the price. SMC wins when: (1) flux is genuinely 3-D, (2) fundamental frequency > ~400 Hz so the resistivity advantage offsets the hysteresis penalty, and (3) net-shape pressing removes assembly cost.

## A.5 Loss-model coefficients

**No published Kh/Ke/Kexc set for the specific ultra-thin grades above was located in this pass.** The honest position: the exponents and physical scalings below are reliable; the multiplicative constants must be fitted to each grade's own W(B,f) table. Fit-quality guidance found in the literature: *"more accurate results can be achieved if the third anomalous loss coefficient is omitted in the case of non-oriented steels"* — i.e. prefer the 2-term Bertotti fit for NO silicon steel, and keep the excess term only for grain-oriented, nanocrystalline, and amorphous materials.

**Classical eddy coefficient is not fitted — compute it** (see Eq. 4). This removes one free parameter and improves extrapolation.

| Material | Kh | α | β | Ke (W·s²/(T²·kg)) | Kexc | Basis |
|---|---|---|---|---|---|---|
| 10JNEX900 (0.10 mm, 6.5 %Si) | fit | 1.0–1.2 **(unv.)** | 1.8–2.0 **(unv.)** | **2.68e-6 (computed, Eq. 4)** | small, ~0 | Compute Ke from t=0.10 mm, ρ=0.82 µΩ·m, ρ_d=7490 |
| 20JNEH1200 (0.20 mm, ~3.3 %Si) | fit | 1.0–1.2 **(unv.)** | 1.8–2.0 **(unv.)** | **1.66e-5 (computed, Eq. 4)** | small | t=0.20 mm, ρ=0.52 µΩ·m, ρ_d=7650 |
| M235-35A (0.35 mm) | fit | 1.0 **(unv.)** | 1.8–2.1 **(unv.)** | **5.11e-5 (computed, Eq. 4)** | small | t=0.35 mm, ρ=0.52 µΩ·m, ρ_d=7600 |
| Generic 2.5 % Si steel | **93.89 Ws/(T²·m³)** — note volumetric units, divide by ρ_d for W/kg basis | 1.0 | 2.0 | – | – | Literature reference value |
| Somaloy 3P/5P | fit | ~1.0 **(unv.)** | ~2.0 **(unv.)** | fit (particle-scale, Eq. 4 invalid) | significant | Eq. 4 does **not** apply — eddy currents are particle-confined, not sheet-confined |
| Nanocrystalline / Metglas | fit | 1.5–1.8 **(unv.)** | 1.8–2.0 **(unv.)** | small (t=20 µm) | dominant | Excess-loss term must be retained |

Worked check of Eq. 4 for 10JNEX900:
`Ke = π² × (1.0e-4)² / (6 × 0.82e-6 × 7490) = 9.8696 × 1.0e-8 / 0.036851 = 2.678e-6 W·s²/(T²·kg)`
→ classical eddy loss at 1.0 T, 400 Hz = `2.678e-6 × 400² × 1² = 0.43 W/kg`, i.e. under 5 % of the 9.0 W/kg grade limit. **Conclusion for the simulation: at ≤400 Hz these ultra-thin 6.5 % Si grades are hysteresis-dominated, not eddy-dominated.** The eddy advantage of 6.5 % Si only becomes the dominant effect above roughly 1.5–2 kHz.

---

# B. Permanent Magnets

## B.1 Sintered NdFeB — magnetic properties

Temperature-class maxima (confirmed): **N = 80 °C, M = 100 °C, H = 120 °C, SH = 150 °C, UH = 180 °C, EH = 200 °C, AH = 230 °C (unverified for AH)**. Note that the class maximum is a *marketing* figure valid only at a benign permeance coefficient (typically Pc ≈ 2); the real limit is set by the demagnetisation knee, so always check HcJ(T) against the machine's worst-case demagnetising field.

| Grade | Br @20 °C (T) | HcB (kA/m) | HcJ (kA/m) | (BH)max (kJ/m³) | (BH)max (MGOe) | α(Br) (%/K) | β(HcJ) (%/K) | T_max (°C) |
|---|---|---|---|---|---|---|---|---|
| **N42SH** | **1.28–1.33** | ≥ 955 **(unv.)** | **≥ 1592** | **318–342** | **40–43** | −0.11 **(unv.)** | −0.55 **(unv.)** | **150** |
| **N45SH** | **1.32–1.37** | ≥ 995 **(unv.)** | **≥ 1592** | **342–366** | **43–46** | −0.11 **(unv.)** | −0.55 **(unv.)** | **150** |
| **N48SH** | **1.36–1.41** | ≥ 1035 **(unv.)** | **≥ 1592** | **366–390** | **46–49** | −0.11 **(unv.)** | −0.55 **(unv.)** | **150** |
| **N35UH** | 1.17–1.22 **(unv.)** | ≥ 868 **(unv.)** | ≥ 1990 **(unv.)** | 263–287 **(unv.)** | 33–36 **(unv.)** | −0.12 **(unv.)** | −0.50 **(unv.)** | **180** |
| **N38UH** | 1.22–1.26 **(unv.)** | ≥ 899 **(unv.)** | ≥ 1990 **(unv.)** | 287–310 **(unv.)** | 36–39 **(unv.)** | **−0.120** | **−0.465** | **180** |
| **N33EH** | 1.13–1.17 **(unv.)** | ≥ 836 **(unv.)** | ≥ 2388 **(unv.)** | 247–271 **(unv.)** | 31–34 **(unv.)** | −0.12 **(unv.)** | −0.45 **(unv.)** | **200** |
| **N30AH** | 1.08–1.13 **(unv.)** | ≥ 812 **(unv.)** | ≥ 2626 **(unv.)** | 223–247 **(unv.)** | 28–31 **(unv.)** | −0.12 **(unv.)** | −0.43 **(unv.)** | **230 (unv.)** |

### Br vs temperature — **(computed)** from `Br(T) = Br(20) · [1 + α(Br)·(T−20)/100]`, using the lower bound of the Br band (conservative for design)

| Grade | Br @20 °C | Br @100 °C | Br @150 °C | Br @180 °C |
|---|---|---|---|---|
| N42SH (α=−0.11) | 1.280 T | 1.167 T | 1.097 T | *beyond T_max* |
| N45SH (α=−0.11) | 1.320 T | 1.204 T | 1.131 T | *beyond T_max* |
| N48SH (α=−0.11) | 1.360 T | 1.240 T | 1.166 T | *beyond T_max* |
| N35UH (α=−0.12) | 1.170 T | 1.058 T | 0.987 T | 0.945 T |
| N38UH (α=−0.120) | 1.220 T | 1.103 T | 1.029 T | 0.986 T |
| N33EH (α=−0.12) | 1.130 T | 1.021 T | 0.954 T | 0.913 T |
| N30AH (α=−0.12) | 1.080 T | 0.976 T | 0.912 T | 0.873 T |

### HcJ vs temperature — **(computed)** from `HcJ(T) = HcJ(20) · [1 + β(HcJ)·(T−20)/100]`

| Grade | HcJ @20 °C | HcJ @100 °C | HcJ @150 °C | HcJ @180 °C |
|---|---|---|---|---|
| N42SH/N45SH/N48SH (β=−0.55) | 1592 kA/m | 891 kA/m | 453 kA/m | *beyond T_max* |
| N38UH (β=−0.465) | 1990 kA/m | 1250 kA/m | 787 kA/m | 509 kA/m |
| N33EH (β=−0.45) | 2388 kA/m | 1528 kA/m | 991 kA/m | 669 kA/m |
| N30AH (β=−0.43) | 2626 kA/m | 1723 kA/m | 1158 kA/m | 819 kA/m |

> **Design read on the table above:** the SH grades lose ~72 % of their coercivity between 20 °C and 150 °C. At 150 °C an N45SH magnet has only ~453 kA/m of intrinsic coercivity left, against a short-circuit armature reaction field that in a high-power-density traction machine is routinely 400–800 kA/m. This is why UH/EH grades — and hence Dy/Tb — appear in traction motors at all, and it is exactly the constraint that grain-boundary diffusion is designed to relieve.

## B.2 Sintered NdFeB — physical and mechanical properties

| Property | Unit | Value |
|---|---|---|
| Density | kg/m³ | **7600** (7500–7600 typical range) |
| Electrical resistivity ρ | µΩ·m | **1.2–1.6** (use **1.4** as nominal) |
| Young's modulus E | GPa | **150** (140–160 across sources) |
| Flexural strength | MPa | **240** |
| Compressive strength | MPa | 900–1100 **(unv.)** |
| Tensile strength | MPa | 75–85 **(unv.)** — magnets are effectively brittle in tension; **never design a rotor that puts a magnet in tension** |
| Poisson's ratio ν | – | 0.24 **(unv.)** |
| Vickers hardness | HV | 550–650 **(unv.)** |
| CTE ∥ magnetisation | 1/K | **+5e-6 to +7e-6** |
| CTE ⊥ magnetisation | 1/K | **−3e-6 to −1e-6** (negative — anisotropic, matters for shrink-fit and sleeve pre-load) |
| Thermal conductivity | W/(m·K) | 8–9 **(unv.)** |
| Specific heat | J/(kg·K) | 440–500 **(unv.)** |
| Curie temperature Tc | °C | 310–370 depending on grade **(unv.)** |

The **resistivity of 1.2–1.6 µΩ·m is the single most important number for magnet eddy loss**. It is roughly 2–3× that of silicon steel, so magnets are not "insulators" — at high electrical frequency, PWM harmonics and slotting harmonics deposit real power in the magnet body. Segmentation (axial and circumferential) is the standard mitigation; loss scales roughly with the square of the segment dimension transverse to the eddy path.

## B.3 Grain boundary diffusion (GBD) — status 2025–2026

**What it is:** Dy or Tb is applied to the *surface* of a sintered magnet and diffused along grain boundaries at ~900 °C, forming a heavy-rare-earth-rich shell on each Nd₂Fe₁₄B grain. Coercivity is a surface-nucleation phenomenon, so the shell delivers most of the HcJ benefit of bulk alloying while consuming far less HRE. Bulk alloying also dilutes the magnetisation of the grain interior and therefore costs Br; GBD largely avoids that.

**Achieved reductions:**

| Metric | Value | Source basis |
|---|---|---|
| HRE consumption vs. bulk alloying at equal HcJ | **~50–80 % reduction in Dy/Tb** | **(unverified)** — widely cited industry figure |
| Coercivity gain, TbF₃ / multi-element diffusion source | quantitative example: **18.47 kOe → 23.60 kOe (1470 → 1879 kA/m, +28 %)** using a Tb–Ce–Cu source at 10 wt% Ce | Peer-reviewed |
| Br penalty | near-zero vs. several % for bulk alloying **(unverified)** | |
| Depth limit | GBD effectiveness falls with magnet thickness; practical limit roughly **≤ 6–10 mm** in the diffusion direction **(unverified)** | Physics constraint noted in trade press: "grain boundary diffusion improves HRE efficiency — but physics still draws the line" |
| Enabling technique | finer sintered grain size raises diffusion efficiency; Ga additions facilitate TbF₃ diffusion; multi-element (Tb-Ce-Al-Cu-Zn) sources lower the source melting point | Peer-reviewed |

**Suppliers and 2025–2026 posture:**

| Company | Country | Status |
|---|---|---|
| **Proterial** (ex-Hitachi Metals) | JP | **Announced 2025-07-22: high-performance heavy-rare-earth-FREE Nd sintered magnet for EV traction motors.** One version already **sample-shipping from a commercial-scale facility**; a second, more heat-resistant variant **expected to ship by April 2026**. Post-Bain-Capital restructuring focused explicitly on HREE-free traction magnets. |
| **Shin-Etsu Chemical** | JP | Long-standing GBD developer; positions GBD as the route to high performance with substantially less Dy. |
| **TDK** | JP | Active R&D on reduced-HREE formulations and magnet recycling as structural mitigations. |
| **Daido Steel** | JP | Hot-deformed / die-upset NdFeB (DyFree-branded) for Toyota traction motors **(unverified for 2026 status)**. |
| **JL Mag Rare-Earth** | CN | Largest listed Chinese NdFeB maker, GBD at volume **(unverified)**. |
| **Yantai Zhenghai Magnetic Material** | CN | GBD product line, EV supply **(unverified)**. |
| **Ningbo Yunsheng** | CN | GBD product line **(unverified)**. |

## B.4 Sm₂Co₁₇ high-temperature grades

| Property | Unit | Sm₂Co₁₇ (typ.) | SmCo₅ (ref.) |
|---|---|---|---|
| Br @20 °C | T | 1.00–1.12 **(unv.)** | 0.85–0.95 **(unv.)** |
| HcJ @20 °C | kA/m | 1400–2000 **(unv.)** | 1600–2000 **(unv.)** |
| (BH)max | kJ/m³ (MGOe) | **167–255 (21–32 MGOe)** | 128–175 (16–22) **(unv.)** |
| α(Br) | %/K | **−0.030 to −0.040** | −0.045 **(unv.)** |
| β(HcJ) | %/K | −0.15 to −0.30 **(unv.)** | −0.30 **(unv.)** |
| Max operating temperature | °C | **350** (standard); 500 °C special grades **(unv.)** | 250 **(unv.)** |
| Curie temperature | °C | 800–850 **(unv.)** | 720 **(unv.)** |
| Electrical resistivity ρ | µΩ·m | **0.85** | 0.50–0.60 **(unv.)** |
| Density | kg/m³ | 8300–8400 **(unv.)** | 8300 **(unv.)** |
| Tensile strength | MPa | ~35 **(unv.)** — very brittle | ~35 **(unv.)** |
| Compressive strength | MPa | ~800 **(unv.)** | ~1000 **(unv.)** |
| Flexural strength | MPa | ~120–150 **(unv.)** | ~120 **(unv.)** |
| Young's modulus E | GPa | 120–150 **(unv.)** | 120 **(unv.)** |
| CTE ∥ | 1/K | +9e-6 **(unv.)** | +6e-6 **(unv.)** |
| CTE ⊥ | 1/K | +11e-6 **(unv.)** | +12e-6 **(unv.)** |
| Corrosion resistance | – | Excellent; usually uncoated | Excellent |

Composition note: Sm₂Co₁₇ is "mainly Sm and Co but also contains Cu, Hf and/or Zr, sometimes Pr, and Fe" — the Cu/Zr cellular precipitate structure is what provides pinning-type coercivity, hence the far flatter β(HcJ) than NdFeB.

**Selection rule:** Sm₂Co₁₇ trades roughly 25–35 % of (BH)max for a ~4× improvement in α(Br) and a ~200 °C higher ceiling. It wins in aerospace generators, downhole, and any machine where the magnet sees >180 °C, and it is nearly indifferent to Dy/Tb supply risk — but its Co content (~50 wt%) creates a different, cobalt-linked supply exposure.

## B.5 Rare-earth price and supply, 2025–2026

| Item | Price / figure | Date / basis |
|---|---|---|
| NdPr oxide | **~US$110/kg floor** | 2026, general level |
| Neodymium oxide, China domestic | **US$113.05/kg** | 2026-03-10 |
| Neodymium oxide, FOB China (export) | **US$184/kg** | 2026-03-10 — a **63 % export premium** over the domestic price |
| Terbium metal, China | **up to US$1,260/kg** | 2026 |
| Terbium oxide, China domestic | **US$803.81/kg** | 2026 |
| Terbium oxide, FOB China | **US$1,182/kg** | 2026 |
| Dysprosium metal, China | **up to US$266/kg** | 2026 peak |
| Dysprosium, April 2026 | **US$220.93/kg** | 2026-04 |
| Dysprosium, June 2026 | **US$208.68/kg (−5.5 % m/m, 2nd consecutive monthly decline)** | 2026-06 |
| China share of refined NdPr | **~92 %** | 2026 |
| China share of separated heavy rare earths (Dy, Tb) | **98–99 %** | 2026 |
| Effect of export controls | Shipments of **yttrium, dysprosium and terbium down ~50 %** vs. the 12 months before the **April 2025** controls | 2026 |

**Structural read.** The Chinese domestic/export spread (63 % on Nd oxide, 47 % on Tb oxide) is the quantified value of supply-chain security and is the number to use when comparing a Dy/Tb-bearing design against a GBD or HREE-free design in a Western supply chain — the ex-China cost of an EH-grade magnet is materially higher than a Chinese price list implies. Chinese rare-earth pricing is set by state quotas and export controls rather than free price discovery, so historical volatility models are a poor guide. Heavy rare earths (Dy/Tb) remain the chokepoint; light rare earths (Nd/Pr) are comparatively liquid.

**Design consequence to encode:** a `hre_content_kg_per_kg_magnet` field on each magnet grade, with a cost model separating NdPr from Dy/Tb, is worth more than a single €/kg figure, because the Dy/Tb price is ~10× the NdPr price and moves independently.

---

# C. Cooling

## C.1 Direct oil jet / spray cooling of end windings — achievable HTC

All values below are experimentally measured on motor end-winding or representative surfaces with automatic transmission fluid.

| Configuration | HTC (W/m²·K) | Conditions |
|---|---|---|
| **Impinging ATF jet** | **up to 8 000** | jet velocity 7.5 m/s |
| **Oil spray, axial nozzle arrangement** | **up to 11 795** | end-winding cooling, max observed |
| **Oil spray, radial nozzle arrangement** | **up to 7 301** | end-winding cooling, max observed |
| **Flat (fan) jet nozzle** | **3 028.6** | best of three nozzle types tested; produced lowest max winding temperature, **120.3 °C** |
| **Full-cone nozzle** | lower than flat jet | same study |
| **Axial jet, 2 mm nozzle, low flow** | **940** | 0.75 kg/min — shows the strong flow-rate sensitivity |
| Typical design range to assume for a sized system | **2 000–8 000 (unverified as a design band)** | |

Experimental envelope of the underlying studies: **ATF temperature 50–90 °C, volumetric flow 1×10⁻⁵ to 2.5×10⁻⁵ m³/s (0.6–1.5 L/min)**, representative of an automotive transaxle.

**Key sensitivities to model:** HTC scales roughly with `V_jet^0.5` (see Eq. 5/6), so doubling jet velocity buys only ~40 % HTC at ~8× the pumping power. Nozzle *type* (flat/fan vs. cone) and *placement relative to the end-winding crown* change HTC by 3× at constant flow — placement is a bigger lever than flow rate.

## C.2 EV e-fluid / ATF thermal properties

| Property | Unit | Range across EV thermal-management fluids | Notes |
|---|---|---|---|
| Density (40 °C and 80 °C) | g/mL | **0.45 – 1.55** | Wide because the class spans hydrocarbons through fluorinated fluids; a hydrocarbon e-fluid is ~0.82–0.86 at 40 °C |
| Specific heat cp (40 °C, 80 °C) | kJ/(kg·K) | **1.55 – 3.15** | |
| Dynamic viscosity µ (80 °C) | cP (mPa·s) | **0.75 – 5.50** | |
| Thermal conductivity k | W/(m·K) | **0.12 – 0.16** for petroleum-based ATF / hydraulic base stocks | |

Named products:

| Product | Property | Value |
|---|---|---|
| **Shell immersion-cooling fluid** (representative Shell e-fluid) | k @40 °C | **0.142 W/(m·K)** |
| | cp @40 °C | **2 274 J/(kg·K)** |
| **Shell e-fluids (family claim)** | k vs. competitor e-mobility driveline fluid | **up to +9 %** |
| **Castrol ON** | – | No public thermophysical datasheet located **(unverified)** — Castrol publishes PDS/SDS for Transmax and ATF TQ DIII but not full k/cp tables |
| **TotalEnergies Quartz EV** | – | No public thermophysical datasheet located **(unverified)** |

**Recommended nominal ATF / e-fluid property set for simulation (unverified as a composite, but internally consistent):**

| T (°C) | ρ (kg/m³) | cp (J/kg·K) | k (W/m·K) | µ (mPa·s) | ν (mm²/s) | Pr |
|---|---|---|---|---|---|---|
| 40 | 843 | 2 100 | 0.143 | 22.0 | 26.1 | 323 |
| 60 | 830 | 2 180 | 0.140 | 11.0 | 13.3 | 171 |
| 80 | 817 | 2 260 | 0.137 | 6.5 | 8.0 | 107 |
| 100 | 804 | 2 340 | 0.134 | 4.3 | 5.3 | 75 |
| 120 | 791 | 2 420 | 0.131 | 3.1 | 3.9 | 57 |

Note the Prandtl number: **an oil jet operates at Pr ≈ 60–330, not Pr ≈ 5.** Correlations validated only for water (Pr ~1–10) will be extrapolated badly. Prefer a correlation with an explicit, validated Pr exponent over a wide range — free-surface-jet data covering **Pr 7 to 262** exists and brackets the operating range.

The engineering tension to encode: **the lowest-viscosity lubricants give the best heat transfer**, but low viscosity degrades friction and wear performance in a shared gearbox/motor sump. An e-fluid is a compromise, not an optimum coolant.

## C.3 Water–ethylene-glycol 50/50 jacket cooling

| Property | Unit | Value @20 °C | Value @60 °C |
|---|---|---|---|
| Density ρ | kg/m³ | **1 060** | 1 040 **(unv.)** |
| Specific heat cp | J/(kg·K) | **3 140** | 3 300 **(unv.)** |
| Thermal conductivity k | W/(m·K) | **0.41** | 0.43 **(unv.)** |
| Dynamic viscosity µ | mPa·s | **4.2** | 1.5 **(unv.)** |
| Prandtl number Pr | – | 32 **(computed: 4.2e-3 × 3140 / 0.41)** | 11.5 **(computed)** |
| Freeze point | °C | −37 **(unv.)** | |

**Achievable jacket HTC:** **1 500–6 000 W/(m²·K)** in a spiral or axial-channel water jacket at 6–15 L/min **(unverified as a design band)**. Compute from Eq. 7/8 rather than assuming. A search result quoting `3.08×10⁸ W/m²K` for a 50:50 EG/water mixture is a **molecular-dynamics nanopipe result and is physically irrelevant to a motor jacket** — do not use it.

**The jacket HTC is usually not the limiting resistance.** In a jacketed machine the dominant resistances are the slot (Section C.5) and the stator-to-housing contact (Section C.6). Raising jacket HTC from 2 000 to 6 000 W/m²·K typically moves winding temperature by only a few kelvin.

## C.4 Achievable continuous current density by cooling method

Current density here is **RMS in the copper**, continuous (thermally steady-state) unless noted.

| Cooling method | Continuous J (A/mm²) | Peak/transient J (A/mm²) | Basis |
|---|---|---|---|
| **Natural convection / TENV** | **3 – 5 (unverified)** | 8–10 **(unv.)** | Classical machine-design practice |
| **Forced air (TEFC, shaft fan)** | **5 – 8 (unverified)** | 12–15 **(unv.)** | Classical |
| **Water jacket, Class F insulation** | **up to 24.7** | **40** | Published steady-state / transient pair |
| **Oil spray / direct oil** | **10 – 40**, with **35** staying inside thermal class 180 limits | – | Published |
| **Flat (hairpin) wire + direct cooling** | **20** | – | Published |
| **Two-phase immersion** | **40** | – | Published; "reliably supports safe operation" |
| **Direct conductor cooling — ceramic 3-D direct-winding heat exchanger** | **35.7 A_RMS/mm²** | – | Published, continuous |
| **Direct fluid conductor cooling** | **51.25** | – | Published |
| **Class H insulation ceiling** | **up to 58** | – | Published |
| **Hollow conductors with integrated channels (projected)** | **up to 130** | – | Anticipated, **not demonstrated** — treat as an upper bound, not a design target |

Reading: the jump from water jacket (~25) to direct conductor cooling (~50) is roughly 2×, and it is bought by moving the coolant inside the slot, which eliminates the slot thermal resistance that dominates every indirectly-cooled machine. Everything above ~60 A/mm² in the table is research-stage.

## C.5 Slot thermal properties

| Item | Thermal conductivity (W/m·K) | Notes |
|---|---|---|
| **Nomex 410 slot liner** | **0.149** at **0.179 mm** thickness | DuPont aramid paper; the standard slot liner |
| Nomex 410, other gauges | ~0.14–0.15 **(unv.)** | Available 0.05–0.76 mm |
| **Standard (unfilled) epoxy potting compound** | **~0.1** | |
| **Potted Litz wire, transverse effective** | **0.3** | Predicted, using a ~0.1 W/m·K epoxy |
| **VPI (vacuum pressure impregnation) winding** | **1.3** | Achievable with VPI process |
| **Filled thermoset slot-fill compound** | **≥ 1**, and **> 5** in high-fill formulations | Conductive-particle-filled |
| **Slot equivalent conductivity, varnish-trickle impregnation** | 0.15–0.35 **(unverified)** | The realistic low end for cheap manufacturing |
| **Slot equivalent conductivity, good VPI** | 0.8–1.3 | Consistent with the verified 1.3 figure |
| **Slot equivalent conductivity, filled potting** | 1.5–3.0 **(unverified)** | |
| **Impregnation goodness factor** | – | The single largest uncertainty in any LPTN model; treat as a calibration parameter with a ±50 % band |

**Modelling note:** the slot is strongly anisotropic. Along the conductor (axial) the effective conductivity is close to the copper fill fraction × 400 W/m·K, i.e. **~150–250 W/m·K**; transverse to the conductors it is the 0.15–1.3 W/m·K figure above. A 3-orders-of-magnitude anisotropy. Use an orthotropic slot material, never a scalar.

## C.6 Stator-to-housing interface

| Quantity | Value | Validity |
|---|---|---|
| **Thermal contact resistance (effective-air-gap method)** | **840 – 1 400 mm²·K/W** | Pressure-independent form |
| Equivalent interface conductance | **714 – 1 190 W/(m²·K)** **(computed:** 1/R, with R in m²·K/W = value×1e-6 **)** | |
| Equivalent air gap | **0.021 – 0.035 mm (computed:** g = R·k_air, k_air ≈ 0.025 W/m·K, i.e. 840e-6 × 0.025 = 21 µm **)** | Matches the 0.02–0.04 mm rule of thumb |
| **Validity limit of the pressure-independent air-gap model** | **< 500 kPa contact pressure** | Above this, the air-gap model **overestimates** TCR proportionally to pressure |
| **Actual pressure at a stator/housing interference fit** | **> 5 MPa** | 10× beyond the model's validity limit |

> **This is a real modelling trap.** The universally-quoted "0.02–0.04 mm equivalent air gap" comes from a pressure-independent model validated below 500 kPa, while a real shrink-fit stator sits above 5 MPa. Applying the standard figure to an interference-fit machine is **conservative** (it over-predicts the resistance and therefore over-predicts winding temperature). Use it for early sizing, but expect measured hardware to run cooler, and use a pressure-dependent TCR model if the interference fit is a design variable.

Critical LPTN input parameters, per the literature: contact resistances **between the impregnation, the liner, the laminations, and the housing** — four separate interfaces, all uncertain, all in series on the dominant heat path.

---

# EQUATIONS

## Core loss

**(1) Steinmetz equation** (volumetric)

```
P_v = C_m · f^α · B̂^β                                    [W/m³]
```
| Symbol | Meaning | Unit |
|---|---|---|
| `P_v` | time-average loss per unit volume | W/m³ |
| `C_m` | Steinmetz coefficient (material) | W·s^α/(T^β·m³) |
| `f` | excitation frequency | Hz |
| `B̂` | peak flux density (amplitude, not peak-to-peak) | T |
| `α` | frequency exponent | – |
| `β` | flux-density exponent | – |

**Validity:** sinusoidal flux only; single frequency; constant temperature. Typical NO silicon steel: α ≈ 1.0–1.6, β ≈ 1.8–2.2. Fitted coefficients are only valid inside the (f, B̂) box used for the fit — the classic failure mode is fitting on 50 Hz Epstein data and extrapolating to 1 kHz. Prefer per-decade coefficient sets, or use Eq. 3.

Divide by density ρ_d [kg/m³] for a W/kg basis.

**(2) Modified Steinmetz (iGSE) — for PWM / non-sinusoidal flux**

```
P_v = (1/T) ∫₀ᵀ k_i · |dB/dt|^α · (ΔB)^(β−α) dt

with   k_i = C_m / [ 2^(β−1) · (2π)^(α−1) · ∫₀^(2π) |cos θ|^α dθ ]
```
| Symbol | Meaning | Unit |
|---|---|---|
| `ΔB` | peak-to-peak flux excursion of the (sub)loop | T |
| `dB/dt` | instantaneous rate of change of flux density | T/s |
| `T` | fundamental period | s |
| `k_i` | derived iGSE coefficient | – |

**Validity:** any flux waveform, provided minor loops are extracted (e.g. by rainflow counting) and the underlying Steinmetz fit covers the relevant `dB/dt`. This is the correct form for an inverter-fed machine; plain Eq. 1 with a fundamental-frequency argument under-predicts loss significantly under PWM.

**(3) Bertotti three-term loss separation**

```
P_m = k_h · f · B̂^α  +  k_e · f² · B̂²  +  k_exc · f^1.5 · B̂^1.5      [W/kg]
       └ hysteresis ┘   └ classical eddy ┘   └   excess / anomalous  ┘
```
| Symbol | Meaning | Unit |
|---|---|---|
| `P_m` | specific total loss | W/kg |
| `k_h` | hysteresis coefficient | W·s/(T^α·kg) |
| `k_e` | classical eddy coefficient — **compute, do not fit** (Eq. 4) | W·s²/(T²·kg) |
| `k_exc` | excess-loss coefficient | W·s^1.5/(T^1.5·kg) |
| `α` | hysteresis exponent, ≈ 1.6–2.0 for NO steel | – |

**Validity:** sinusoidal induction, uniform flux through the sheet (i.e. below the skin-depth limit, Eq. 4b), below saturation. For **non-oriented** steel the literature finding is that **omitting `k_exc` (setting it to zero) improves accuracy** — the two-term fit is better conditioned. Retain `k_exc` for grain-oriented, amorphous, and nanocrystalline material, where domain-wall dynamics dominate.

**(4) Classical eddy coefficient — analytic, from Maxwell**

```
k_e = π² · t² / (6 · ρ · ρ_d)                            [W·s²/(T²·kg)]
```
| Symbol | Meaning | Unit |
|---|---|---|
| `t` | lamination thickness | m |
| `ρ` | electrical resistivity | Ω·m |
| `ρ_d` | mass density | kg/m³ |

**Validity:** requires the lamination to be thin relative to the skin depth. Check:

**(4b) Skin depth**
```
δ = sqrt( ρ / (π · f · µ_r · µ_0) )        with µ_0 = 4π×10⁻⁷ H/m
```
**Eq. 4 is valid while `t < 2δ`.** For 0.20 mm NO steel with ρ = 0.52 µΩ·m and µ_r ≈ 3000, δ ≈ 0.21 mm at 1 kHz, so `t = 0.20 mm ≈ δ` — **the thin-sheet assumption is already marginal at 1 kHz for 0.20 mm steel**, and fails outright at 5 kHz. This is the quantitative reason ultra-thin (0.10 mm) and 6.5 % Si grades exist.

**(5) Steinmetz/Bertotti with temperature** — loss in silicon steel typically **falls** ~0.05–0.1 %/K with temperature over 20–150 °C **(unverified)**, because resistivity rises. Magnet and copper losses rise. Do not assume all losses move the same direction with temperature.

## Jet impingement heat transfer

**(6) Martin (1977) — single round submerged nozzle, area-averaged Nusselt**

```
                D   1 − 1.1·(D/r)                    ½
Nu_avg = 2 · ( ─── )·──────────────────────── · Re      · (1 + 0.005·Re^0.55)^0.5 · Pr^0.42
                r   1 + 0.1·(H/D − 6)·(D/r)
```

| Symbol | Meaning | Unit |
|---|---|---|
| `Nu_avg` | area-averaged Nusselt number over a disk of radius `r` centred on the stagnation point, `Nu = h̄·D/k` | – |
| `h̄` | area-averaged convective HTC over that disk | W/(m²·K) |
| `D` | nozzle exit diameter | m |
| `r` | radius of the target disk over which the average is taken | m |
| `H` | nozzle-to-target standoff distance | m |
| `Re` | jet Reynolds number, `Re = V_jet·D/ν` (`V_jet` = mean nozzle exit velocity, m/s; `ν` = kinematic viscosity, m²/s) | – |
| `Pr` | Prandtl number, `Pr = ν/a = µ·cp/k` | – |
| `k` | fluid thermal conductivity | W/(m·K) |

**Validity range: `2.5 ≤ r/D ≤ 7.5`, `2 ≤ H/D ≤ 12`, `2×10³ ≤ Re ≤ 4×10⁵`.**
Notes: the geometric prefactor goes negative for `r/D > 1/1.1 ≈ 0.909`… no — read it as written: the term `1 − 1.1·D/r` is positive for `r/D > 1.1`, which the validity range guarantees. The `H/D − 6` term means performance is *flattest* near `H/D = 6`; this is the standoff to design to if the standoff cannot be held tightly. Martin's data base is air (Pr ≈ 0.7); the `Pr^0.42` exponent extrapolates to oil (Pr ~100) with real but bounded uncertainty — expect ±25 %.

**(7) Free-surface circular jet, stagnation-point Nusselt (Liu–Lienhard–Lombara type)**

```
Nu_0 = 0.745 · Re_D^0.5 · Pr^(1/3)            (unverified constant)
```
| Symbol | Meaning | Unit |
|---|---|---|
| `Nu_0` | stagnation-point Nusselt number, `h_0·D/k` | – |
| `Re_D` | `V_jet·D/ν` at the nozzle exit | – |

**Validity: `Pr > 0.15`; laminar-boundary-layer stagnation region; free-surface (liquid-into-gas) jet, not submerged.** Free-surface jet correlations of this class have been validated with three liquids spanning **`Pr` = 7 to 262**, which brackets ATF at 40–120 °C. This is the correlation to prefer for an *oil-into-air* end-winding jet, which is the actual physical situation in a wet-sump e-axle — the fluid is not submerged.

**(8) Womac et al. free-surface / submerged jet, area-averaged over a square target**

```
Nu_avg = C₁ · Re_d^m · Pr^0.4 · (A_r/A_t)  +  C₂ · Re_ℓ^n · Pr^0.4 · (1 − A_r/A_t)
         └── impingement zone ──┘             └──── wall-jet zone ────┘
```
| Symbol | Meaning | Unit |
|---|---|---|
| `A_r` | area of the impingement zone | m² |
| `A_t` | total heated target area | m² |
| `Re_d` | Reynolds number on nozzle diameter | – |
| `Re_ℓ` | Reynolds number on the wall-jet length scale | – |
| `C₁, C₂, m, n` | fitted constants **(unverified — retrieve from the original paper)** | – |

**Validity: `2 < H/d_n < 4`** (strictly). Womac's data are for FC-77 and water. The two-zone structure is the important part: it is why a jet array beats a single large jet at fixed flow — it maximises the fraction of area in the high-`h` impingement zone.

**(9) Spray cooling** — no closed-form correlation with the reliability of Eqs. 6–8. Use the measured envelope in §C.1 (7 300–11 800 W/m²·K) and treat HTC as a function of volumetric spray flux `Q″` [m³/(m²·s)] and Sauter mean diameter, both nozzle-specific. **(unverified)**

## Jacket / channel convection

**(10) Dittus–Boelter**
```
Nu = 0.023 · Re^0.8 · Pr^n          n = 0.4 (fluid heated), 0.3 (fluid cooled)
h = Nu · k / D_h
```
| Symbol | Meaning | Unit |
|---|---|---|
| `D_h` | hydraulic diameter, `4A/P` | m |
| `Re` | `ρ·V·D_h/µ` | – |

**Validity: `Re > 10⁴`, `0.6 < Pr < 160`, `L/D_h > 10`, moderate wall–bulk temperature difference.** For a motor jacket with EG/water at Pr ≈ 12–32 this is acceptable. **For oil channels (Pr > 100) it is out of validity — use Eq. 11.**

**(11) Gnielinski — transitional and high-Pr**
```
        (f/8)·(Re − 1000)·Pr
Nu = ──────────────────────────────
     1 + 12.7·(f/8)^0.5·(Pr^(2/3) − 1)

with  f = (0.79·ln Re − 1.64)^(−2)          (Petukhov friction factor)
```
**Validity: `3×10³ < Re < 5×10⁶`, `0.5 < Pr < 2000`.** This is the correct default for both EG/water and oil channels, and it degrades gracefully into the transition region where a motor jacket often actually operates.

## Magnet temperature dependence

**(12)**
```
Br(T)  = Br(20) · [ 1 + α_Br·(T − 20)/100 ]
HcJ(T) = HcJ(20) · [ 1 + β_HcJ·(T − 20)/100 ]
```
`α_Br`, `β_HcJ` in **%/K**, `T` in °C. Reversible only; irreversible loss occurs if the operating point crosses the demagnetisation knee at temperature, which Eq. 12 does **not** capture. A demagnetisation check requires the full B–H curve family, not just Br and HcJ.

## Rotor mechanics

**(13) Hoop stress in a thin rotating ring (retaining sleeve, first-order)**
```
σ_θ = ρ_s · v² = ρ_s · (ω·R)²
```
| Symbol | Meaning | Unit |
|---|---|---|
| `σ_θ` | hoop stress | Pa |
| `ρ_s` | sleeve density | kg/m³ |
| `v` | surface (tip) speed | m/s |
| `ω` | angular velocity | rad/s |
| `R` | mean sleeve radius | m |

**Validity:** thin ring, `t/R << 1`, no magnet load. The full design case adds the magnets' centrifugal load and the interference-fit pre-load, and must be evaluated **hot** (where pre-load is lowest, because the CFRP hoop CTE is near zero or negative while the steel/magnet CTE is positive). Note the striking implication: hoop stress depends on tip speed **only**, not on diameter or speed separately — which is why "m/s tip speed" is the universal figure of merit for rotor retention.

---

# D. Structural / Rotor

## D.1 Metals and CFRP

| Property | Unit | Ti-6Al-4V (Gr.5, annealed) | 42CrMo4 / AISI 4140–4340 (Q&T) | 7075-T6 | CFRP T700/epoxy, hoop-wound | CFRP T800/epoxy, hoop-wound |
|---|---|---|---|---|---|---|
| Density ρ | kg/m³ | **4 430** | **7 850** | **2 810** | 1 550–1 600 **(unv.)** | 1 580–1 620 **(unv.)** |
| Young's modulus (isotropic / hoop, E₁) | GPa | **114** | **210** | **71.7** | 125–135 **(unv.)** | 155–165 **(unv.)** |
| Radial / transverse modulus E₂ | GPa | – | – | – | **8–10 (unv.)** | **8–10 (unv.)** |
| In-plane shear modulus G₁₂ | GPa | 44 **(unv.)** | 80 **(unv.)** | 26.9 **(unv.)** | 4–5 **(unv.)** | 4–5 **(unv.)** |
| Poisson's ratio ν₁₂ | – | 0.34 **(unv.)** | 0.29 **(unv.)** | 0.33 **(unv.)** | 0.30 **(unv.)** | 0.30 **(unv.)** |
| Yield strength Rp0.2 | MPa | **~830 (annealed min); ~1 100 (STA)** | **≥ 650** (Q&T; 900–1 100 in small sections **(unv.)**) | **480–505** | n/a (brittle) | n/a |
| UTS (hoop, fibre direction) | MPa | 895–950 **(unv.)** | 900–1 200 **(unv.)** | 540–570 **(unv.)** | **2 200–2 550 (unv.)** | **2 800–3 000 (unv.)** |
| UTS transverse | MPa | – | – | – | **40–60 (unv.)** | **40–60 (unv.)** |
| **Allowable design stress (hoop)** | MPa | ~550 (0.67×Ry) **(unv.)** | ~430 (0.67×Ry) **(unv.)** | ~320 (0.67×Ry) **(unv.)** | **~1 379 (200 ksi)** — documented sleeve design limit | ~1 500 **(unv.)** |
| Safety factor implied at that allowable | – | 1.5 | 1.5 | 1.5 | **~8× vs. IM7 90/10 tensile strength** (documented practice for sleeves) | – |
| Max service temperature | °C | **~350** | **420** | **~120** (strength falls ~40 % at 150 °C) | 150–180 (epoxy Tg-limited) **(unv.)** | 150–180 **(unv.)** |
| CTE (hoop / longitudinal) | 1/K | **8.6e-6** | **12.2e-6** | **23.6e-6** | **≈ 0 to −0.5e-6 (unv.)** | **≈ 0 to −0.5e-6 (unv.)** |
| CTE radial / transverse | 1/K | – | – | – | **25–35e-6 (unv.)** | **25–35e-6 (unv.)** |
| Thermal conductivity | W/(m·K) | 6.7 **(unv.)** | 42 **(unv.)** | 130 **(unv.)** | 4–8 axial / 0.5–1 radial **(unv.)** | 4–8 / 0.5–1 **(unv.)** |
| Electrical conductivity | – | poor (eddy-loss friendly) | ferromagnetic — **flux-carrying, choose deliberately** | good conductor — eddy losses in sleeve **(unv.)** | anisotropic, moderately conductive along fibre **(unv.)** | same |
| Magnetic | – | non-magnetic | **ferromagnetic** | non-magnetic | non-magnetic | non-magnetic |

**Documented CFRP sleeve practice:** hoop stress in a carbon-fibre sleeve is limited to **200 ksi (1 379 MPa)**; IM7 90/10 layup tensile strength is about **8× the maximum stress in the material**; quality control is by **spin testing plus FEA verification, validated to 250 m/s rotor tip speed.**

**Sleeve selection logic.** Compare on `σ_allow/ρ` (specific strength), because Eq. 13 gives `v_max = sqrt(σ_allow/ρ)`:

| Sleeve material | σ_allow (MPa) | ρ (kg/m³) | **v_max = √(σ/ρ) (m/s)** **(computed)** |
|---|---|---|---|
| Ti-6Al-4V | 550 | 4 430 | **352** |
| 42CrMo4 | 430 | 7 850 | **234** |
| 7075-T6 | 320 | 2 810 | **337** |
| Inconel 718 | 800 **(unv.)** | 8 190 **(unv.)** | **313** |
| **CFRP T700 hoop** | 1 379 | 1 575 | **936** |
| **CFRP T800 hoop** | 1 500 | 1 600 | **968** |

The bare hoop-stress figure of merit shows CFRP at ~2.7× the tip speed of any metal — this is why every >200 m/s PM rotor uses a composite sleeve. But two second-order effects dominate real designs and must be in the model:
1. **The near-zero hoop CTE of CFRP is a liability, not an asset.** As the rotor heats, the steel hub and magnets expand while the sleeve does not, so interference pre-load *increases* — good for retention, but the sleeve must survive the sum of thermal and centrifugal hoop stress. Conversely a cold-assembled sleeve on a shrinking hub can go slack; check both extremes.
2. **The radial modulus is ~15× lower than the hoop modulus** (8–10 GPa vs. 125–165 GPa), so the sleeve is compliant through-thickness. A thick sleeve does not distribute pre-load uniformly and the inner surface can debond.
3. CFRP's radial thermal conductivity of ~0.5–1 W/m·K makes the sleeve a **thermal blanket over the magnets** — the component most sensitive to temperature is now behind an insulator. Rotor thermal modelling is mandatory, not optional, on a sleeved machine.

## D.2 Bearings for 15 000–20 000 rpm

| Bearing / lubrication | DN limit (mm·rpm) | Basis |
|---|---|---|
| **Steel angular contact ball, grease** | **~1.0 × 10⁶** | Standard limit for all-steel |
| **Hybrid ceramic (Si₃N₄ balls / steel rings), grease** | **> 1.5 × 10⁶** | Confirmed; 1.2–1.5× the steel limit |
| **Hybrid ceramic, oil-air (oil-mist / minimum quantity)** | **~2.0 – 2.5 × 10⁶** | Machine-tool spindles "routinely operate at DN values exceeding 2.0 × 10⁶" |
| **Hybrid ceramic, oil-jet / under-race** | **~3.0 – 4.0 × 10⁶ (unverified)** | Aerospace mainshaft practice |
| **Full ceramic** | **~2.0 × 10⁶ (unverified)** | Limited by ring material, not balls |
| Speed increase vs. steel, general | **up to +50 % rpm** | Confirmed |

**Sizing check for the target application.** DN = bore diameter (mm) × speed (rpm):

| Bore d (mm) | @15 000 rpm | @20 000 rpm | Verdict |
|---|---|---|---|
| 30 | 0.45 × 10⁶ | 0.60 × 10⁶ | Grease, steel or hybrid — comfortable |
| 40 | 0.60 × 10⁶ | 0.80 × 10⁶ | Grease, steel marginal at 20 krpm; **hybrid + grease is comfortable** |
| 50 | 0.75 × 10⁶ | **1.00 × 10⁶** | **At the steel/grease limit at 20 krpm**; hybrid required |
| 60 | 0.90 × 10⁶ | **1.20 × 10⁶** | Hybrid ceramic + grease; oil-air preferred |
| 70 | **1.05 × 10⁶** | **1.40 × 10⁶** | Hybrid + oil-air |
| 80 | **1.20 × 10⁶** | **1.60 × 10⁶** | Hybrid + oil-air mandatory |

**Design read:** at 15 000–20 000 rpm, a **hybrid ceramic angular contact bearing with grease lubrication is sufficient up to roughly 60–70 mm bore**. Only above ~70 mm bore at 20 krpm does oil-air become necessary — and a 70 mm bore implies a large shaft, which usually means the machine is big enough that a shaft-diameter reduction is the better fix. The reason hybrids work: Si₃N₄ has ~40 % of steel's density, so ball centrifugal load (and therefore outer-race contact stress and frictional heat) drops correspondingly at a given speed.

Also relevant to a PM machine specifically: **hybrid ceramic bearings are electrically insulating through the rolling elements**, which suppresses inverter-driven shaft-current EDM damage. On an inverter-fed machine this is often a stronger argument for hybrids than the speed capability is.

---

# Priority Datasheets To Pull

The four documents that would convert the largest number of **(unverified)** entries to verified, in order of payoff:

1. **JFE Super Core catalogue F1E-002** — `https://www.jfe-steel.co.jp/en/products/electrical/catalog/f1e-002.pdf` → resolves the entire §A.1.1 loss matrix and the 5.7/11.3 W/kg discrepancy.
2. **JFE magnetic property curves F2E-001** — `https://www.jfe-steel.co.jp/en/products/electrical/catalog/f2e-001.pdf` → gives the full W(B,f) surface for 10JNEX900/10JNHF600, which is what a Steinmetz/Bertotti fit actually needs.
3. **Höganäs Somaloy 3P and 5P material data** — `.../somaloy_somaloy-3p-material-data_2273hog.pdf` and `..._5p-..._2274hog.pdf` → resolves all of §A.4.
4. **VAC cobalt-iron product information** — `https://vacuumschmelze.com/03_Documents/Brochures/Product%20Information%20Cobalt-Iron%20Alloys.pdf` → resolves all of §A.2.

Also worth pulling: Arnold N45SH datasheet (magnet demagnetisation curves at temperature), Eclipse Magnetics NdFeB and SmCo grade tables, DuPont Nomex 410 technical data, thyssenkrupp powercore product range PDF, and steel-n.com's NO grade PDF.

---

# Sources

## Electrical steel
- JFE Steel — Super Core, electrical steel sheets for high-frequency application (catalogue F1E-002): https://www.jfe-steel.co.jp/en/products/electrical/catalog/f1e-002.pdf
- JFE Steel — Magnetic Property Curves, JNEX-CORE / JNHF-CORE (catalogue F2E-001): https://www.jfe-steel.co.jp/en/products/electrical/catalog/f2e-001.pdf
- JFE Steel — Super Core product page: https://www.jfe-steel.co.jp/en/products/electrical/product/supercore/index.php
- JFE Steel — High Silicon Steel Sheets Realizing Excellent High Frequency Characteristics (JFE Technical Report 6): https://www.jfe-steel.co.jp/en/research/report/006/pdf/006-04.pdf
- JFE Steel — Recent Progress of High Silicon Electrical Steel in JFE Steel (Technical Report 21): https://www.jfe-steel.co.jp/en/research/report/021/pdf/021-04.pdf
- JFE Steel — Si Gradient Super Core JNSF (Technical Report 21): https://www.jfe-steel.co.jp/en/research/report/021/pdf/021-10.pdf
- JFE Steel — Electrical Steels for EV Traction Motors (Technical Report 27): https://www.jfe-steel.co.jp/en/research/report/027/pdf/027-20.pdf
- JFE Steel — Recent Development of Non-Oriented Electrical Steel (Technical Report 31): https://www.jfe-steel.co.jp/en/research/report/031/pdf/031-03.pdf
- JFE Steel — N-CORE non-oriented electrical steel: https://www.jfe-steel.co.jp/en/products/electrical/product/n_core.php
- 10JNEX900 distributor technical page: https://10jnex900.com/
- 10JNHF600 distributor technical page: https://10jnhf600.com/index.html
- JFE magnetostriction paper (10JNEX900 / 10JNHF600): https://www.10jnhf600.com/files/JFE_10JNEX900_10JNHF600_Magnetostriction.pdf
- thyssenkrupp Steel — powercore traction NGO 025-125Y420: https://www.thyssenkrupp-steel.com/en/products/electrical-steel/electrical-steel-non-grain-oriented/powercore-traction-for-high-frequencies-and-e-mobility/powercore-traction-ngo-025-125y420/powercore-traction-ngo025-125y420.html
- thyssenkrupp Steel — powercore traction family: https://www.thyssenkrupp-steel.com/en/products/electrical-steel/electrical-steel-non-grain-oriented/powercore-a-3.html
- thyssenkrupp Steel — NO electrical steel product range (PDF): https://www.thyssenkrupp-steel.com/media/content_1/publikationen/lieferprogramme/thyssenkrupp_product-range_no-electrical-steel_powercore_steel_en.pdf
- thyssenkrupp — "The secret star of the energy and mobility transition": https://www.thyssenkrupp.com/en/stories/engineering-and-innovation/the-secret-star-of-the-energy-and-mobility-transition-powercorer-electrical-steel
- ArcelorMittal — iCARe Save: https://automotive.arcelormittal.com/products/flat/electrical_steels/icare_save
- ArcelorMittal — electrical steels overview: https://industry.arcelormittal.com/products-solutions/Products_in_the_spotlight/electricalsteels
- Nippon Steel — Non-Oriented Electrical Steel Sheets: https://www.nipponsteel.com/en/product/electrolytic-tinplate/01.html
- Nippon Steel — Non-oriented Electrical Steel Sheet and Its Application (Technical Report 122): https://www.nipponsteel.com/en/tech/report/pdf/122-25.pdf
- POSCO — Non-oriented electrical steel NO (2020): https://www.steel-n.com/e-sales/pdf/en/e_electrical_pdf_NO_2020.pdf
- Nippon Kinzoku — ultra-thin NGO strip ST series: https://www.nipponkinzoku.co.jp/en/products/st-series
- Review of Fe-6.5 wt%Si high silicon steel (ScienceDirect): https://www.sciencedirect.com/science/article/pii/S0304885318331330

## Loss modelling
- Steinmetz's equation (Wikipedia): https://en.wikipedia.org/wiki/Steinmetz%27s_equation
- Core-Loss Prediction for Non-Oriented Electrical Steels Based on the Steinmetz Equation with Fixed Coefficients: https://www.researchgate.net/publication/274872702_Core-Loss_Prediction_for_Non-Oriented_Electrical_Steels_Based_on_the_Steinmetz_Equation_Using_Fixed_Coefficients_With_a_Wide_Frequency_Range_of_Validity
- Improved Model Based on the Modified Steinmetz Equation for NO steels at elevated temperature/frequency: https://www.researchgate.net/publication/318383758_Improved_Model_Based_on_the_Modified_Steinmetz_Equation_for_Predicting_the_Magnetic_Losses_in_Non-Oriented_Electrical_Steels_That_is_Valid_for_Elevated_Temperatures_and_Frequencies
- Verification of Bertotti's Loss Model for Non-Standard Excitation (Acta Physica Polonica A): https://przyrbwn.icm.edu.pl/APP/PDF/136/app136z5p08.pdf
- Linking the differential permeability and loss coefficients in Bertotti's approach: https://www.sciencedirect.com/science/article/abs/pii/S0304885319330422
- Power losses in nanocrystalline and thin-gauge NO SiFe for high-speed machines (EPJ AP): https://www.epjap.org/articles/epjap/full_html/2019/02/ap180300/ap180300.html
- Core Losses under DC Bias Condition based on Steinmetz Parameters (ETH): https://www.ams-publications.ee.ethz.ch/uploads/tx_ethpublications/IPEC_JMU.pdf
- Hysteresis Loss: Estimation, Modeling, and the Steinmetz Equation: https://www.allaboutcircuits.com/technical-articles/hysteresis-loss-estimation-modeling-and-the-steinmetz-equation/

## Cobalt-iron
- VACUUMSCHMELZE — 49 % Cobalt-Iron VACOFLUX and VACODUR: https://www.vacuumschmelze.com/products/soft-magnetic-materials-and-stamped-parts/49-cobalt-iron-vacoflux-and-vacodur
- VAC — Soft Magnetic Cobalt-Iron Alloys product information (PDF): https://vacuumschmelze.com/03_Documents/Brochures/Product%20Information%20Cobalt-Iron%20Alloys.pdf
- VAC — VACODUR 49 datasheet: https://vacuumschmelze.com/03_Documents/Brochures/Datasheet%20VACODUR%2049.pdf
- VAC — VACOFLUX 48 datasheet: https://vacuumschmelze.com/03_Documents/Brochures/Datasheet%20VACOFLUX%2048.pdf
- VACODUR 49 preliminary datasheet (mirror): https://fusoh-aviation.co.jp/wp/wp-content/uploads/2020/10/vac_VACODUR_49_.pdf
- VAC Fe-Co alloys consolidated datasheet (e-Magnetica mirror): https://e-magnetica.pl/database-em/01_Soft/Cobalt_alloys/Vacuumschmelze/Vacuumschmelze_Vacoflux_Vacodur_48_49_50_S_Plus_27_17_18_HR_9_CR_Fe-Co_2021.pdf
- HIPERCO 50 soft magnetic alloy datasheet (Nicofe): https://www.nicofe.com/wp-content/uploads/2025/12/IAW3078-Nicofe-Hiperco-50-A4-datasheet-v2.pdf

## Nanocrystalline / amorphous
- VAC — Nanocrystalline VITROPERM EMC products: https://gmw.com/wp-content/uploads/2019/03/NanocrystallineVITROPERM-EMC-Products-2016_01.pdf
- Evaluation of Nanocrystalline Materials, Amorphous Alloys and Ferrites for Magnetic Pulse Compression: https://www.researchgate.net/publication/224280522_Evaluation_of_Nanocrystalline_Materials_Amorphous_Alloys_and_Ferrites_for_Repetitive-Magnetic_Pulse_Compression_Applications
- Metglas — Amorphous Alloys for Transformer Cores: https://metglas.com/wp-content/uploads/2016/12/Amorphous-Alloys-for-Transformer-Cores-.pdf
- Metglas POWERLITE inductor cores technical bulletin: https://www.hilltech.com/pdf/Hitachi/Datasheets/POWERLITE_C-Cores_Technical_Bulletin.pdf
- Metglas POWERLITE forms technical bulletin: https://www.hilltech.com/pdf/Hitachi/Datasheets/POWERLITE_Forms_Technical_Bulletin.pdf

## Soft magnetic composite
- Höganäs — Somaloy 3P material data: https://www.hoganas.com/globalassets/downloads/libary/somaloy_somaloy-3p-material-data_2273hog.pdf
- Höganäs — Somaloy 5P material data: https://www.hoganas.com/globalassets/downloads/libary/somaloy_somaloy-5p-material-data_2274hog.pdf
- Höganäs — Somaloy 1P material data: https://www.hoganas.com/globalassets/downloads/libary/somaloy_somaloy-1p-material-data_2272hog.pdf
- Höganäs — Modelling and experimental analysis of SMC core losses (PM2014): https://www.hoganas.com/globalassets/downloads/technical-papers/smc/pm14_13_orlando_2014_modelling_and_experimenting_analysis_of_core_losses_ye.pdf
- Höganäs — Somaloy 3P product page: https://www.hoganas.com/en/powder-technologies/products/somaloy/somaloy-3p/
- Mechanical Strength and Energy Losses Optimization of Somaloy 3P 700-Based Components (IEEE): https://ieeexplore.ieee.org/document/7378512/
- Magnetic Properties Measurement of Somaloy 700 (5P) (UTS thesis): https://opus.lib.uts.edu.au/bitstream/10453/133200/2/02whole.pdf

## Permanent magnets
- Arnold Magnetic Technologies — N45SH datasheet: https://www.arnoldmagnetics.com/wp-content/uploads/2017/11/N45SH-151021.pdf
- Arnold Magnetic Technologies — full grade catalogue with α(Br), β(HcJ): https://www.arnoldmagnetics.com/wp-content/uploads/2017/10/Catalog-151021.pdf
- Eclipse Magnetics — sintered NdFeB grades data: https://www.eclipsemagnetics.com/site/assets/files/23180/neodymium_grades_data.pdf
- Eclipse Magnetics — SmCo datasheet: https://www.eclipsemagnetics.com/site/assets/files/19544/eclipsemagnetics_smco_datasheet.pdf
- HGT Advanced Magnets — sintered NdFeB specifications: https://www.advancedmagnets.com/wp-content/uploads/2020/07/Sintered-Neodymium-Iron-Boron-NdFeB-Magnets-Specifications.pdf
- Neorem — physical properties of sintered NdFeB at 20 °C: https://neorem.fi/wp-content/uploads/2023/02/NdFeB_PhysicalProperties_of_NdFeB_material.pdf
- thyssenkrupp Magnettechnik — NdFeB product information: https://ucpcdn.thyssenkrupp.com/_binary/UCPthyssenkruppBAMXSchulteMicrositeMagnettechnik/en/downloads/link-thyssenkruppMagnettechnik-Factsheet-neodym-magnets.pdf
- thyssenkrupp Magnettechnik — SmCo product information: https://ucpcdn.thyssenkrupp.com/_binary/UCPthyssenkruppBAMXSchulteMicrositeMagnettechnik/en/downloads/link-thyssenkruppMagnettechnik-Factsheet-samarium-cobalt-magnets.pdf
- Bunting / e-Magnets UK — grain boundary diffused neodymium data sheet: https://e-magnetsuk.com/wp-content/uploads/2022/12/Bunting-Grain-Boundary-Diffused-Neodymium-Data-Sheet-V3.pdf
- Goudsmit Magnetics — neodymium grades (2025-08-22): https://www.goudsmitmagnetics.com/uploads/pdf/Neodymium_grades_available_at_Goudsmit_20250822_1547.pdf
- Magnetics & Materials LLC — Grain Boundary Diffusion technical note: https://magmatllc.com/PDF/Grain%20Boundary%20Diffusion%20-%20v.2%20-%202023-10-29.pdf
- Maximum operating temperature by NdFeB grade: https://www.zhiyumagnet.com/news/what-is-the-maximum-operating-temperature-for-different-grades-of.html
- Intemag — SmCo magnetic materials properties data: https://www.intemag.com/smco-magnetic-materials-properties-data
- Dura Magnetics — SmCo grade chart: https://www.duramag.com/samarium-cobalt-magnets-smco/available-samarium-cobalt-magnet-grades/
- High-temperature electrical resistivity of sintered SmCo magnets (ScienceDirect): https://www.sciencedirect.com/science/article/pii/S0304885324008175

## GBD and rare-earth supply
- Proterial — Develops High-Performance Heavy-Rare-Earth-Free Neodymium Sintered Magnet for EV Driving Motors (2025-07-22): https://www.proterial.com/e/press/2025/n0722b.html
- Rare Earth Exchanges — Japan's Proterial unveils heavy rare earth-free EV magnet: https://rareearthexchanges.com/news/japans-proterial-unveils-heavy-rare-earth-free-ev-magnet-a-real-breakthrough-or-hype/
- Rare Earth Exchanges — Grain boundary diffusion improves HRE efficiency but physics still draws the line: https://rareearthexchanges.com/news/grain-boundary-diffusion-improves-heavy-rare-earth-efficiency-but-physics-still-draws-the-line/
- Toward Maximum Utilization of Heavy Rare Earths in Sintered Nd–Fe–B Magnets by GBD Source and Application Area Optimization (Adv. Eng. Mater. 2025): https://advanced.onlinelibrary.wiley.com/doi/pdf/10.1002/adem.202501145
- Enhanced Coercivity and Tb Distribution Optimization via TbF3 GBD Facilitated by Ga (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC11820678/
- Coercivity enhancement with reduced Tb usage via Tb-Ce-Al-Cu-Zn GBD (ScienceDirect): https://www.sciencedirect.com/science/article/abs/pii/S0304885323012362
- Reduction in HRE Diffusion Sources via GBD of Dy70Ce70−xCu30 (PMC): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11642011/
- Effect of Grain Size on Diffusion Efficiency in Tb GBD (PMC): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9319959/
- Rare Earth Mining — Dysprosium & NdPr oxide prices, February 2026: https://rare-earth-mining.com/rare-earth-market-pricing-analysis-february-2026/
- Rare Earth Mining — Rare earth market outlook March 2026: https://rare-earth-mining.com/rare-earth-market-pricing-analysis-march-2026/
- Rare Earth Mining — Rare earth market June 2026: https://rare-earth-mining.com/rare-earth-market-june-2026/
- Rare Earth Mining — Terbium price 2026: https://rare-earth-mining.com/terbium-price/
- Rare Earth Mining — Shin-Etsu rare earth profile: https://rare-earth-mining.com/shin-etsu-rare-earth/
- Rare Earth Mining — TDK rare earth magnets: https://rare-earth-mining.com/tdk-rare-earth-magnets/
- Rare Earth Exchanges — China rare earth price index near highs: https://rareearthexchanges.com/news/china-rare-earth-price-index-holds-near-recent-highs-as-heavy-rare-earths-remain-strategically-tight/
- The Oregon Group — Rare earth prices surge as China keeps export restrictions: https://theoregongroup.com/commodities/rare-earths/rare-earth-prices-surge-as-china-keeps-export-restrictions/
- Critical Minerals News — NdPr spot price, history and forecast: https://critical-minerals-news.com/rare-earths-price/
- MMTA — Rare earths at inflection point: https://mmta.co.uk/rare-earths-at-inflection-point/

## Cooling
- Parametric evaluation of impinging oil jet cooling (QMUL open access): https://qmro.qmul.ac.uk/xmlui/bitstream/handle/123456789/106395/1-s2.0-S1359431125010063-main.pdf?sequence=3&isAllowed=y
- Experimental and numerical study of stator end-winding cooling with impinging oil jet (ScienceDirect): https://www.sciencedirect.com/science/article/abs/pii/S1359431122016325
- Thermal Management of High-Power Electric Machines (>100 kW) Using Oil Spray Cooling (MDPI Machines): https://www.mdpi.com/2075-1702/14/1/119
- Thermal management of EV driving motor with oil spray cooling — spray locations and oil types (ScienceDirect): https://www.sciencedirect.com/science/article/abs/pii/S1359431124009025
- Heat transfer and economic characteristics of direct oil cooling under driving cycles (ScienceDirect): https://www.sciencedirect.com/science/article/abs/pii/S1359431124022762
- A hybrid oil cooling strategy for thermal management of high power density PMSMs (ScienceDirect): https://www.sciencedirect.com/science/article/pii/S2214157X25018659
- NREL — Convective Heat Transfer Coefficients of Automatic Transmission Fluid Jets: https://docs.nrel.gov/docs/fy15osti/63969.pdf
- Single-phase free-surface fan jet impingement with ATF (ScienceDirect): https://www.sciencedirect.com/science/article/abs/pii/S001793102033667X
- Local heat transfer, free-surface impinging jet from a circular straight pipe nozzle (ScienceDirect): https://www.sciencedirect.com/science/article/abs/pii/S001793102300159X
- Jet Impingement Heat Transfer: Physics, Correlations, and Numerical Modeling (contains the Martin correlation and its validity range): https://www.idc-online.com/technical_references/pdfs/chemical_engineering/Jet%20Impingement%20Heat%20Transfer%20Ch06-P020039.pdf
- Thermopedia — Impinging Jets: https://www.thermopedia.com/content/872/
- Prandtl-number effects and generalized correlations for confined and submerged jet impingement (ScienceDirect): https://www.sciencedirect.com/science/article/abs/pii/S0017931001000035
- Free and Submerged Jet Impingement Heat Transfer (Nexalus): https://www.nexalus.com/wp-content/uploads/2021/08/Free-and-Submerged-Jet-Impingement-Heat-Transfer.pdf
- A survey of Nusselt number correlations for impinging jets (COBEM 2007): https://abcm.org.br/anais/cobem/2007/pdf/COBEM2007-0070.pdf
- Cooling Technologies for High Power Density Electrical Machines for Aviation Applications (MDPI Energies): https://doi.org/10.3390/en12234579
- Thermal Finite-Element Model of an Electric Machine Cooled by a Spray (arXiv): https://arxiv.org/pdf/2410.21875
- Influence of different direct cooling systems on IPM traction machine performance (Warwick WRAP): https://wrap.warwick.ac.uk/id/eprint/181822/13/WRAP-influence-different-direct-cooling-systems-interior-permanent-magnet-traction-machine-performance-2023.pdf
- Fraunhofer IFAM — Direct conductor cooling: https://www.ifam.fraunhofer.de/en/magazine/direct-conductor-cooling.html
- NASA NTRS — Thermal Analysis of Potted Litz Wire for High-Power-Density Aerospace Machines: https://ntrs.nasa.gov/api/citations/20190030263/downloads/20190030263.pdf
- DuPont Nomex 410 slot insulation data (distributor mirror): https://www.bevi.com/@/File/Get/?id=939&download=0
- E-motor 400–800 V insulation and thermal management for hairpin stator slot liner: https://www.electricmotorengineering.com/e-motor-400-800v-insulation-thermal-management-for-hairpin-stator-slot-liner/
- Experimental Characterization and Modeling of TCR of Stator-to-Cooling-Jacket Interface Under Interference Fit (ASME JTSEA): https://asmedigitalcollection.asme.org/thermalscienceapplication/article/10/4/041016/369591/Experimental-Characterization-and-Modeling-of
- NREL — Electric Motor Thermal Management R&D: https://docs.nrel.gov/docs/fy15osti/63004.pdf
- Solving the more difficult aspects of electric motor thermal analysis (Staton et al.): https://www.researchgate.net/publication/4022631_Solving_the_more_difficult_aspects_of_electric_motor_thermal_analysis
- Engineering ToolBox — ethylene glycol heat-transfer fluid properties: https://www.engineeringtoolbox.com/ethylene-glycol-d_146.html
- Thermal, conductivity, density, viscosity and Prandtl numbers of ethylene glycol–water mixtures: https://www.researchgate.net/publication/230074410_Thermal_Conductivity_Density_Viscosity_and_Prandtl-Numbers_of_Ethylene_Glycol-Water_Mixtures
- Shell — introduction to e-fluids and e-greases: https://www.shell.com/business-customers/industrial-lubricants-and-specialty-fluids-for-business/products/shell-efluids/introduction-to-e-fluids-and-e-greases.html
- Lubes'N'Greases — Electrical fluid properties for EVs: https://www.lubesngreases.com/electric-vehicles/article/electrical-fluid-properties-for-evs/
- Infineum Insight — e-fluids strike the right balance: https://infineuminsight.com/en-gb/articles/transmissions/e-fluids-strike-the-right-balance
- Castrol ATF TQ DIII product and technical data: https://msdspds.castrol.com/bpglis/fusionpds.nsf/files/7a0993b5adceed208025770c00428458/$file/atf%20tq%20diii.pdf

## Structural and bearings
- Carpenter Technology — Titanium Alloy Ti 6Al-4V datasheet: https://www.carpentertechnology.com/hubfs/7407324/Material%20Saftey%20Data%20Sheets/Ti%206Al-4V.pdf
- Rolled Alloys — 6Al-4V titanium data sheet: https://www.rolledalloys.com/wp-content/uploads/6AL4V_Data-sheet.pdf
- Kyocera SGS — Ti-6Al-4V (Grade 5) data sheet: https://kyocera-sgstool.co.uk/titanium-resources/titanium-information-everything-you-need-to-know/ti-6al-4v-grade-5-titanium-alloy-data-sheet/
- Siderticino — 42CrMo4 technical specifications: https://siderticino.it/en/steel-datasheets/42crmo4/
- Xometry — Steel 1.7225 / 42CrMo4 data sheet: https://xometry.pro/wp-content/uploads/2023/09/Stainless-steel-1.7225.pdf
- MakeItFrom — EN 1.7225 (42CrMo4): https://www.makeitfrom.com/material-properties/EN-1.7225-42CrMo4-Chromium-Molybdenum-Steel
- Total Materia — 42CrMo4 properties, composition and uses: https://www.totalmateria.com/en-us/material/1050174
- Gabrian — 7075 aluminum alloy properties (PDF): https://www.gabrian.com/wp-content/uploads/2018/09/7075-Aluminum-Alloy-Properties.pdf
- 7075 aluminium alloy (Wikipedia): https://en.wikipedia.org/wiki/7075_aluminium_alloy
- The World Material — AA 7075-T6 properties: https://www.theworldmaterial.com/al-7075-aluminum-alloy/
- Development of carbon-fibre-reinforced composite rotor sleeves for high-speed multi-layer ferrite-based IPM motors (Mississippi State): https://scholarsjunction.msstate.edu/td/7002/
- Jota International — What is a carbon wrap motor? (200 ksi hoop limit, 250 m/s tip speed): https://jotaintl.com/what-is-a-carbon-wrap-motor/
- KIT — Sleeves for protecting high-speed rotors: https://publikationen.bibliothek.kit.edu/1000125982/128560422
- GMN Bearing USA — High-speed ceramic ball bearing advantages: https://www.gmnbt.com/ceramic-ball-bearing-advantages/
- PIB Sales — Applications of hybrid bearings: https://pibsales.com/bearings/application-hybrid-bearings/
- LILY Bearing — Full vs hybrid ceramic bearings: https://www.lily-bearing.com/resources/blog/full-vs-hybrid-ceramic-bearings
