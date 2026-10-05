/** Phase 2 corpora (spec §52). Expected outputs are computed by independent oracles in phase2.test.ts. */

/** Implicit charges on monatomic ions whose charge is conventional (convert in Chemistry Mode). */
export const MONATOMIC_IONS = [
  "H+", "Li+", "Na+", "K+", "Rb+", "Cs+", "Ag+", "Cu+", "Tl+", "Au+",
  "Mg2+", "Ca2+", "Sr2+", "Ba2+", "Be2+", "Zn2+", "Cd2+", "Fe2+", "Fe3+", "Co2+", "Co3+", "Ni2+",
  "Cu2+", "Mn2+", "Mn7+", "Cr3+", "Cr6+", "Al3+", "Ga3+", "Sc3+", "Pb2+", "Pb4+", "Sn2+", "Sn4+",
  "Hg2+", "Au3+", "Pt2+", "Pt4+", "Pd2+", "Ce3+", "Ce4+", "U4+", "Ti4+", "V5+", "Bi3+", "La3+",
  "F-", "Cl-", "Br-", "I-", "H-", "S2-", "Se2-", "Te2-", "P3-", "As3-",
];

/** Polyatomic ions with a bare sign or a single-digit last count (convert in Chemistry Mode). */
export const POLYATOMIC_IONS = [
  "NH4+", "H3O+", "OH-", "CN-", "SCN-", "OCN-", "NO3-", "NO2-", "ClO-", "ClO2-", "ClO3-", "ClO4-",
  "BrO3-", "IO3-", "IO4-", "MnO4-", "HCO3-", "HSO4-", "HSO3-", "H2PO4-", "HS-", "CH3COO-", "HCOO-",
  "BF4-", "PF6-", "AlCl4-", "NO+", "NO2+", "N2H5+", "CH3NH3+", "PH4+", "SbF6-", "AsF6-", "I3^-",
];

/** Square-bracketed complexes: the trailing number is the charge (convert in Chemistry Mode). */
export const COMPLEX_IONS = [
  "[Fe(CN)6]3-", "[Fe(CN)6]4-", "[Cu(NH3)4]2+", "[Ag(NH3)2]+", "[Co(NH3)6]3+", "[Cr(H2O)6]3+",
  "[Fe(H2O)6]2+", "[Fe(H2O)6]3+", "[PtCl6]2-", "[PtCl4]2-", "[AlF6]3-", "[Zn(OH)4]2-",
  "[Ni(CN)4]2-", "[CuCl4]2-", "[Cu(H2O)6]2+", "[Al(OH)4]-", "[Co(NH3)5Cl]2+", "[Ni(NH3)6]2+",
  "[Fe(SCN)]2+", "[Ag(CN)2]-", "[Au(CN)2]-", "[Cd(NH3)4]2+", "[Co(H2O)6]2+", "[SiF6]2-",
];

/** Explicit caret charges: certain in both modes. */
export const CARET_IONS = [
  "SO4^2-", "CO3^2-", "PO4^3-", "HPO4^2-", "Cr2O7^2-", "CrO4^2-", "S2O3^2-", "C2O4^2-", "SiO3^2-",
  "SO3^2-", "O2^2-", "Hg2^2+", "O2^+", "O2^-", "N3^-", "Fe^3+", "Fe^2+", "Al^3+", "Na^+", "Cl^-",
  "MnO4^-", "NH4^+", "[Fe(CN)6]^3-", "UO2^2+", "VO^2+", "VO2^+", "S4O6^2-", "B4O7^2-", "AsO4^3-",
  "Fe(OH)2^+", "Fe(OH)^2+", "O^2-", "N^3-", "C2^2-", "S2^2-",
];

