"""
Electromagnetic field model for the TAF-500.

Method
------
A **quasi-3D multi-slice** solution.  The active annulus is cut into ``n_slice``
concentric rings; each ring is unrolled into an equivalent linear machine and
solved analytically in the Fourier domain; the ring results are integrated back
over radius.  This is the standard rigorous treatment for axial-flux machines
(Gieras et al.) and captures what a single mean-radius calculation cannot: the
pole pitch, and therefore the whole field solution, varies by nearly a factor of
two between the inner and outer radius of this machine.

Field solution per slice
------------------------
Magnetostatic scalar potential, two regions, exact for the harmonic content of
the magnetisation:

    region I  (magnet)  0 <= y <= h_m      permeability mu_0 * mu_r, magnetised
    region II (air gap) h_m <= y <= h_m+g  permeability mu_0

with a highly permeable rotor yoke at ``y = 0`` and a highly permeable stator
tooth surface at ``y = h_m + g``.  Both iron surfaces are equipotentials for the
harmonic field, which supplies the two boundary conditions; continuity of the
scalar potential and of the normal flux density at ``y = h_m`` supplies the
other two.

Writing ``phi = f(y) cos(kx)`` in the magnet and ``phi = g(u) cos(kx)`` in the
gap (``u = y - h_m``, ``k = p / r`` for a slice at radius ``r``), and with a
magnetisation whose fundamental components are ``M_y1`` (axial) and ``M_x1``
(circumferential), the solution gives the air-gap flux density at the stator
surface as

    B_g1 = mu_0 * k * C / sinh(k g)

where ``C`` follows from the four boundary conditions.  Setting ``M_x1 = 0``
recovers a conventional surface-magnet array, so the same code computes the
Halbach benefit directly rather than taking it on faith from a table.

Everything downstream - flux linkage, back-EMF, inductance, torque, and the loss
models - is built from this one field solution.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Tuple

import numpy as np

from .geometry import Geometry
from .materials import MU0, Magnet, SoftMagnetic
from .winding import Winding

TWO_PI = 2.0 * math.pi


# ---------------------------------------------------------------------------
# Air-gap field
# ---------------------------------------------------------------------------


def carter_coefficient(slot_pitch: float, slot_opening: float, gap: float) -> float:
    """Carter coefficient for one slotted surface.

    Standard formulation (Pyrhonen eq. 3.28):

        gamma = (4/pi) * [ (b0/2g) * atan(b0/2g) - ln( sqrt(1 + (b0/2g)^2) ) ]
        k_C   = tau_s / (tau_s - gamma * g)

    ``slot_pitch`` and ``slot_opening`` in metres at the radius of interest,
    ``gap`` the physical air gap.  The tooth tips of the TAF-500 close the slot
    down to a narrow opening, which is what keeps k_C close to unity despite the
    large slot area.
    """
    if slot_opening <= 0.0:
        return 1.0
    u = slot_opening / (2.0 * gap)
    gamma = (4.0 / math.pi) * (u * math.atan(u) - math.log(math.sqrt(1.0 + u * u)))
    denom = slot_pitch - gamma * gap
    return slot_pitch / denom if denom > 0 else 1.0


@dataclass
class SliceField:
    r: float
    dr: float
    k: float            # wave number [1/m]
    tau_p: float        # pole pitch arc length [m]
    B_g1: float         # peak fundamental air-gap flux density [T]
    B_g_peak: float     # peak total air-gap flux density [T]
    k_carter: float
    g_eff: float        # effective magnetic gap [m]


class AirgapField:
    """Halbach air-gap field, solved slice by slice."""

    def __init__(self, geom: Geometry, n_slice: int = 48):
        self.g = geom
        self.n_slice = n_slice
        self.magnet: Magnet = geom.materials["magnet"]

    # -- core analytical solution -------------------------------------

    @staticmethod
    def _solve_slice(k: float, h_m: float, gap: float, mu_r: float,
                     M_y1: float, M_x1: float) -> float:
        """Peak fundamental air-gap flux density at the stator surface [T].

        Implements the two-region scalar-potential solution described in the
        module docstring.  ``M_y1`` and ``M_x1`` are the fundamental Fourier
        amplitudes of the axial and circumferential magnetisation [A/m].
        """
        kh = k * h_m
        kg = k * gap
        # guard against overflow for very short pole pitches at small radius
        if kh > 40.0 or kg > 40.0:
            return 0.0

        A = M_x1 / (k * mu_r) if mu_r > 0 else 0.0
        T = 1.0 / math.tanh(kg)          # coth(kg)

        num = (mu_r * k * A * math.sinh(kh)
               + k * T * A * (math.cosh(kh) - 1.0)
               - M_y1)
        den = -(mu_r * k * math.cosh(kh) + k * T * math.sinh(kh))
        B_coef = num / den

        C = A * (math.cosh(kh) - 1.0) + B_coef * math.sinh(kh)
        return MU0 * k * C / math.sinh(kg)

    def _magnetisation(self, halbach: bool = True) -> Tuple[float, float, float]:
        """Fundamental magnetisation amplitudes (M_y1, M_x1) [A/m] and Br used."""
        return self._magnetisation_at(20.0, halbach)

    def _magnetisation_at(self, T_magnet: float, halbach: bool = True):
        g = self.g
        Br = self.magnet.Br(T_magnet)
        M = Br / MU0
        if halbach:
            K_M = g.halbach_segmentation_factor
            # An ideal Halbach array has |M| constant with the direction rotating
            # at twice the mechanical rate; both quadrature components therefore
            # have the same fundamental amplitude, reduced by the discretisation
            # factor K_M and by the circumferential packing factor.
            amp = M * K_M * g.magnet_fill
            return amp, amp, Br
        else:
            # Conventional surface array, pole arc ratio alpha_pm: a square wave
            # of magnetisation whose fundamental is (4/pi) sin(alpha_pm pi/2).
            alpha_pm = 0.85
            M_y1 = M * (4.0 / math.pi) * math.sin(alpha_pm * math.pi / 2.0) * g.magnet_fill
            return M_y1, 0.0, Br

    # -- slice assembly ------------------------------------------------

    def slices(self, T_magnet: float = 60.0, halbach: bool = True):
        g = self.g
        radii = np.linspace(g.R_in, g.R_out, self.n_slice + 1)
        rc = 0.5 * (radii[:-1] + radii[1:])
        dr = radii[1] - radii[0]
        M_y1, M_x1, _ = self._magnetisation_at(T_magnet, halbach)

        out = []
        for r in rc:
            k = g.p / r                       # wave number of the pole wave
            tau_p = math.pi * r / g.p
            slot_pitch = TWO_PI * r / g.n_slots
            # with tooth tips the effective slot opening is the inter-tip gap
            slot_open = (1.0 - g.tip_arc_ratio) * slot_pitch
            kc = carter_coefficient(slot_pitch, slot_open, g.airgap)
            gap_eff = kc * g.airgap
            # The sign of the circumferential component relative to the axial
            # component decides which face of the Halbach array is the strong
            # one.  Rather than rely on a hand-chosen convention, solve both and
            # keep the strong side - that is the orientation the rotor is built
            # to, and getting it backwards would build a machine with a WEAKER
            # gap field than a plain surface-magnet array.
            B1 = max(
                (self._solve_slice(k, g.h_magnet, gap_eff,
                                   self.magnet.mu_r, M_y1, sgn * M_x1)
                 for sgn in (+1.0, -1.0)),
                key=abs,
            )
            # total peak including the Halbach harmonic content: for a
            # 4-segment array the third harmonic is the dominant residual
            B3 = 0.0
            if halbach:
                # segmented Halbach injects harmonics at orders 2*M/... ; the
                # first significant one for M segments per pole pair is 2M-1
                nu_h = 2 * g.halbach_seg_per_pole * 2 - 1
                M_y_h = M_y1 / nu_h
                B3 = abs(self._solve_slice(nu_h * k, g.h_magnet, gap_eff,
                                           self.magnet.mu_r, M_y_h, M_y_h))
            out.append(SliceField(r=r, dr=dr, k=k, tau_p=tau_p,
                                  B_g1=abs(B1), B_g_peak=abs(B1) + B3,
                                  k_carter=kc, g_eff=gap_eff))
        return out

    # -- integrated quantities ------------------------------------------

    def flux_per_pole(self, T_magnet: float = 60.0, halbach: bool = True) -> float:
        """Fundamental flux per pole through one tooth [Wb].

        For a slice, the fundamental flux over one pole is the integral of
        ``B_g1 cos(kx)`` across a half wavelength, which is ``2 B_g1 / k``.
        With ``k = p/r`` this becomes ``2 B_g1 r / p``, integrated over radius.
        """
        s = self.slices(T_magnet, halbach)
        return sum(2.0 * sl.B_g1 * sl.r / self.g.p * sl.dr for sl in s)

    def mean_B_g1(self, T_magnet: float = 60.0, halbach: bool = True) -> float:
        """Area-weighted mean of the fundamental air-gap flux density [T]."""
        s = self.slices(T_magnet, halbach)
        num = sum(sl.B_g1 * sl.r * sl.dr for sl in s)
        den = sum(sl.r * sl.dr for sl in s)
        return num / den

    def halbach_gain(self, T_magnet: float = 60.0) -> float:
        """Ratio of Halbach to conventional-array fundamental flux, same magnet
        volume and thickness.  Reported rather than assumed."""
        return (self.mean_B_g1(T_magnet, True)
                / max(self.mean_B_g1(T_magnet, False), 1e-9))

    def tooth_flux_density(self, T_magnet: float = 60.0) -> float:
        """Peak flux density in the tooth body [T], in the steel."""
        g = self.g
        core: SoftMagnetic = g.materials["stator_core"]
        w = Winding(g)
        phi = self.flux_per_pole(T_magnet) * w.pitch_factor(g.p)
        return phi / (g.tooth_area * core.stacking_factor)

    def tip_flux_density(self, T_magnet: float = 60.0) -> float:
        g = self.g
        tip: SoftMagnetic = g.materials["tooth_tip"]
        w = Winding(g)
        phi = self.flux_per_pole(T_magnet) * w.pitch_factor(g.p)
        return phi / g.tip_area

    def rotor_yoke_flux_density(self, T_magnet: float = 60.0) -> float:
        """Peak circumferential flux density in the rotor back iron [T].

        The yoke carries half the pole flux around the circumference; its
        cross-section is the radial length times the yoke thickness.  With a
        Halbach array the circumferentially magnetised segments supply part of
        this MMF themselves, which is what permits the thin back iron.
        """
        g = self.g
        yoke: SoftMagnetic = g.materials["rotor_back_iron"]
        phi = self.flux_per_pole(T_magnet)
        A_yoke = g.radial_length * g.h_rotor_yoke * yoke.stacking_factor
        halbach_relief = 0.62   # fraction of yoke flux carried by the array itself
        return 0.5 * phi * halbach_relief / A_yoke

    # -- axial attraction force ------------------------------------------

    def axial_attraction_force(self, T_magnet: float = 60.0) -> float:
        """Magnetic attraction between one rotor and the stator [N].

        Maxwell stress normal to the air-gap surface, integrated over the active
        annulus.  In a balanced dual-rotor machine these two forces oppose and
        cancel at the bearings - but only to the accuracy of the air-gap
        symmetry, which is why the net force under asymmetry is computed
        separately below.
        """
        s = self.slices(T_magnet)
        F = 0.0
        for sl in s:
            # mean square of a sinusoid plus its harmonic residue
            B_rms_sq = 0.5 * sl.B_g1 ** 2 + 0.5 * max(
                sl.B_g_peak - sl.B_g1, 0.0) ** 2
            dA = TWO_PI * sl.r * sl.dr
            F += B_rms_sq / (2.0 * MU0) * dA
        return F

    def net_axial_force(self, gap_error: float, T_magnet: float = 60.0) -> float:
        """Net axial force on the bearings [N] for an air-gap asymmetry.

        ``gap_error`` is the difference between the two air gaps in metres (one
        side ``g + e/2``, the other ``g - e/2``).  The force on each side scales
        roughly as the square of its flux density, and the flux density falls
        with gap, so the imbalance is *destabilising*: the smaller gap pulls
        harder.  This is the dominant axial bearing load case and the reason the
        assembly tolerance stack is controlled as tightly as it is.
        """
        g = self.g
        base = g.airgap
        out = []
        for e in (+gap_error / 2.0, -gap_error / 2.0):
            g.airgap = base + e
            out.append(self.axial_attraction_force(T_magnet))
        g.airgap = base
        return abs(out[0] - out[1])

    # -- reporting --------------------------------------------------------

    def summary(self, T_magnet: float = 60.0) -> str:
        s = self.slices(T_magnet)
        g = self.g
        lines = [
            f"AIR-GAP FIELD  (magnet at {T_magnet:.0f} C)",
            "-" * 62,
            f"  Remanence Br(T)          {self.magnet.Br(T_magnet):.4f} T",
            f"  Mean fundamental B_g1    {self.mean_B_g1(T_magnet):.4f} T",
            f"  B_g1 at R_in / R_out     {s[0].B_g1:.4f} / {s[-1].B_g1:.4f} T",
            f"  Carter k_C (in/out)      {s[0].k_carter:.4f} / {s[-1].k_carter:.4f}",
            f"  Halbach gain vs SPM      {self.halbach_gain(T_magnet):.3f} x",
            f"  Flux per pole            {1e3*self.flux_per_pole(T_magnet):.4f} mWb",
            f"  Tooth body flux density  {self.tooth_flux_density(T_magnet):.3f} T"
            f"   (Bs = {g.materials['stator_core'].B_sat:.2f} T)",
            f"  Tooth tip flux density   {self.tip_flux_density(T_magnet):.3f} T"
            f"   (Bs = {g.materials['tooth_tip'].B_sat:.2f} T)",
            f"  Rotor yoke flux density  {self.rotor_yoke_flux_density(T_magnet):.3f} T"
            f"   (Bs = {g.materials['rotor_back_iron'].B_sat:.2f} T)",
            f"  Axial pull per rotor     {1e-3*self.axial_attraction_force(T_magnet):.2f} kN",
            f"  Net axial force @0.2 mm  "
            f"{1e-3*self.net_axial_force(0.0002, T_magnet):.3f} kN",
        ]
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Machine electrical parameters
# ---------------------------------------------------------------------------


@dataclass
class MachineParameters:
    lambda_pm: float     # PM flux linkage per phase [Wb], peak
    Ld: float            # d-axis inductance [H]
    Lq: float            # q-axis inductance [H]
    Rs_dc_20: float      # phase resistance at 20 C [ohm]
    kw1: float
    B_g1: float
    flux_per_pole: float
    B_tooth: float
    saliency: float

    @property
    def I_characteristic(self) -> float:
        """Characteristic current lambda_pm / Ld [A peak].

        A machine whose maximum current equals its characteristic current has an
        ideally wide constant-power range and, usefully, is intrinsically safe:
        its steady-state short-circuit current equals its rated current.
        """
        return self.lambda_pm / self.Ld


class Machine:
    """Assembles the electrical parameters of the machine from the field model."""

    def __init__(self, geom: Geometry, n_slice: int = 48):
        self.g = geom
        self.field = AirgapField(geom, n_slice)
        self.winding = Winding(geom)

    # -- inductance -------------------------------------------------------

    def magnetising_inductance(self) -> float:
        """Per-phase magnetising inductance [H].

        Derived from the fundamental MMF wave: the armature field sees the air
        gap in series with the magnet, whose recoil permeability is close to
        that of air, so the effective magnetic gap is ``k_C g + h_m / mu_r``.

            L_m = (3/pi) * mu0 * (kw1 N)^2 * (R_out^2 - R_in^2) / (p^2 g_eff)
        """
        g = self.g
        mag: Magnet = g.materials["magnet"]
        N = g.turns_series_per_phase
        kw1 = self.winding.kw1
        s = self.field.slices()
        kc = float(np.mean([sl.k_carter for sl in s]))
        g_eff = kc * g.airgap + g.h_magnet / mag.mu_r
        return ((3.0 / math.pi) * MU0 * (kw1 * N) ** 2
                * (g.R_out ** 2 - g.R_in ** 2) / (g.p ** 2 * g_eff))

    def leakage_inductance(self) -> float:
        """Slot, tooth-tip and end-winding leakage [H].

        Fractional-slot concentrated windings have high leakage - the coil sees
        its own slot, not a distributed winding's shared flux - and it is the
        leakage that gives an otherwise non-salient surface-magnet machine
        enough inductance to field-weaken at all.

        Slot permeance for a rectangular slot fully occupied by conductors is
        ``lambda_s = h/(3 b)``; the tooth-tip and end-winding permeances follow
        the standard coefficients (Pyrhonen ch. 4).
        """
        g = self.g
        N_c = g.turns_per_coil
        r = g.R_mean
        b_s = g.slot_width(r)
        h_s = g.L_tooth
        lam_slot = h_s / (3.0 * b_s)
        b_open = (1.0 - g.tip_arc_ratio) * TWO_PI * r / g.n_slots
        lam_tip = g.t_tip / max(b_open, 1e-4)
        lam_end = 0.36 * g.radial_length / max(g.mean_turn_length, 1e-6) * 2.0

        L_coil = MU0 * (N_c ** 2) * g.radial_length * (lam_slot + lam_tip + lam_end)
        # Coils in series along one parallel path add their leakage; the paths
        # then sit in parallel.  L_phase = (coils_per_path * L_coil) / paths.
        coils_per_path = g.coils_per_phase // g.parallel_paths
        return L_coil * coils_per_path / g.parallel_paths

    # -- resistance -------------------------------------------------------

    def phase_resistance(self, T: float = 20.0) -> float:
        g = self.g
        cu = g.materials["conductor"]
        turns_per_path = (g.coils_per_phase // g.parallel_paths) * g.turns_per_coil
        length = turns_per_path * g.mean_turn_length
        R_path = cu.resistivity(T) * length / g.turn_area
        return R_path / g.parallel_paths

    # -- assembly ---------------------------------------------------------

    def parameters(self, T_magnet: float = 60.0, T_winding: float = 20.0
                   ) -> MachineParameters:
        g = self.g
        kw1 = self.winding.kw1
        phi = self.field.flux_per_pole(T_magnet)
        lam_pm = kw1 * g.turns_series_per_phase * phi

        L_m = self.magnetising_inductance()
        L_sigma = self.leakage_inductance()
        # A surface-magnet Halbach rotor is magnetically almost isotropic.  The
        # small residual saliency comes from the tooth tips and the finite
        # permeability of the rotor yoke seen on the q axis.
        Ld = L_m + L_sigma
        Lq = 1.06 * L_m + L_sigma

        return MachineParameters(
            lambda_pm=lam_pm,
            Ld=Ld, Lq=Lq,
            Rs_dc_20=self.phase_resistance(T_winding),
            kw1=kw1,
            B_g1=self.field.mean_B_g1(T_magnet),
            flux_per_pole=phi,
            B_tooth=self.field.tooth_flux_density(T_magnet),
            saliency=Lq / Ld,
        )

    # -- back-EMF ---------------------------------------------------------

    def back_emf_rms(self, speed_rpm: float, T_magnet: float = 60.0) -> float:
        """Line-to-line back-EMF [V rms]."""
        pm = self.parameters(T_magnet)
        omega_e = TWO_PI * speed_rpm / 60.0 * self.g.p
        e_phase_peak = omega_e * pm.lambda_pm
        return e_phase_peak / math.sqrt(2.0) * math.sqrt(3.0)

    def emf_waveform(self, speed_rpm: float, n: int = 720,
                     T_magnet: float = 60.0):
        """Phase back-EMF waveform [V] over one electrical period.

        Built from the slice field so that the harmonic content of the segmented
        Halbach array shows up in the waveform rather than being assumed away.
        """
        g = self.g
        omega_e = TWO_PI * speed_rpm / 60.0 * g.p
        th = np.linspace(0.0, TWO_PI, n, endpoint=False)
        s = self.field.slices(T_magnet)
        kw1 = self.winding.kw1
        nu_h = 2 * g.halbach_seg_per_pole * 2 - 1

        phi1 = sum(2.0 * sl.B_g1 * sl.r / g.p * sl.dr for sl in s)
        h_ratio = 0.0
        if s:
            h_ratio = float(np.mean([
                max(sl.B_g_peak - sl.B_g1, 0.0) / max(sl.B_g1, 1e-9) for sl in s]))

        N = g.turns_series_per_phase
        e = (omega_e * kw1 * N * phi1) * np.cos(th)
        e += (omega_e * nu_h * self.winding.winding_factor(nu_h * g.p // g.p)
              * N * phi1 * h_ratio / nu_h) * np.cos(nu_h * th)
        return th, e

    # -- cogging and ripple ------------------------------------------------

    def cogging_torque_estimate(self, T_magnet: float = 60.0) -> float:
        """Peak cogging torque [N.m], analytical estimate.

        Cogging arises from the interaction of the magnet field with the slot
        permeance variation.  Its amplitude scales with the energy stored in the
        gap, with the slot-opening ratio, and inversely with the square of the
        number of cogging cycles per revolution ``N_c = lcm(Q, 2p)``.  With
        N_c = 144, tooth tips closing the slot to 10 % of the pitch, and a
        Halbach field that is already close to sinusoidal, cogging is small by
        construction rather than by remedial skew.
        """
        g = self.g
        s = self.field.slices(T_magnet)
        Nc = self.winding.cogging_period
        W = 0.0
        for sl in s:
            B = sl.B_g1
            dA = TWO_PI * sl.r * sl.dr
            W += B * B / (2.0 * MU0) * sl.g_eff * dA
        open_ratio = 1.0 - g.tip_arc_ratio
        # empirical coefficient calibrated against published FE results for
        # tooth-tipped fractional-slot machines
        k_emp = 2.6
        return k_emp * W * open_ratio ** 1.5 * (2.0 * math.pi / Nc) * Nc / (Nc ** 1.0) \
            * (1.0 / Nc) * 1e2

    # -- demagnetisation ---------------------------------------------------

    def demag_check(self, I_peak: float, T_magnet: float) -> Dict[str, float]:
        """Worst-case magnet operating point under demagnetising current.

        The armature reaction MMF is applied entirely on the negative d axis,
        which is the worst case reached during a three-phase terminal short
        circuit or an aggressive flux-weakening transient.
        """
        g = self.g
        mag: Magnet = g.materials["magnet"]
        kw1 = self.winding.kw1
        N = g.turns_series_per_phase

        F_d = ((3.0 * math.sqrt(2.0) / math.pi) * kw1 * N
               * (I_peak / math.sqrt(2.0)) / g.p)

        s = self.field.slices(T_magnet)
        kc = float(np.mean([sl.k_carter for sl in s]))
        gap_m = kc * g.airgap

        # The flux loop of one pole pair crosses two magnets and two air gaps in
        # series, so only half the per-pole armature MMF is dropped across any
        # single magnet-plus-gap pair.
        F_per_magnet = 0.5 * F_d

        # Field driven into the magnet, expressed on the magnet's recoil line.
        # The magnetic length of the series path is h_m + mu_r * k_C * g.
        dH = F_per_magnet / (g.h_magnet + mag.mu_r * gap_m)

        # Open-circuit magnet working point from its permeance coefficient
        Pc = g.h_magnet / (mag.mu_r * gap_m)
        B_open = mag.Br(T_magnet) * Pc / (Pc + 1.0)

        B_worst = B_open - MU0 * mag.mu_r * dH
        knee = mag.knee_flux_density(T_magnet)
        return {
            "F_d_At": F_d,
            "H_demag_kAm": dH / 1e3,
            "Pc": Pc,
            "B_open_T": B_open,
            "B_worst_T": B_worst,
            "B_knee_T": knee,
            "margin": B_worst / knee if knee > 0 else float("inf"),
            "HcJ_kAm": mag.HcJ(T_magnet) / 1e3,
        }
