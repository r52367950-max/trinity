"""
Parametric geometry definition for the TRINITY TAF-500.

Topology: dual-rotor / single-stator yokeless axial-flux permanent magnet
machine ("YASA" arrangement) with Halbach-array rotors.

Axial build order, from the drive end:

    +-------------------------------------------------+
    |  rotor A: Ti carrier | back iron | Halbach ring  |
    |  ---------------- air gap g --------------------  |
    |  stator: 18 segmented teeth + tooth-wound coils   |
    |  ---------------- air gap g --------------------  |
    |  rotor B: Halbach ring | back iron | Ti carrier   |
    +-------------------------------------------------+

Because the stator has no yoke, the main flux path is purely axial through the
tooth: it leaves a north pole on rotor A, crosses the gap, passes axially
through a tooth, crosses the second gap into a south pole on rotor B, and
returns circumferentially through the rotor back iron.  That is what removes
the stator yoke mass and gives the topology its torque density.

Sign and coordinate conventions
-------------------------------
* ``z`` is the machine axis; z = 0 is the stator mid-plane.
* ``theta`` is mechanical angle, positive counter-clockwise viewed from the
  drive end.
* Electrical angle = ``p * theta``.
* All lengths are metres in the dataclass; helper properties ending in ``_mm``
  return millimetres for drawing and reporting use.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict

from .materials import (
    DEFAULT_MATERIALS,
    Coolant,
    Magnet,
    SoftMagnetic,
    Structural,
    Conductor,
)

TWO_PI = 2.0 * math.pi


@dataclass
class Geometry:
    """Complete parametric description of the machine's active and structural
    geometry.  Every dimension that appears on a drawing is derived from this
    object, so the CAD model, the drawings and the simulation can never drift
    apart.
    """

    # ---- Active electromagnetic geometry -------------------------------
    R_out: float = 0.1550          # m, active outer radius
    lam: float = 0.560             # -, diameter ratio R_in / R_out
    n_slots: int = 18              # stator teeth
    n_poles: int = 16              # rotor poles (2p)
    tooth_arc_ratio: float = 0.56  # tooth body arc / slot pitch at any radius
    L_tooth: float = 0.0370        # m, axial length of the tooth body (coil space)
    t_tip: float = 0.0030          # m, axial thickness of one SMC tooth-tip cap
    tip_arc_ratio: float = 0.90    # tip arc / slot pitch
    airgap: float = 0.0012         # m, mechanical air gap, per side
    h_magnet: float = 0.0080       # m, magnet axial thickness
    h_rotor_yoke: float = 0.0080   # m, laminated rotor back iron thickness
    halbach_seg_per_pole: int = 4  # Halbach segments per pole (M = 8 per pole pair)
    magnet_fill: float = 0.96      # -, circumferential packing factor of the array
    magnet_radial_segments: int = 3  # radial cuts, for eddy-current suppression

    # ---- Winding --------------------------------------------------------
    turns_per_coil: int = 8        # series turns on each tooth
    parallel_paths: int = 2        # parallel paths per phase
    slot_fill: float = 0.58        # -, net copper / available slot area
    strands_per_turn: int = 12     # bundle sub-conductors (transposed)
    strand_diameter: float = 0.00125  # m, bare copper strand diameter
    n_phases: int = 3

    # ---- Rotor structure ------------------------------------------------
    h_carrier: float = 0.0060      # m, titanium carrier disc thickness
    t_band: float = 0.0080         # m, radial thickness of the CFRP hoop band
    band_axial_height: float = 0.0200  # m
    R_hub: float = 0.0350          # m, carrier hub outer radius
    n_lightening_holes: int = 16

    # ---- Shaft and bearings --------------------------------------------
    shaft_od: float = 0.0450       # m
    shaft_id: float = 0.0280       # m, gun-drilled bore (also the oil feed)
    bearing_bore: float = 0.0450   # m
    bearing_od: float = 0.0750     # m
    bearing_width: float = 0.0160  # m
    bearing_span: float = 0.1180   # m, distance between bearing mid-planes

    # ---- Housing --------------------------------------------------------
    housing_wall: float = 0.0055   # m
    housing_clearance: float = 0.0060  # m, radial gap outside the rotor band
    endplate_thickness: float = 0.0090  # m

    # ---- Cooling --------------------------------------------------------
    n_oil_jets: int = 36           # 18 per side, one per tooth
    jet_diameter: float = 0.0012   # m
    oil_flow_lpm: float = 12.0     # L/min total at rated condition

    # ---- Materials ------------------------------------------------------
    materials: Dict[str, object] = field(
        default_factory=lambda: dict(DEFAULT_MATERIALS)
    )

    # =====================================================================
    # Basic derived quantities
    # =====================================================================

    @property
    def p(self) -> int:
        """Pole pairs."""
        return self.n_poles // 2

    @property
    def R_in(self) -> float:
        return self.lam * self.R_out

    @property
    def R_mean(self) -> float:
        return 0.5 * (self.R_out + self.R_in)

    @property
    def radial_length(self) -> float:
        """Active radial extent, the axial-flux analogue of stack length."""
        return self.R_out - self.R_in

    @property
    def slot_pitch_mech(self) -> float:
        return TWO_PI / self.n_slots

    @property
    def pole_pitch_mech(self) -> float:
        return TWO_PI / self.n_poles

    @property
    def slot_pitch_elec(self) -> float:
        """Slot pitch in electrical radians."""
        return self.p * self.slot_pitch_mech

    def tooth_width(self, r: float) -> float:
        """Circumferential tooth width [m] at radius ``r``."""
        return self.tooth_arc_ratio * TWO_PI * r / self.n_slots

    def slot_width(self, r: float) -> float:
        """Circumferential slot opening [m] at radius ``r``."""
        return (1.0 - self.tooth_arc_ratio) * TWO_PI * r / self.n_slots

    @property
    def annulus_area(self) -> float:
        """Active annular area [m^2] swept between R_in and R_out."""
        return math.pi * (self.R_out ** 2 - self.R_in ** 2)

    @property
    def tooth_area(self) -> float:
        """Axial cross-sectional area [m^2] of one tooth (gross)."""
        return self.tooth_arc_ratio * self.annulus_area / self.n_slots

    @property
    def tooth_area_net(self) -> float:
        """Tooth iron area [m^2] after the lamination stacking factor."""
        core: SoftMagnetic = self.materials["stator_core"]
        return self.tooth_area * core.stacking_factor

    @property
    def pole_area(self) -> float:
        """Air-gap area [m^2] of one pole on one rotor face."""
        return self.annulus_area / self.n_poles

    # =====================================================================
    # Slot / conductor geometry
    # =====================================================================

    @property
    def slot_area(self) -> float:
        """Available slot cross-section [m^2] for conductors, per slot.

        In an axial-flux machine the slot cross-section lies in the
        (circumferential x axial) plane and grows linearly with radius, so the
        area is integrated over the radial extent rather than taken at a single
        radius.
        """
        # (1/L_r) * integral of slot_width(r) dr from R_in to R_out, times L_tooth.
        # The radial average of a linearly varying width is its value at R_mean,
        # so this reduces exactly to the mean slot width times the tooth height.
        return self.slot_width(self.R_mean) * self.L_tooth

    @property
    def copper_area_per_slot(self) -> float:
        return self.slot_area * self.slot_fill

    @property
    def conductors_per_slot(self) -> int:
        """Double-layer tooth winding: two coil sides share every slot."""
        return 2 * self.turns_per_coil

    @property
    def turn_area(self) -> float:
        """Cross-section [m^2] of one turn's copper."""
        return self.copper_area_per_slot / self.conductors_per_slot

    @property
    def strand_area(self) -> float:
        return 0.25 * math.pi * self.strand_diameter ** 2

    @property
    def n_coils(self) -> int:
        """Double-layer concentrated winding: one coil per tooth."""
        return self.n_slots

    @property
    def coils_per_phase(self) -> int:
        return self.n_coils // self.n_phases

    @property
    def turns_series_per_phase(self) -> int:
        return self.coils_per_phase * self.turns_per_coil // self.parallel_paths

    @property
    def mean_turn_length(self) -> float:
        """Mean length of one turn [m].

        Two radial runs plus the two circumferential end sections that cross
        the tooth at the inner and outer radius, plus a bend allowance.  The
        end sections of a tooth-wound coil are short: this is the second reason
        the yokeless topology wins on copper loss.
        """
        w_out = self.tooth_width(self.R_out)
        w_in = self.tooth_width(self.R_in)
        coil_build = self.L_tooth * 0.5
        return (
            2.0 * self.radial_length
            + w_out + w_in
            + 2.0 * coil_build * 0.35   # bend allowance around the tooth corners
        )

    # =====================================================================
    # Axial stack-up
    # =====================================================================

    @property
    def L_tooth_total(self) -> float:
        """Total axial length of the stator tooth including both tip caps.

        The tooth is a two-piece assembly: a stepped laminated body carrying the
        coil, plus soft-magnetic-composite tip caps bonded on after the pre-wound
        coil has been fitted.  A one-piece tooth with a flared tip could not be
        assembled, because the coil cannot pass over the flare - this is the
        standard resolution of that conflict, and it also lets the tip follow a
        genuinely three-dimensional flux path that laminations cannot.
        """
        return self.L_tooth + 2.0 * self.t_tip

    @property
    def tip_area(self) -> float:
        """Axial cross-section [m^2] of one tooth tip cap."""
        return self.tip_arc_ratio * self.annulus_area / self.n_slots

    @property
    def z_stator_half(self) -> float:
        return 0.5 * self.L_tooth_total

    @property
    def z_magnet_inner(self) -> float:
        """Axial position of the magnet face nearest the stator."""
        return self.z_stator_half + self.airgap

    @property
    def z_magnet_outer(self) -> float:
        return self.z_magnet_inner + self.h_magnet

    @property
    def z_yoke_outer(self) -> float:
        return self.z_magnet_outer + self.h_rotor_yoke

    @property
    def z_carrier_outer(self) -> float:
        return self.z_yoke_outer + self.h_carrier

    @property
    def active_axial_length(self) -> float:
        """Rotor-face to rotor-face axial length of the active stack [m]."""
        return 2.0 * self.z_carrier_outer

    @property
    def overall_length(self) -> float:
        """Housing face-to-face length [m], including end plates and bearings."""
        return self.active_axial_length + 2.0 * self.endplate_thickness + 0.028

    @property
    def overall_diameter(self) -> float:
        return 2.0 * (self.R_out + self.t_band + self.housing_clearance
                      + self.housing_wall) + 0.010

    # =====================================================================
    # Magnet segmentation
    # =====================================================================

    @property
    def magnets_per_pole(self) -> int:
        return self.halbach_seg_per_pole * self.magnet_radial_segments

    @property
    def total_magnet_pieces(self) -> int:
        return self.magnets_per_pole * self.n_poles * 2

    @property
    def magnet_segment_arc(self) -> float:
        """Mechanical arc [rad] of one Halbach segment."""
        return self.pole_pitch_mech / self.halbach_seg_per_pole

    def magnet_segment_radii(self):
        """Radial boundaries of the radial magnet segmentation."""
        n = self.magnet_radial_segments
        return [self.R_in + i * self.radial_length / n for i in range(n + 1)]

    def halbach_magnetisation_angle(self, seg_index: int) -> float:
        """Magnetisation direction of Halbach segment ``seg_index`` [rad].

        Measured in the (axial, circumferential) plane: 0 rad is +z (axial,
        toward the stator), +pi/2 is the +theta circumferential direction.

        For an ideal Halbach array with ``M`` segments per pole pair the
        magnetisation vector rotates by 2*pi/M between adjacent segments, and
        the fundamental of the resulting field is attenuated from the ideal
        continuous rotation by the segmentation factor

            K_M = sin(pi/M) / (pi/M)

        With 4 segments per pole (M = 8) K_M = 0.974, i.e. the discretisation
        costs under 3 % of the achievable air-gap fundamental.
        """
        M = 2 * self.halbach_seg_per_pole  # segments per pole pair
        return seg_index * TWO_PI / M

    @property
    def halbach_segmentation_factor(self) -> float:
        M = 2 * self.halbach_seg_per_pole
        return math.sin(math.pi / M) / (math.pi / M)

    # =====================================================================
    # Masses
    # =====================================================================

    def masses(self) -> Dict[str, float]:
        """Component mass breakdown [kg]."""
        core: SoftMagnetic = self.materials["stator_core"]
        yoke: SoftMagnetic = self.materials["rotor_back_iron"]
        mag: Magnet = self.materials["magnet"]
        cu: Conductor = self.materials["conductor"]
        carrier: Structural = self.materials["rotor_carrier"]
        band: Structural = self.materials["retaining_band"]
        shaft: Structural = self.materials["shaft"]
        hsg: Structural = self.materials["housing"]

        m = {}

        # Stator tooth bodies: 18 stepped laminated stacks
        v_body = self.n_slots * self.tooth_area * self.L_tooth
        m["stator_tooth_bodies"] = v_body * core.density * core.stacking_factor

        # Soft-magnetic-composite tip caps, two per tooth
        tip = self.materials["tooth_tip"]
        v_tips = self.n_slots * 2.0 * self.tip_area * self.t_tip
        m["stator_tooth_tips"] = v_tips * tip.density

        # Copper
        v_cu = self.n_coils * (self.copper_area_per_slot / 2.0) * self.mean_turn_length
        m["copper"] = v_cu * cu.density

        # Impregnation / potting filling the non-copper fraction of the slot
        m["potting"] = self.n_coils * (self.slot_area * (1.0 - self.slot_fill) / 2.0) \
            * self.mean_turn_length * 1500.0

        # Magnets, both rotors
        v_mag = 2.0 * self.annulus_area * self.h_magnet * self.magnet_fill
        m["magnets"] = v_mag * mag.density

        # Rotor back iron, both rotors, 6 % radial overhang beyond the active annulus
        r_yo = self.R_out + 0.004
        r_yi = max(self.R_in - 0.004, self.R_hub)
        v_yoke = 2.0 * math.pi * (r_yo ** 2 - r_yi ** 2) * self.h_rotor_yoke
        m["rotor_back_iron"] = v_yoke * yoke.density * yoke.stacking_factor

        # Titanium carrier discs with lightening pockets
        v_carrier = 2.0 * math.pi * (r_yo ** 2 - self.R_hub ** 2) * self.h_carrier
        m["rotor_carrier"] = v_carrier * carrier.density * 0.78  # pocketing

        # CFRP retaining bands
        r_bi = self.R_out + 0.004
        v_band = 2.0 * math.pi * ((r_bi + self.t_band) ** 2 - r_bi ** 2) \
            * self.band_axial_height
        m["retaining_band"] = v_band * band.density

        # Shaft
        v_shaft = math.pi * ((self.shaft_od / 2) ** 2 - (self.shaft_id / 2) ** 2) \
            * (self.overall_length + 0.045)
        m["shaft"] = v_shaft * shaft.density

        # Housing: cylindrical shell plus two end plates, 62 % solid after
        # topology optimisation and the cast-in oil gallery
        r_h = self.R_out + self.t_band + self.housing_clearance
        v_shell = TWO_PI * r_h * self.housing_wall * self.overall_length
        v_ends = 2.0 * math.pi * (r_h ** 2 - (self.shaft_od / 2) ** 2) \
            * self.endplate_thickness
        m["housing"] = (v_shell + v_ends) * hsg.density * 0.62 + 1.15

        m["bearings"] = 2.0 * 0.62
        m["fasteners_seals"] = 0.85
        m["terminal_box_hv"] = 0.65
        m["resolver_sensors"] = 0.28
        m["oil_manifold"] = 0.72

        m["ACTIVE_TOTAL"] = (m["stator_tooth_bodies"] + m["stator_tooth_tips"]
                             + m["copper"] + m["magnets"] + m["rotor_back_iron"])
        m["TOTAL_DRY"] = sum(v for k, v in m.items() if not k.isupper())
        m["TOTAL_WET"] = m["TOTAL_DRY"] + 0.55   # oil retained in the machine
        return m

    def inertia(self) -> float:
        """Rotor polar moment of inertia [kg.m^2] about the shaft axis."""
        mass = self.masses()
        r_yo = self.R_out + 0.004
        r_yi = max(self.R_in - 0.004, self.R_hub)

        def annulus_J(m, ri, ro):
            return 0.5 * m * (ri ** 2 + ro ** 2)

        J = 0.0
        J += annulus_J(mass["magnets"], self.R_in, self.R_out)
        J += annulus_J(mass["rotor_back_iron"], r_yi, r_yo)
        J += annulus_J(mass["rotor_carrier"], self.R_hub, r_yo)
        r_bi = self.R_out + 0.004
        J += annulus_J(mass["retaining_band"], r_bi, r_bi + self.t_band)
        J += 0.5 * mass["shaft"] * ((self.shaft_od / 2) ** 2 + (self.shaft_id / 2) ** 2)
        return J

    # =====================================================================
    # Reporting
    # =====================================================================

    def summary(self) -> str:
        m = self.masses()
        lines = [
            "GEOMETRY SUMMARY",
            "-" * 62,
            f"  Topology                 dual-rotor yokeless axial flux (YASA)",
            f"  Slots / poles            {self.n_slots} / {self.n_poles}"
            f"   (p = {self.p})",
            f"  Active OD / ID           {2e3*self.R_out:.1f} / {2e3*self.R_in:.1f} mm"
            f"   (lambda = {self.lam:.3f})",
            f"  Overall OD x L           {1e3*self.overall_diameter:.1f} x "
            f"{1e3*self.overall_length:.1f} mm",
            f"  Tooth body / total       {1e3*self.L_tooth:.1f} / {1e3*self.L_tooth_total:.1f} mm",
            f"  Air gap (per side)       {1e3*self.airgap:.2f} mm",
            f"  Magnet thickness         {1e3*self.h_magnet:.2f} mm",
            f"  Halbach segments/pole    {self.halbach_seg_per_pole}"
            f"   (K_M = {self.halbach_segmentation_factor:.4f})",
            f"  Magnet pieces (total)    {self.total_magnet_pieces}",
            f"  Turns per coil           {self.turns_per_coil}"
            f"   ({self.parallel_paths} parallel paths)",
            f"  Series turns per phase   {self.turns_series_per_phase}",
            f"  Slot area / fill         {1e6*self.slot_area:.1f} mm^2 / "
            f"{self.slot_fill:.2f}",
            f"  Copper area per slot     {1e6*self.copper_area_per_slot:.1f} mm^2",
            f"  Mean turn length         {1e3*self.mean_turn_length:.1f} mm",
            f"  Rotor inertia            {self.inertia()*1e3:.2f} g.m^2",
            "",
            "MASS BREAKDOWN [kg]",
            "-" * 62,
        ]
        for k, v in m.items():
            if not k.isupper():
                lines.append(f"    {k:24s} {v:7.3f}")
        lines.append("-" * 62)
        lines.append(f"    {'ACTIVE MASS':24s} {m['ACTIVE_TOTAL']:7.3f}")
        lines.append(f"    {'TOTAL DRY':24s} {m['TOTAL_DRY']:7.3f}")
        lines.append(f"    {'TOTAL WET':24s} {m['TOTAL_WET']:7.3f}")
        return "\n".join(lines)


TAF500 = Geometry()