export const STATES = ["(s)", "(l)", "(g)", "(aq)"];
export const STATE_BASES = [
  "H2O", "CO2", "NaCl", "CaCO3", "HCl", "NaOH", "H2SO4", "AgNO3", "AgCl", "NH3", "CH4", "O2",
  "N2", "H2", "Fe2O3", "CuSO4", "KMnO4", "Ca(OH)2", "Mg(OH)2", "BaSO4", "NaHCO3", "C6H12O6",
  "Na+", "Cl-", "Fe3+", "SO4^2-", "Cu2+", "NH4+",
];

export const HYDRATES = [
  "CuSO4·5H2O", "CoCl2·6H2O", "MgSO4·7H2O", "Na2CO3·10H2O", "CaSO4·2H2O", "BaCl2·2H2O",
  "FeSO4·7H2O", "Na2SO4·10H2O", "ZnSO4·7H2O", "NiCl2·6H2O", "CaCl2·2H2O", "Na2B4O7·10H2O",
  "KAl(SO4)2·12H2O", "MgCl2·6H2O", "CuCl2·2H2O", "FeCl3·6H2O", "AlCl3·6H2O", "Na2S2O3·5H2O",
  "CoSO4·7H2O", "LiOH·H2O", "H2C2O4·2H2O", "BF3·NH3", "Fe(NH4)2(SO4)2·6H2O", "CuSO4*5H2O",
  "CoCl2*6H2O", "CaSO4•2H2O", "MgSO4∙7H2O", "Na2CO3⋅10H2O",
];

export const ISOTOPES = [
  "^1H", "^2H", "^3H", "^3He", "^4He", "^6Li", "^7Li", "^12C", "^13C", "^14C", "^15N", "^16O",
  "^17O", "^18O", "^19F", "^32P", "^35S", "^40K", "^60Co", "^90Sr", "^99Tc", "^131I", "^137Cs",
  "^226Ra", "^235U", "^238U", "^239Pu", "^13CO2", "^18O2", "^13CH4", "^2H2O", "^14CO2",
];

/** [input, expected] — written out by hand; every species is also covered by the oracles above. */
export const REACTIONS: [string, string][] = [
  ["2H2 + O2 -> 2H2O", "2H₂ + O₂ → 2H₂O"],
  ["N2 + 3H2 <=> 2NH3", "N₂ + 3H₂ ⇌ 2NH₃"],
  ["HCl + NaOH -> NaCl + H2O", "HCl + NaOH → NaCl + H₂O"],
  ["CH4 + 2O2 -> CO2 + 2H2O", "CH₄ + 2O₂ → CO₂ + 2H₂O"],
  ["C3H8 + 5O2 -> 3CO2 + 4H2O", "C₃H₈ + 5O₂ → 3CO₂ + 4H₂O"],
  ["2Na + Cl2 -> 2NaCl", "2Na + Cl₂ → 2NaCl"],
  ["CaCO3(s) -> CaO(s) + CO2(g)", "CaCO₃(s) → CaO(s) + CO₂(g)"],
  ["AgNO3(aq) + NaCl(aq) -> AgCl(s) + NaNO3(aq)", "AgNO₃(aq) + NaCl(aq) → AgCl(s) + NaNO₃(aq)"],
  ["Zn + 2HCl -> ZnCl2 + H2", "Zn + 2HCl → ZnCl₂ + H₂"],
  ["2KMnO4 -> K2MnO4 + MnO2 + O2", "2KMnO₄ → K₂MnO₄ + MnO₂ + O₂"],
  ["C6H12O6 + 6O2 -> 6CO2 + 6H2O", "C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O"],
  ["2SO2 + O2 <=> 2SO3", "2SO₂ + O₂ ⇌ 2SO₃"],
  ["CH3COOH + H2O <=> CH3COO- + H3O+", "CH₃COOH + H₂O ⇌ CH₃COO⁻ + H₃O⁺"],
  ["NH3 + H2O <=> NH4+ + OH-", "NH₃ + H₂O ⇌ NH₄⁺ + OH⁻"],
  ["Fe3+ + e- -> Fe2+", "Fe³⁺ + e⁻ → Fe²⁺"],
  ["Cu2+(aq) + 2e- -> Cu(s)", "Cu²⁺(aq) + 2e⁻ → Cu(s)"],
  ["Ag+(aq) + Cl-(aq) -> AgCl(s)", "Ag⁺(aq) + Cl⁻(aq) → AgCl(s)"],
  ["Ba2+ + SO4^2- -> BaSO4", "Ba²⁺ + SO₄²⁻ → BaSO₄"],
  ["MnO4- + 8H+ + 5e- -> Mn2+ + 4H2O", "MnO₄⁻ + 8H⁺ + 5e⁻ → Mn²⁺ + 4H₂O"],
  ["Cr2O7^2- + 14H+ + 6e- -> 2Cr3+ + 7H2O", "Cr₂O₇²⁻ + 14H⁺ + 6e⁻ → 2Cr³⁺ + 7H₂O"],
  ["H2O <-> H2O", "H₂O ⇄ H₂O"],
  ["Fe2+ <- Fe3+ + e-", "Fe²⁺ ← Fe³⁺ + e⁻"],
  ["2 H2 + O2 -> 2 H2O", "2 H₂ + O₂ → 2 H₂O"],
  ["CuSO4·5H2O(s) -> CuSO4(s) + 5H2O(g)", "CuSO₄·5H₂O(s) → CuSO₄(s) + 5H₂O(g)"],
  ["^14C -> ^14N + e-", "¹⁴C → ¹⁴N + e⁻"],
  ["C2H4 + H2 -> C2H6 -> C2H5Cl", "C₂H₄ + H₂ → C₂H₆ → C₂H₅Cl"],
  ["[Cu(H2O)6]2+ + 4NH3 <=> [Cu(NH3)4]2+ + 6H2O", "[Cu(H₂O)₆]²⁺ + 4NH₃ ⇌ [Cu(NH₃)₄]²⁺ + 6H₂O"],
];

