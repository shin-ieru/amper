/** Case-recovery corpus (product milestone). [typed, expected] — Product profile, Space-terminated. */
export const CASE_RECOVERY_AUTO: [string, string][] = [
  // required examples
  ["h2o", "H₂O"], ["h2so4", "H₂SO₄"], ["nacl", "NaCl"], ["fecl3", "FeCl₃"], ["kmno4", "KMnO₄"], ["c6h12o6", "C₆H₁₂O₆"],
  // Co/CO, No/NO, Nh/NH, Sn/SN, Cs/CS-style collisions resolved by the lexicon
  ["co2", "CO₂"], ["no2", "NO₂"], ["nh3", "NH₃"], ["cs2", "CS₂"], ["sncl2", "SnCl₂"], ["hno3", "HNO₃"], ["agno3", "AgNO₃"],
  ["ch4", "CH₄"], ["cuso4", "CuSO₄"], ["caco3", "CaCO₃"], ["nahco3", "NaHCO₃"], ["cacl2", "CaCl₂"], ["mgso4", "MgSO₄"],
  ["na2co3", "Na₂CO₃"], ["k2cr2o7", "K₂Cr₂O₇"], ["h3po4", "H₃PO₄"], ["so2", "SO₂"], ["sf6", "SF₆"], ["bf3", "BF₃"],
  ["sicl4", "SiCl₄"], ["nicl2", "NiCl₂"], ["c2h5oh", "C₂H₅OH"], ["ch3cooh", "CH₃COOH"], ["h2o2", "H₂O₂"],
  ["ca(oh)2", "Ca(OH)₂"], ["al2(so4)3", "Al₂(SO₄)₃"], ["(nh4)2so4", "(NH₄)₂SO₄"], ["fe2(so4)3", "Fe₂(SO₄)₃"],
  // digit-free curated compounds
  ["naoh", "NaOH"], ["hcl", "HCl"], ["kcl", "KCl"], ["agcl", "AgCl"], ["kbr", "KBr"], ["hcn", "HCN"],
  // sentence-start capitalisation and partial case errors
  ["Nacl", "NaCl"], ["H2so4", "H₂SO₄"], ["Fecl3", "FeCl₃"], ["H2So4", "H₂SO₄"], ["KMNO4".toLowerCase(), "KMnO₄"],
  // coefficients, states, hydrates
  ["2h2o", "2H₂O"], ["h2o(l)", "H₂O(l)"], ["co2(g)", "CO₂(g)"], ["nacl(aq)", "NaCl(aq)"], ["cuso4·5h2o", "CuSO₄·5H₂O"],
  // ions
  // elemental molecules (lowercase recovery; "h2" deliberately excluded, see ELEMENTAL_FORMS)
  ["h2", "H₂"], ["n2", "N₂"], ["o2", "O₂"], ["f2", "F₂"], ["cl2", "Cl₂"], ["br2", "Br₂"], ["i2", "I₂"], ["o3", "O₃"], ["s8", "S₈"],
  ["so4^2-", "SO₄²⁻"], ["co3^2-", "CO₃²⁻"], ["nh4+", "NH₄⁺"], ["no3-", "NO₃⁻"], ["oh-", "OH⁻"],
  ["fe3+", "Fe³⁺"], ["na+", "Na⁺"], ["cl-", "Cl⁻"], ["ca2+", "Ca²⁺"],
];

/** Capitalisation is chemically ambiguous: offered, never applied. [typed, alternatives offered]. */
export const CASE_RECOVERY_AMBIGUOUS: [string, string[]][] = [
  ["cocl2", ["CoCl₂", "COCl₂"]], // cobalt(II) chloride vs phosgene
  ["Cocl2", ["CoCl₂", "COCl₂"]],
];

/** Plausible but unlisted: suggested only. */
export const CASE_RECOVERY_SUGGEST_ONLY = ["cof2", "mnbr2", "crcl3"];

/** Never changed automatically by case recovery. */
export const CASE_RECOVERY_NEGATIVE = [
  // identifiers and products, lower-cased
  "usb3", "c3po", "b2b", "ps5", "css3", "k8s", "ipv6", "i18n", "mp3", "h264", "m2", "a4", "f1", "r2", "x2", "h1n1",
  "covid19", "web3", "html5", "es6", "vp9", "win10", "ios17", "mac15", "gen2", "b12", "u2", "v8", "w3c", "y2k", "p2p",
  // lone elements that are identifiers (h1 has an explicit count of 1; h3, u2, b12 are not elemental)
  "h1", "h3", "u2", "b12",
  // code/markup contexts around an elemental token
  "`h2`", "<h2>", "h2.title", "/docs/h2",
  // ordinary words, including ones that tokenise into elements
  "bacon", "koh", "Koh", "no", "No", "hi", "co", "he", "in", "as", "so", "be", "chips", "nah", "cab", "bash", "cop",
  "scones", "phone", "sip", "ships", "boss", "cash", "nice", "once", "pinch", "chop",
  // non-compounds that tokenise
  "sp3", "nh4no2x", "i18n",
  // URLs, files, versions
  "https://x.com/h2o", "h2o.com", "user@h2o.org", "v2.0", "/tmp/h2so4",
];
