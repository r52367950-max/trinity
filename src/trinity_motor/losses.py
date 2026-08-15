"""
Loss models for the TAF-500.

Six loss mechanisms are modelled, each from a stated correlation rather than a
lumped efficiency assumption:

1. Copper DC loss                    I^2 R with temperature-corrected resistivity
2. Copper AC loss                    skin and proximity effect in the slot
3. Stator core loss                  Bertotti separation, plus the PWM carrier band
4. Rotor loss                        magnet and back-iron eddy currents driven by
                                     the *slipping* stator MMF harmonics
5. Windage and fluid drag            rotating-disc friction plus air-gap shear
6. Bearing friction                  SKF two-term model

The rotor-loss term is the one that decides whether an 18-slot/16-pole winding is
viable at all: its sub-harmonics and the strong nu = 10 backward wave slip against
the rotor at 0.75 and 2.25 times the electrical frequency, and at 1.3 kHz that is
enough to cook the magnets if the array is not segmented.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List

import numpy as np

from .geometry import Geometry
from .magnetics import Machine
from .materials import MU0, Coolant, Magnet, SoftMagnetic
from .winding import Winding

TWO_PI = 2.0 * math.pi


@dataclass
class LossBreakdown:
    copper_dc: float = 0.0
    copper_ac: float = 0.0
    core_tooth: float = 0.0
    core_tip: float = 0.0
    core_rotor_yoke: float = 0.0
    magnet_eddy: float = 0.0
    windage: float = 0.0
    airgap_shear: float = 0.0
    bearing: float = 0.0

    @property
    def copper(self) -> float:
        return self.copper_dc + self.copper_ac

    @property
    def core(self) -> float:
        return self.core_tooth + self.core_tip + self.core_rotor_yoke

    @property
    def rotor(self) -> float:
        return self.magnet_eddy + self.core_rotor_yoke

    @property
    def mechanical(self) -> float:
        return self.windage + self.airgap_shear + self.bearing

    @property
    def total(self) -> float:
        return (self.copper_dc + self.copper_ac + self.core_tooth + self.core_tip
                + self.core_rotor_yoke + self.magnet_eddy + self.windage
                + self.airgap_shear + self.bearing)

    def as_dict(self) -> Dict[str, float]:
        return {
            "copper_dc": self.copper_dc,
            "copper_ac": self.copper_ac,
            "core_tooth": self.core_tooth,
            "core_tip": self.core_tip,
            "core_rotor_yoke": self.core_rotor_yoke,
            "magnet_eddy": self.magnet_eddy,
            "windage": self.windage,
            "airgap_shear": self.airgap_shear,
            "bearing": self.bearing,
            "TOTAL": self.total,
        }


class LossModel:
    def __init__(self, machine: Machine):
        self.m = machine
        self.g = machine.g
        self.w = machine.winding

    # ------------------------------------------------------------------
    # 1-2. Copper
    # ------------------------------------------------------------------

    def copper_dc(self, I_rms: float, T_winding: float) -> float:
        R = self.m.phase_resistance(T_winding)
        return 3.0 * I_rms * I_rms * R

    def ac_resistance_factor(self, f: float, T_winding: float) -> float:
        """Ratio of AC to DC resistance in the slot.

        The conductor bundle is a transposed litz-style assembly of round
        strands.  Two effects are superposed:

        * **Strand-level skin effect**, negligible while the strand diameter is
          well below twice the skin depth.
        * **Bundle-level proximity effect** from the slot leakage field, which
          rises through the slot depth.  For a slot containing ``n_layers``
          conductor layers the classical Field/Dowell result gives a factor that
          grows with the square of the layer index; for a transposed bundle the
          circulating-current component is suppressed and only the local
          proximity term survives.

        The strand diameter is deliberately chosen so that this factor stays
        below about 1.35 at the maximum fundamental frequency - that choice is
        the entire reason for the 12-strand transposed bundle rather than a
        solid hairpin, which at 1.3 kHz would run a factor near 3.
        """
        g = self.g
        cu = g.materials["conductor"]
        if f <= 0.0:
            return 1.0
        delta = cu.skin_depth(f, T_winding)
        d = g.strand_diameter
        xi = d / (2.0 * delta)

        # Skin effect in a round strand, small-argument expansion of the
        # Kelvin-function solution (accurate to ~1 % for xi < 1.5)
        k_skin = 1.0 + xi ** 4 / 48.0

        # Proximity effect: strands sit in the slot leakage field.  For a slot
        # with m_l effective conductor layers the mean proximity factor is
        # (m_l^2 - 1)/3 times the single-strand term.
        b_s = g.slot_width(g.R_mean)
        n_strands_total = g.turns_per_coil * 2 * g.strands_per_turn
        layers = max(1.0, math.sqrt(n_strands_total) * g.strand_diameter / b_s)
        m_l = max(1.0, layers)
        k_prox = (xi ** 4 / 45.0) * (m_l ** 2 - 1.0) / 3.0

        # Transposition suppresses circulating currents between strands; a
        # 12-strand bundle with one full transposition retains ~25 % of the
        # untransposed bundle-level term.
        k_prox *= 0.25
        return k_skin + k_prox

    def copper_ac(self, I_rms: float, f: float, T_winding: float) -> float:
        k = self.ac_resistance_factor(f, T_winding)
        return self.copper_dc(I_rms, T_winding) * (k - 1.0)

    # ------------------------------------------------------------------
    # 3. Stator core
    # ------------------------------------------------------------------

    def core_losses(self, f_e: float, T_magnet: float, f_sw: float = 16000.0,
                    build_factor: float = 1.35,
                    flux_derate: float = 1.0) -> Dict[str, float]:
        """Iron loss in the tooth bodies, tips and rotor back iron [W].

        ``flux_derate`` scales the peak flux density to represent operation
        under flux weakening, where the resultant air-gap flux is reduced below
        its open-circuit value.
        """
        g = self.g
        masses = g.masses()
        core: SoftMagnetic = g.materials["stator_core"]
        tip: SoftMagnetic = g.materials["tooth_tip"]
        yoke: SoftMagnetic = g.materials["rotor_back_iron"]

        B_tooth = self.m.field.tooth_flux_density(T_magnet) * flux_derate
        B_tip = self.m.field.tip_flux_density(T_magnet) * flux_derate
        B_yoke = self.m.field.rotor_yoke_flux_density(T_magnet) * flux_derate

        p_tooth = core.core_loss_pwm(f_e, B_tooth, f_sw,
                                     build_factor=build_factor)
        p_tip = tip.core_loss_pwm(f_e, B_tip, f_sw, build_factor=1.10)

        # The rotor back iron is quasi-static in the rotor frame; it only sees
        # the slotting ripple and the slipping harmonics, at a small fraction of
        # the fundamental amplitude.
        f_rotor = f_e * 0.25
        p_yoke = yoke.core_loss_density(f_rotor, 0.18 * B_yoke,
                                        build_factor=1.20)

        return {
            "core_tooth": p_tooth * masses["stator_tooth_bodies"],
            "core_tip": p_tip * masses["stator_tooth_tips"],
            "core_rotor_yoke": p_yoke * masses["rotor_back_iron"],
        }

    # ------------------------------------------------------------------
    # 4. Magnet eddy-current loss
    # ------------------------------------------------------------------

    def magnet_eddy_loss(self, I_rms: float, f_e: float, T_magnet: float) -> float:
        """Eddy-current loss in the segmented magnet array [W].

        Each stator MMF harmonic that does not rotate synchronously with the
        rotor sweeps past the magnets at ``f_rotor = f_e * |1 -+ nu/p|`` and
        induces eddy currents.  For a magnet block of circumferential width
        ``w`` and radial length ``l``, thin compared with the electromagnetic
        skin depth, the classical result is

            p_v = pi^2 f^2 B^2 w^2 / (6 rho) * 1 / (1 + (w/l)^2)

        The final bracket is the finite-aspect-ratio correction: current has to
        return along the block, so a long thin block dissipates less than the
        infinite-strip formula predicts.  Segmenting the array both
        circumferentially (the Halbach segments are already separate pieces) and
        radially cuts ``w`` and ``l``, and the loss falls with the square.
        """
        g = self.g
        mag: Magnet = g.materials["magnet"]
        s = self.m.field.slices(T_magnet)
        kc = float(np.mean([sl.k_carter for sl in s]))
        g_eff = kc * g.airgap + g.h_magnet / mag.mu_r

        # Magnet block dimensions after segmentation
        w = (g.pole_pitch_mech * g.R_mean) / g.halbach_seg_per_pole
        l = g.radial_length / g.magnet_radial_segments

        harmonics = self.w.mmf_spectrum(I_rms, max_order=46)
        total_pv = 0.0
        for h in harmonics:
            if h.is_working or h.rotor_freq_ratio < 1e-3:
                continue
            f_r = f_e * h.rotor_freq_ratio
            if f_r <= 0.0:
                continue
            # Field of this harmonic at the magnet surface, attenuated across
            # the gap by its own (short) wavelength
            k_nu = h.order / g.R_mean
            B_nu = MU0 * h.amplitude / g_eff * math.exp(-k_nu * g.airgap)
            pv = (math.pi ** 2 * f_r ** 2 * B_nu ** 2 * w ** 2
                  / (6.0 * mag.resistivity)) / (1.0 + (w / l) ** 2)
            total_pv += pv

        v_mag = 2.0 * g.annulus_area * g.h_magnet * g.magnet_fill
        return total_pv * v_mag

    # ------------------------------------------------------------------
    # 5. Windage and fluid drag
    # ------------------------------------------------------------------

    def windage(self, speed_rpm: float, T_oil: float = 80.0,
                oil_void_fraction: float = 0.04) -> Dict[str, float]:
        """Rotating-disc windage and air-gap shear drag [W].

        Outer rotor faces: Daily & Nece regime IV (turbulent flow with separate
        boundary layers), ``C_M = 0.051 G^0.1 Re^-0.2``, moment on one face
        ``M = 0.5 C_M rho omega^2 R^5``.

        Air gap: Couette shear between the rotor face and the stator.  In an
        oil-cooled machine the gap is not filled with air - a spray-cooled
        machine carries an oil mist whose effective viscosity is far higher than
        air's, and this term is routinely and wrongly omitted.  It is included
        here with an explicit void fraction.
        """
        g = self.g
        oil: Coolant = g.materials["coolant"]
        omega = TWO_PI * speed_rpm / 60.0
        if omega <= 0.0:
            return {"windage": 0.0, "airgap_shear": 0.0}

        rho_air, mu_air = 1.05, 2.1e-5
        R = g.R_out + g.t_band

        # --- outer faces, air
        Re = rho_air * omega * R * R / mu_air
        s_gap = g.housing_clearance
        G = max(s_gap / R, 1e-3)
        C_M = 0.051 * G ** 0.1 * Re ** -0.2
        M_face = 0.5 * C_M * rho_air * omega ** 2 * R ** 5
        P_windage = 2.0 * M_face * omega            # two outward-facing discs

        # --- air gap, oil mist
        rho_oil = oil.density(T_oil)
        mu_oil = oil.kin_viscosity(T_oil) * rho_oil
        x = oil_void_fraction
        mu_eff = (1.0 - x) * mu_air + x * mu_oil
        rho_eff = (1.0 - x) * rho_air + x * rho_oil

        # Couette torque per gap surface, with a turbulent correction factor
        Re_c = rho_eff * omega * g.R_mean * g.airgap / mu_eff
        f_turb = 1.0 if Re_c < 500 else (Re_c / 500.0) ** 0.25
        M_gap = (TWO_PI * mu_eff * omega / g.airgap
                 * (g.R_out ** 4 - g.R_in ** 4) / 4.0) * f_turb
        P_gap = 4.0 * M_gap * omega    # two gaps, two surfaces each

        return {"windage": P_windage, "airgap_shear": P_gap}

    # ------------------------------------------------------------------
    # 6. Bearing friction
    # ------------------------------------------------------------------

    def bearing_loss(self, speed_rpm: float, axial_load: float = 500.0,
                     radial_load: float = 250.0, nu_oil_cst: float = 12.0
                     ) -> float:
        """Bearing friction [W], SKF two-term model.

        M0 (speed/viscosity term) = 1e-7 f0 (nu n)^(2/3) dm^3   [N.mm]
        M1 (load term)            = f1 P1 dm                    [N.mm]
        """
        g = self.g
        if speed_rpm <= 0.0:
            return 0.0
        dm = 1e3 * 0.5 * (g.bearing_bore + g.bearing_od)   # mm
        n = speed_rpm
        f0 = 2.0        # oil-jet lubricated angular contact
        f1 = 0.0010
        if nu_oil_cst * n > 2000.0:
            M0 = 1e-7 * f0 * (nu_oil_cst * n) ** (2.0 / 3.0) * dm ** 3
        else:
            M0 = 160e-7 * f0 * dm ** 3
        P1 = max(radial_load, 1.0) + 1.4 * axial_load
        M1 = f1 * P1 * dm
        M = (M0 + M1) * 1e-3                                # N.mm -> N.m
        omega = TWO_PI * n / 60.0
        return 2.0 * M * omega                              # two bearings

    # ------------------------------------------------------------------
    # Assembly
    # ------------------------------------------------------------------

    def evaluate(self, I_rms: float, speed_rpm: float, T_winding: float = 140.0,
                 T_magnet: float = 120.0, T_oil: float = 80.0,
                 f_sw: float = 16000.0, flux_derate: float = 1.0
                 ) -> LossBreakdown:
        g = self.g
        f_e = speed_rpm / 60.0 * g.p

        lb = LossBreakdown()
        lb.copper_dc = self.copper_dc(I_rms, T_winding)
        lb.copper_ac = self.copper_ac(I_rms, f_e, T_winding)

        core = self.core_losses(f_e, T_magnet, f_sw, flux_derate=flux_derate)
        lb.core_tooth = core["core_tooth"]
        lb.core_tip = core["core_tip"]
        lb.core_rotor_yoke = core["core_rotor_yoke"]

        lb.magnet_eddy = self.magnet_eddy_loss(I_rms, f_e, T_magnet)

        wd = self.windage(speed_rpm, T_oil)
        lb.windage = wd["windage"]
        lb.airgap_shear = wd["airgap_shear"]

        f_axial = self.m.field.net_axial_force(0.00015, T_magnet)
        lb.bearing = self.bearing_loss(speed_rpm, axial_load=f_axial)
        return lb

    def summary(self, I_rms: float, speed_rpm: float, **kw) -> str:
        lb = self.evaluate(I_rms, speed_rpm, **kw)
        f_e = speed_rpm / 60.0 * self.g.p
        lines = [
            f"LOSS BREAKDOWN  ({I_rms:.0f} A rms, {speed_rpm:.0f} rpm, "
            f"f_e = {f_e:.0f} Hz)",
            "-" * 62,
        ]
        for k, v in lb.as_dict().items():
            if k == "TOTAL":
                lines.append("-" * 62)
            lines.append(f"    {k:20s} {v:9.1f} W")
        lines.append(f"    {'k_AC':20s} "
                     f"{self.ac_resistance_factor(f_e, kw.get('T_winding',140)):9.3f}")
        return "\n".join(lines)