/** Must never change automatically in either mode (prose, code, grades, units, dice, versions). */
export const PHASE2_NEGATIVE_TOKENS = [
  "B+", "C-", "O+", "O-", "V+", "V-", "AB+", "A+", "C++", "C#", "U+2192", "+1", "-5", "5+", "10+",
  "x^2", "E=mc^2", "2^10", "10^-3", "K^-1", "s^-1", "m^2", "C*", "H2O*", "item(s)", "(s)", "(aq)",
  "2(a)", "e-mail", "e-commerce", "COVID-19", "pre-2020", "4-5", "Wi-Fi", "A->B", "x->y", "=>",
  "-->", "<=", "v1.0", "2d6", "1d20", "3+", "H2-rich", "Na-K", "CO2-neutral", "NaCl-based", "^",
  "^^", "+-", "1s", "s2", "sp3", "1x2", "2x4", "^2C", "^400U", "Fe3", "Na1", "F1+", "H1N1+",
  ".5H2O", "CuSO4·", "B2B+", "PS5+", "USB3-", "1s3", "2p7",
];

/** Arrow-shaped prose: may be offered as a suggestion, never applied automatically. */
export const ARROW_PROSE = ["x -> y", "a <- b", "1.0 -> 2.0", "start -> finish", "A <=> B", "left <-> right"];

/** Sentences that must stay byte-identical in both modes. */
export const PHASE2_NO_CONVERSION_SENTENCES = [
  "She got a B+ on the test.",
  "Blood type O- is rare.",
  "I write C++ and C# code.",
  "The arrow U+2192 is a code point.",
  "E=mc^2 is famous.",
  "Roll 2d6 for damage.",
  "The score was 3-2.",
  "Use x <- 5 in R.",
  "Press A->B to continue.",
  "Our COVID-19 policy changed.",
  "This is a CO2-neutral process.",
  "Grade B+ work.",
  "Type O+ donors.",
];
