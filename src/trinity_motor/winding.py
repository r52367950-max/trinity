"""
Winding layout and MMF harmonic analysis.

The TAF-500 uses an 18-slot / 16-pole double-layer fractional-slot concentrated
winding (FSCW).  Every tooth carries one pre-wound coil, which is what makes the
segmented yokeless stator manufacturable: the coils are wound on formers off the
machine, pressed onto the tooth cores, and only then assembled into the ring.

The phase allocation is derived from the star of slots rather than hard-coded,
so alternative slot/pole combinations can be evaluated by changing the geometry
alone.

Harmonic content is computed numerically from the winding function instead of
from closed-form winding-factor tables.  A two-dimensional FFT over space and
time recovers both the amplitude *and the direction of rotation* of every MMF
harmonic, which is what the rotor-loss model needs: it is the harmonics that
slip against the rotor, not the working harmonic, that heat the magnets.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np

from .geometry import Geometry

TWO_PI = 2.0 * math.pi


@dataclass
class MMFHarmonic:
    order: int          # pole-pair order nu (spatial harmonic)
    amplitude: float    # A-turns, peak of the rotating wave
    forward: bool       # True if it rotates with the rotor direction
    rotor_freq_ratio: float  # f_seen_by_rotor / f_electrical

    @property
    def is_working(self) -> bool:
        return self.rotor_freq_ratio < 1e-6


class Winding:
    """Star-of-slots phase allocation and harmonic analysis for the stator."""

    PHASE_NAMES = ("U", "V", "W")

    def __init__(self, geom: Geometry):
        self.g = geom
        self.Q = geom.n_slots
        self.p = geom.p
        self.m = geom.n_phases
        self.layout = self._allocate_phases()

    # ------------------------------------------------------------------
    # Star of slots
    # ------------------------------------------------------------------

    def _slot_emf_angles(self) -> np.ndarray:
        """Electrical angle [rad] of each slot's EMF phasor."""
        k = np.arange(self.Q)
        return (k * self.p * TWO_PI / self.Q) % TWO_PI

    def _allocate_phases(self) -> List[Tuple[int, int]]:
        """Assign every tooth coil to a phase with a polarity.

        Returns a list indexed by tooth number of ``(phase_index, sign)``.

        The rule is the standard one: a coil belongs to the phase whose axis its
        EMF phasor lies closest to, taking the polarity that brings the phasor
        into the +-90 degree half-plane around that axis.  For a feasible
        slot/pole combination this yields exactly Q/m coils per phase.
        """
        angles = self._slot_emf_angles()
        layout: List[Tuple[int, int]] = []
        counts = [0] * self.m
        per_phase = self.Q // self.m

        # Order the coils by how unambiguous their allocation is, so that the
        # balancing fallback only ever perturbs genuinely borderline coils.
        def best_fit(a: float):
            options = []
            for ph in range(self.m):
                axis = ph * TWO_PI / self.m
                d = (a - axis + math.pi) % TWO_PI - math.pi
                if abs(d) <= math.pi / 2:
                    options.append((abs(d), ph, +1))
                else:
                    d2 = (a - axis - math.pi + math.pi) % TWO_PI - math.pi
                    options.append((abs(d2), ph, -1))
            options.sort()
            return options

        prelim = [best_fit(a) for a in angles]
        order = sorted(range(self.Q), key=lambda j: prelim[j][0][0])

        assigned: Dict[int, Tuple[int, int]] = {}
        for j in order:
            for _, ph, sgn in prelim[j]:
                if counts[ph] < per_phase:
                    assigned[j] = (ph, sgn)
                    counts[ph] += 1
                    break
        layout = [assigned[j] for j in range(self.Q)]
        return layout

    def phase_coils(self, phase: int) -> List[Tuple[int, int]]:
        """List of ``(tooth_index, sign)`` for the given phase."""
        return [(j, s) for j, (ph, s) in enumerate(self.layout) if ph == phase]

    # ------------------------------------------------------------------
    # Analytical winding factors
    # ------------------------------------------------------------------

    def pitch_factor(self, nu: int) -> float:
        """Pitch factor of a single tooth-wound coil for spatial order ``nu``.

        The coil spans exactly one slot pitch, so its span in electrical radians
        for harmonic nu is ``nu * 2*pi / Q`` and the pitch factor is the sine of
        half that angle.
        """
        return abs(math.sin(nu * math.pi / self.Q))

    def distribution_factor(self, nu: int, phase: int = 0) -> float:
        coils = self.phase_coils(phase)
        s = sum(sgn * np.exp(-1j * nu * j * TWO_PI / self.Q) for j, sgn in coils)
        return abs(s) / len(coils)

    def winding_factor(self, nu: int, phase: int = 0) -> float:
        """Total winding factor for spatial harmonic order ``nu`` (pole pairs)."""
        return self.pitch_factor(nu) * self.distribution_factor(nu, phase)

    @property
    def kw1(self) -> float:
        """Winding factor of the working (torque-producing) harmonic."""
        return self.winding_factor(self.p)

    # ------------------------------------------------------------------
    # Winding function and numerical MMF spectrum
    # ------------------------------------------------------------------

    def turns_function(self, n_theta: int = 4096) -> np.ndarray:
        """Turns function N_ph(theta) for each phase, shape ``(m, n_theta)``.

        A tooth-wound coil produces a rectangular pulse of MMF over the tooth it
        surrounds.  The turns function is that pulse with the DC component
        removed (the flux must close, so the mean of the winding function around
        the air gap is zero).
        """
        theta = np.linspace(0.0, TWO_PI, n_theta, endpoint=False)
        N = np.zeros((self.m, n_theta))
        half = math.pi / self.Q   # half a slot pitch in mechanical radians

        for j, (ph, sgn) in enumerate(self.layout):
            centre = j * TWO_PI / self.Q
            d = (theta - centre + math.pi) % TWO_PI - math.pi
            pulse = (np.abs(d) <= half).astype(float)
            N[ph] += sgn * self.g.turns_per_coil * pulse

        N -= N.mean(axis=1, keepdims=True)
        return N

    def mmf_spectrum(self, current_rms: float, n_theta: int = 4096,
                     n_time: int = 256, max_order: int = 60) -> List[MMFHarmonic]:
        """Rotating MMF harmonic spectrum for balanced sinusoidal excitation.

        The MMF distribution is assembled in space and time and transformed with
        a 2-D FFT.  A component that appears at spatial order ``nu`` and time
        order ``+1`` rotates forward; at time order ``-1`` it rotates backward.
        """
        N = self.turns_function(n_theta)
        # series turns per phase seen by the terminal current, accounting for
        # the parallel paths
        scale = 1.0 / self.g.parallel_paths
        t = np.arange(n_time) / n_time            # one electrical period
        wt = TWO_PI * t
        I = math.sqrt(2.0) * current_rms
        currents = np.stack(
            [I * np.cos(wt - k * TWO_PI / self.m) for k in range(self.m)]
        )                                          # (m, n_time)

        mmf = scale * np.einsum("pt,px->tx", currents, N)   # (n_time, n_theta)

        F = np.fft.fft2(mmf) / (n_time * n_theta)

        harmonics: List[MMFHarmonic] = []
        for nu in range(1, max_order + 1):
            # forward wave: exp(j(wt - nu*theta)) -> time index +1, space index -nu
            a_fwd = 2.0 * abs(F[1, (-nu) % n_theta])
            a_bwd = 2.0 * abs(F[1, nu % n_theta])
            for amp, fwd in ((a_fwd, True), (a_bwd, False)):
                if amp < 1e-6:
                    continue
                if fwd:
                    ratio = abs(1.0 - nu / self.p)
                else:
                    ratio = abs(1.0 + nu / self.p)
                harmonics.append(MMFHarmonic(nu, amp, fwd, ratio))

        harmonics.sort(key=lambda h: -h.amplitude)
        return harmonics

    # ------------------------------------------------------------------
    # Cogging and symmetry diagnostics
    # ------------------------------------------------------------------

    @property
    def t_symmetry(self) -> int:
        """t = gcd(Q, p).  The machine has t identical magnetic sectors."""
        return math.gcd(self.Q, self.p)

    @property
    def cogging_period(self) -> int:
        """Number of cogging torque cycles per mechanical revolution = lcm(Q, 2p).

        A large value means many small cogging events per turn rather than a few
        large ones, and the peak amplitude falls roughly as its inverse square.
        """
        return int(np.lcm(self.Q, self.g.n_poles))

    @property
    def is_balanced(self) -> bool:
        """A winding is balanced when every phase holds the same coil count and
        the three phase-EMF phasors sum to zero."""
        counts = [len(self.phase_coils(k)) for k in range(self.m)]
        if len(set(counts)) != 1:
            return False
        tot = 0j
        for ph in range(self.m):
            s = sum(sgn * np.exp(-1j * self.p * j * TWO_PI / self.Q)
                    for j, sgn in self.phase_coils(ph))
            tot += s * np.exp(1j * ph * TWO_PI / self.m)
        return abs(tot) > 1e-6   # phasors add constructively per phase

    def unbalanced_magnetic_pull_order(self) -> int:
        """Lowest spatial order of the radial force wave.

        Order 0 is a pure axial force (harmless in this topology, and cancelled
        between the two rotors); order 1 is a net side pull on the bearings;
        order 2 and above are ovalising modes that matter only for NVH.
        """
        return self.t_symmetry if self.t_symmetry < 3 else self.t_symmetry

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------

    def layout_string(self) -> str:
        syms = []
        for ph, sgn in self.layout:
            syms.append(("+" if sgn > 0 else "-") + self.PHASE_NAMES[ph])
        return " ".join(syms)

    def summary(self, current_rms: float = 300.0) -> str:
        lines = [
            "WINDING SUMMARY",
            "-" * 62,
            f"  Configuration            {self.Q} slots / {self.g.n_poles} poles,"
            f" double layer FSCW",
            f"  Coils per phase          {len(self.phase_coils(0))}",
            f"  Tooth sequence           {self.layout_string()}",
            f"  Balanced                 {self.is_balanced}",
            f"  Working harmonic nu      {self.p}",
            f"  Winding factor kw1       {self.kw1:.4f}",
            f"  Pitch factor kp1         {self.pitch_factor(self.p):.4f}",
            f"  Distribution factor kd1  {self.distribution_factor(self.p):.4f}",
            f"  Symmetry t = gcd(Q,p)    {self.t_symmetry}",
            f"  Cogging cycles / rev     {self.cogging_period}",
            "",
            "  MMF HARMONIC SPECTRUM (top 8, at "
            f"{current_rms:.0f} A rms)",
            f"    {'nu':>4s} {'dir':>4s} {'A-turns':>10s} {'f_rot/f_e':>10s}  role",
        ]
        for h in self.mmf_spectrum(current_rms)[:8]:
            role = "WORKING" if h.is_working else (
                "sub-harmonic" if h.order < self.p else "slot harmonic")
            lines.append(
                f"    {h.order:4d} {'fwd' if h.forward else 'bwd':>4s} "
                f"{h.amplitude:10.1f} {h.rotor_freq_ratio:10.3f}  {role}"
            )
        return "\n".join(lines)
