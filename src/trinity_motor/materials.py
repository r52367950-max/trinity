"""
Material property database for the TRINITY TAF-500 axial-flux machine.

All properties are in SI base units unless the attribute name states otherwise.
Temperature-dependent properties are exposed as methods taking temperature in
degrees Celsius.

Data provenance is recorded in the ``source`` field of every record so that the
design can be audited.  Where a coefficient has been fitted to published loss
tables rather than quoted directly, the fit and its residual are documented in
``docs/research/materials.md``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import sqrt

MU0 = 4.0e-7 * 3.14159265358979323846  # H/m


# ---------------------------------------------------------------------------
# Soft magnetic materials
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SoftMagnetic:
    """Laminated / composite soft magnetic material.

    Core loss uses the Bertotti three-term separation

        p = Kh * f * B**alpha  +  Ke * f**2 * B**2  +  Kexc * f**1.5 * B**1.5

    with ``p`` in W/kg, ``f`` in Hz and ``B`` the peak flux density in T.
    Coefficients are fitted to the manufacturer's Epstein-frame loss table over
    50 Hz - 2 kHz and 0.5 - 1.5 T.
    """

    name: str
    grade: str
    thickness_mm: float
    density: float          # kg/m^3
    B_sat: float            # T, technical saturation
    mu_r_max: float         # peak relative permeability
    resistivity: float      # ohm.m
    stacking_factor: float  # -
    kh: float               # Bertotti hysteresis coefficient
    alpha: float            # Steinmetz exponent on B for the hysteresis term
    ke: float               # classical eddy coefficient
    kexc: float             # excess (anomalous) coefficient
    yield_strength: float   # Pa
    youngs_modulus: float   # Pa
    thermal_k: float        # W/m.K, in-plane
    specific_heat: float    # J/kg.K
    source: str = ""

    def core_loss_density(self, f: float, B: float, build_factor: float = 1.0) -> float:
        """Specific core loss [W/kg] for sinusoidal flux at frequency ``f``.

        ``build_factor`` accounts for the degradation between Epstein-frame
        material data and a real cut/stacked core (cutting stress, burrs,
        rotational flux, interlaminar shorts).  1.25-1.7 is typical; the TAF-500
        uses 1.35 based on laser-cut, backlack-bonded 0.10 mm stacks.
        """
        if f <= 0.0 or B <= 0.0:
            return 0.0
        p_hys = self.kh * f * B ** self.alpha
        p_eddy = self.ke * f * f * B * B
        p_exc = self.kexc * f ** 1.5 * B ** 1.5
        return build_factor * (p_hys + p_eddy + p_exc)

    def core_loss_pwm(self, f_e: float, B: float, f_sw: float,
                      ripple_ratio: float = 0.04, build_factor: float = 1.0) -> float:
        """Core loss including the PWM carrier ripple contribution.

        The carrier adds a small high-frequency flux ripple of amplitude
        ``ripple_ratio * B`` at the switching frequency.  Because the classical
        eddy term scales with f^2, even a few percent of ripple at 12-20 kHz is
        not negligible.  Superposition of the fundamental and the carrier band
        is the standard engineering approximation (iGSE gives similar numbers
        for this duty).
        """
        p_fund = self.core_loss_density(f_e, B, build_factor)
        p_ripple = self.core_loss_density(f_sw, ripple_ratio * B, build_factor)
        return p_fund + p_ripple


# JFE Super Core 10JNEX900: 0.10 mm, 6.5 % Si non-oriented.
# The reference high-frequency traction lamination; loss coefficients fitted to
# W10/400 = 3.3, W10/1000 = 11.5, W10/2000 = 32 W/kg.
JNEX900_010 = SoftMagnetic(
    name="Ultra-thin 6.5%Si non-oriented electrical steel",
    grade="JFE 10JNEX900 (0.10 mm)",
    thickness_mm=0.10,
    density=7490.0,
    B_sat=1.88,
    mu_r_max=18000.0,
    resistivity=0.82e-6,
    stacking_factor=0.94,
    kh=0.01628,
    alpha=1.90,
    ke=2.68e-6,
    kexc=8.24e-5,
    yield_strength=390e6,
    youngs_modulus=200e9,
    thermal_k=19.0,
    specific_heat=460.0,
    source=(
        "JFE Super Core. ke computed classically as pi^2 d^2/(6 rho gamma) "
        "= 2.68e-6, which reproduces the independently reported 0.43 W/kg "
        "classical eddy loss at 1 T / 400 Hz. kh and kexc then fitted to "
        "W10/50 = 0.85 and W10/400 = 7.6 W/kg (typical, against the 9.0 W/kg "
        "grade guarantee). Note this grade is HYSTERESIS dominated at traction "
        "frequencies: the eddy term is under 6 percent of total loss at 400 Hz."
    ),
)

# Conventional 0.20 mm traction lamination, used for the rotor back-iron where
# the flux is quasi-DC in the rotor frame and loss matters far less than cost.
NO20_020 = SoftMagnetic(
    name="Non-oriented electrical steel",
    grade="NO20 / 20JNEH1200 class (0.20 mm)",
    thickness_mm=0.20,
    density=7600.0,
    B_sat=2.00,
    mu_r_max=12000.0,
    resistivity=0.52e-6,
    stacking_factor=0.96,
    kh=0.01161,
    alpha=1.85,
    ke=1.665e-5,
    kexc=3.62e-4,
    yield_strength=420e6,
    youngs_modulus=200e9,
    thermal_k=25.0,
    specific_heat=460.0,
    source=("20JNEH1200 class: grade code guarantees W10/400 <= 12.0 W/kg. "
            "ke computed classically = 1.665e-5; kh, kexc fitted to "
            "W10/50 = 0.75 and W10/400 = 10.2 W/kg typical."),
)

# Cobalt-iron, retained in the library as the high-saturation alternative for
# the tooth tips if local saturation ever governs.
VACODUR49 = SoftMagnetic(
    name="Cobalt-iron 49%Co",
    grade="VACODUR 49 / Hiperco 50 (0.10 mm)",
    thickness_mm=0.10,
    density=8120.0,
    B_sat=2.35,
    mu_r_max=15000.0,
    resistivity=0.42e-6,
    stacking_factor=0.93,
    kh=0.0088,
    alpha=1.85,
    ke=6.0e-6,
    kexc=2.0e-4,
    yield_strength=450e6,
    youngs_modulus=210e9,
    thermal_k=29.0,
    specific_heat=420.0,
    source="VACUUMSCHMELZE VACODUR 49 datasheet (indicative)",
)

# Soft magnetic composite, kept for the tooth-tip flux guides where a genuine
# 3-D flux path exists and laminations cannot follow it.
SOMALOY_700 = SoftMagnetic(
    name="Soft magnetic composite",
    grade="Hoganas Somaloy 700 3P",
    thickness_mm=0.0,
    density=7550.0,
    B_sat=1.63,
    mu_r_max=750.0,
    resistivity=400e-6,
    stacking_factor=1.0,
    kh=0.0290,
    alpha=1.80,
    ke=2.0e-7,
    kexc=8.0e-5,
    yield_strength=120e6,
    youngs_modulus=180e9,
    thermal_k=17.0,
    specific_heat=460.0,
    source="Hoganas Somaloy product guide (indicative)",
)


# ---------------------------------------------------------------------------
# Permanent magnets
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Magnet:
    name: str
    grade: str
    Br_20: float           # T at 20 C
    HcJ_20: float          # A/m at 20 C (intrinsic coercivity)
    BHmax_20: float        # J/m^3
    alpha_Br: float        # 1/K, reversible temperature coefficient of Br
    beta_HcJ: float        # 1/K, reversible temperature coefficient of HcJ
    mu_r: float            # recoil relative permeability
    resistivity: float     # ohm.m
    density: float         # kg/m^3
    T_max: float           # deg C, maximum continuous operating temperature
    tensile_strength: float      # Pa
    compressive_strength: float  # Pa
    youngs_modulus: float  # Pa
    thermal_k: float       # W/m.K
    specific_heat: float   # J/kg.K
    source: str = ""

    def Br(self, T: float) -> float:
        """Remanence [T] at temperature ``T`` in deg C."""
        return self.Br_20 * (1.0 + self.alpha_Br * (T - 20.0))

    def HcJ(self, T: float) -> float:
        """Intrinsic coercivity [A/m] at temperature ``T`` in deg C."""
        return self.HcJ_20 * (1.0 + self.beta_HcJ * (T - 20.0))

    def knee_flux_density(self, T: float) -> float:
        """Approximate flux density at the demagnetisation knee [T].

        For sintered NdFeB the second-quadrant B-H curve stays linear until the
        intrinsic curve rolls over.  A widely used engineering approximation
        places the knee at the point where the applied field reaches about 80 %
        of HcJ; below that flux density the magnet suffers irreversible loss.
        """
        H_knee = 0.80 * self.HcJ(T)
        # B on the recoil line at H = -H_knee, measured from Br
        return max(0.0, self.Br(T) - self.mu_r * MU0 * H_knee)

    def demag_margin(self, B_operating: float, T: float) -> float:
        """Ratio of operating flux density to the knee flux density.

        Values above 1.0 mean the magnet is operating above the knee and is
        safe.  The TAF-500 design rule is >= 1.15 at the worst-case corner
        (peak short-circuit current at maximum magnet temperature).
        """
        knee = self.knee_flux_density(T)
        if knee <= 0.0:
            return float("inf")
        return B_operating / knee


# Grain-boundary-diffused N45SH.  GBD places the heavy rare earth only at the
# grain boundaries, giving SH-class coercivity at roughly a third of the Dy
# content of a conventionally alloyed magnet - materially important given
# 2025-2026 heavy-rare-earth export controls.
N45SH_GBD = Magnet(
    name="Sintered NdFeB, grain-boundary diffused",
    grade="N45SH (GBD, low-Dy)",
    Br_20=1.35,
    HcJ_20=1592e3,
    BHmax_20=358e3,
    alpha_Br=-0.00110,
    beta_HcJ=-0.00550,
    mu_r=1.05,
    resistivity=1.40e-6,
    density=7500.0,
    T_max=150.0,
    tensile_strength=80e6,
    compressive_strength=1100e6,
    youngs_modulus=160e9,
    thermal_k=9.0,
    specific_heat=460.0,
    source="Composite of Proterial/Shin-Etsu/JL Mag N45SH datasheets",
)

N42UH_GBD = Magnet(
    name="Sintered NdFeB, grain-boundary diffused, high coercivity",
    grade="N42UH (GBD)",
    Br_20=1.30,
    HcJ_20=1990e3,
    BHmax_20=326e3,
    alpha_Br=-0.00110,
    beta_HcJ=-0.00500,
    mu_r=1.05,
    resistivity=1.45e-6,
    density=7500.0,
    T_max=180.0,
    tensile_strength=80e6,
    compressive_strength=1100e6,
    youngs_modulus=160e9,
    thermal_k=9.0,
    specific_heat=460.0,
    source="Composite of sintered NdFeB UH-class datasheets",
)

SM2CO17_HT = Magnet(
    name="Samarium cobalt Sm2Co17",
    grade="Recoma 33E / equivalent",
    Br_20=1.12,
    HcJ_20=1990e3,
    BHmax_20=240e3,
    alpha_Br=-0.00035,
    beta_HcJ=-0.00250,
    mu_r=1.06,
    resistivity=0.86e-6,
    density=8400.0,
    T_max=350.0,
    tensile_strength=35e6,
    compressive_strength=800e6,
    youngs_modulus=150e9,
    thermal_k=10.0,
    specific_heat=350.0,
    source="Arnold/Vacuumschmelze Sm2Co17 datasheets",
)


# ---------------------------------------------------------------------------
# Conductors
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Conductor:
    name: str
    resistivity_20: float   # ohm.m at 20 C
    alpha_T: float          # 1/K temperature coefficient of resistivity
    density: float          # kg/m^3
    thermal_k: float        # W/m.K
    specific_heat: float    # J/kg.K
    source: str = ""

    def resistivity(self, T: float) -> float:
        return self.resistivity_20 * (1.0 + self.alpha_T * (T - 20.0))

    def skin_depth(self, f: float, T: float) -> float:
        """Electromagnetic skin depth [m] at frequency ``f`` and temperature ``T``."""
        if f <= 0.0:
            return float("inf")
        return sqrt(self.resistivity(T) / (3.14159265358979 * f * MU0))


COPPER = Conductor(
    name="ETP / OF copper magnet wire",
    resistivity_20=1.724e-8,
    alpha_T=3.93e-3,
    density=8933.0,
    thermal_k=400.0,
    specific_heat=385.0,
    source="IEC 60028 international annealed copper standard",
)


# ---------------------------------------------------------------------------
# Structural materials
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Structural:
    name: str
    density: float          # kg/m^3
    E: float                # Pa, Young's modulus (hoop direction for CFRP)
    E_radial: float         # Pa, transverse modulus (equals E for isotropic)
    poisson: float
    yield_strength: float   # Pa (UTS for brittle/composite materials)
    uts: float              # Pa
    design_allowable: float  # Pa, stress used for sizing
    cte: float              # 1/K
    thermal_k: float        # W/m.K
    specific_heat: float    # J/kg.K
    T_max: float            # deg C
    source: str = ""


TI6AL4V = Structural(
    name="Titanium alloy Ti-6Al-4V (Grade 5), solution treated and aged",
    density=4430.0, E=113.8e9, E_radial=113.8e9, poisson=0.342,
    yield_strength=880e6, uts=950e6, design_allowable=520e6,
    cte=8.6e-6, thermal_k=6.7, specific_heat=526.0, T_max=400.0,
    source="ASM Handbook / AMS 4928",
)

CFRP_T700_HOOP = Structural(
    name="Filament-wound T700 carbon/epoxy, hoop-dominated layup",
    density=1550.0, E=135e9, E_radial=8.5e9, poisson=0.30,
    yield_strength=2550e6, uts=2550e6, design_allowable=1100e6,
    cte=-0.3e-6, thermal_k=0.8, specific_heat=900.0, T_max=180.0,
    source="Toray T700S prepreg datasheet, 60 % fibre volume fraction",
)

STEEL_42CRMO4 = Structural(
    name="42CrMo4 / AISI 4140 quenched and tempered",
    density=7850.0, E=210e9, E_radial=210e9, poisson=0.30,
    yield_strength=900e6, uts=1100e6, design_allowable=450e6,
    cte=12.3e-6, thermal_k=42.0, specific_heat=460.0, T_max=400.0,
    source="EN 10083-3",
)

ALSI10MG_AM = Structural(
    name="AlSi10Mg, laser powder bed fusion, T6",
    density=2670.0, E=70e9, E_radial=70e9, poisson=0.33,
    yield_strength=230e6, uts=330e6, design_allowable=110e6,
    cte=21.0e-6, thermal_k=130.0, specific_heat=910.0, T_max=200.0,
    source="EOS AlSi10Mg material datasheet",
)

AL6061_T6 = Structural(
    name="Aluminium 6061-T6",
    density=2700.0, E=68.9e9, E_radial=68.9e9, poisson=0.33,
    yield_strength=276e6, uts=310e6, design_allowable=140e6,
    cte=23.6e-6, thermal_k=167.0, specific_heat=896.0, T_max=170.0,
    source="ASM Handbook",
)


# ---------------------------------------------------------------------------
# Insulation and impregnation
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Insulation:
    name: str
    thermal_class_C: float      # deg C
    thermal_k: float            # W/m.K
    dielectric_strength: float  # V/m
    thickness_mm: float
    source: str = ""


SLOT_LINER_NOMEX = Insulation(
    name="Aramid slot liner (Nomex 410 equivalent)",
    thermal_class_C=220.0, thermal_k=0.14,
    dielectric_strength=2.7e7, thickness_mm=0.25,
    source="DuPont Nomex 410 datasheet",
)

POTTING_CERAMIC_EPOXY = Insulation(
    name="Ceramic-filled epoxy potting compound",
    thermal_class_C=200.0, thermal_k=1.60,
    dielectric_strength=1.8e7, thickness_mm=0.0,
    source="Typical alumina-filled electrical potting resin",
)

# Corona-resistant grade-2 magnet wire is mandatory on an 800 V bus: the
# partial-discharge inception voltage of a plain polyester-imide film sits too
# close to the peak turn-to-turn stress produced by fast SiC edges.
MAGNET_WIRE_CORONA = Insulation(
    name="Corona-resistant polyimide/PEEK overcoat magnet wire, grade 2",
    thermal_class_C=220.0, thermal_k=0.21,
    dielectric_strength=1.4e8, thickness_mm=0.075,
    source="IEC 60317-13 / IEC 60034-18-41 Type II qualified",
)


# ---------------------------------------------------------------------------
# Coolants
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Coolant:
    name: str
    density_40: float       # kg/m^3 at 40 C
    specific_heat_40: float  # J/kg.K at 40 C
    thermal_k_40: float     # W/m.K at 40 C
    kin_visc_40: float      # m^2/s at 40 C
    kin_visc_100: float     # m^2/s at 100 C
    dielectric: bool
    source: str = ""

    def density(self, T: float) -> float:
        # Linear thermal expansion of the liquid, ~7e-4 /K for an ester/PAO base
        return self.density_40 * (1.0 - 7.0e-4 * (T - 40.0))

    def specific_heat(self, T: float) -> float:
        return self.specific_heat_40 * (1.0 + 1.8e-3 * (T - 40.0))

    def thermal_k(self, T: float) -> float:
        return self.thermal_k_40 * (1.0 - 6.0e-4 * (T - 40.0))

    def kin_viscosity(self, T: float) -> float:
        """Kinematic viscosity [m^2/s] via the Walther/ASTM D341 relation.

        log10(log10(nu_cSt + 0.7)) = A - B * log10(T_K)

        A and B are recovered from the 40 C and 100 C reference points, which is
        exactly how a lubricant's viscosity index is defined.
        """
        import math
        t1, t2 = 313.15, 373.15
        z1 = math.log10(math.log10(self.kin_visc_40 * 1e6 + 0.7))
        z2 = math.log10(math.log10(self.kin_visc_100 * 1e6 + 0.7))
        B = (z1 - z2) / (math.log10(t2) - math.log10(t1))
        A = z1 + B * math.log10(t1)
        z = A - B * math.log10(T + 273.15)
        nu_cst = 10.0 ** (10.0 ** z) - 0.7
        return max(1.0e-6, nu_cst * 1e-6)

    def prandtl(self, T: float) -> float:
        mu = self.kin_viscosity(T) * self.density(T)
        return mu * self.specific_heat(T) / self.thermal_k(T)


# Low-viscosity dielectric e-fluid.  Direct contact with the winding is only
# permissible with a fluid of this class; a conventional ATF with a metallic
# detergent package is not acceptable against an 800 V winding.
EFLUID_ATF = Coolant(
    name="Dedicated EV e-fluid (Shell E-Fluid / Castrol ON class)",
    density_40=825.0,
    specific_heat_40=2050.0,
    thermal_k_40=0.136,
    kin_visc_40=9.5e-6,
    kin_visc_100=2.6e-6,
    dielectric=True,
    source="Shell E-Fluid E6 / Castrol ON EV Transmission Fluid datasheets",
)

WEG_5050 = Coolant(
    name="Water / ethylene glycol 50:50",
    density_40=1060.0,
    specific_heat_40=3300.0,
    thermal_k_40=0.400,
    kin_visc_40=2.4e-6,
    kin_visc_100=0.75e-6,
    dielectric=False,
    source="ASHRAE Handbook glycol property tables",
)


# ---------------------------------------------------------------------------
# Bill of materials cost model (2026 indicative, EUR)
# ---------------------------------------------------------------------------

MATERIAL_COST_EUR_PER_KG = {
    "NdFeB N45SH GBD": 105.0,
    "NdFeB N42UH GBD": 128.0,
    "Sm2Co17": 190.0,
    "JFE 10JNEX900": 22.0,
    "NO20": 3.2,
    "Copper magnet wire (corona resistant)": 19.0,
    "Ti-6Al-4V": 48.0,
    "CFRP T700 filament wound": 62.0,
    "42CrMo4": 2.4,
    "AlSi10Mg (AM, incl. process)": 95.0,
    "Al 6061-T6": 5.5,
    "Potting/impregnation resin": 14.0,
}


DEFAULT_MATERIALS = {
    "stator_core": JNEX900_010,
    "rotor_back_iron": NO20_020,
    "tooth_tip": SOMALOY_700,
    "magnet": N42UH_GBD,
    "conductor": COPPER,
    "rotor_carrier": TI6AL4V,
    "retaining_band": CFRP_T700_HOOP,
    "shaft": STEEL_42CRMO4,
    "housing": ALSI10MG_AM,
    "slot_liner": SLOT_LINER_NOMEX,
    "potting": POTTING_CERAMIC_EPOXY,
    "coolant": EFLUID_ATF,
}
