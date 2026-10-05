import type { FormulaFeatures } from "./formulas/features";
import type { FormulaNode } from "./formulas/ast";

/**
 * Common formula bodies (ASCII, no coefficient, charge or state) used to rank
 * case-recovery candidates: "co2" could be CO₂ or Co₂, and this list is what
 * says CO₂. Membership never blocks correctly-capitalised input; it only
 * decides between spellings the user did not capitalise.
 */
export const COMMON_FORMULAS: ReadonlySet<string> = new Set([
  // elements and diatomics
  "H2", "O2", "N2", "F2", "Cl2", "Br2", "I2", "O3", "P4", "S8", "C60",
  // water, oxides, simple gases
  "H2O", "H2O2", "CO", "CO2", "NO", "NO2", "N2O", "N2O4", "N2O5", "SO2", "SO3", "NH3", "CH4", "SiO2",
  "Fe2O3", "Fe3O4", "Al2O3", "CaO", "MgO", "ZnO", "CuO", "Cu2O", "Na2O", "K2O", "Li2O", "TiO2",
  "MnO2", "Cr2O3", "P2O5", "P4O10", "PbO2", "SnO2", "HgO", "Ag2O", "BaO", "V2O5", "UO2", "WO3",
  // acids
  "HCl", "HBr", "HI", "HF", "HCN", "H2S", "HNO3", "HNO2", "H2SO4", "H2SO3", "H3PO4", "H2CO3",
  "HClO4", "HClO3", "HClO", "H3BO3", "HBO2", "H2C2O4", "HCOOH", "CH3COOH", "HC2H3O2", "H2CrO4",
  // bases
  "NaOH", "KOH", "LiOH", "Ca(OH)2", "Mg(OH)2", "Ba(OH)2", "Sr(OH)2", "Al(OH)3", "Fe(OH)3",
  "Fe(OH)2", "Cu(OH)2", "Zn(OH)2", "NH4OH",
  // salts
  "NaCl", "KCl", "KBr", "KI", "NaBr", "NaI", "NaF", "LiCl", "LiBr", "AgCl", "AgBr", "AgI", "CsCl",
  "CaCl2", "MgCl2", "BaCl2", "FeCl2", "FeCl3", "AlCl3", "ZnCl2", "CuCl2", "CoCl2", "NiCl2",
  "SnCl2", "SnCl4", "TiCl4", "NH4Cl", "Na2SO4", "K2SO4", "MgSO4", "CuSO4", "ZnSO4", "FeSO4",
  "BaSO4", "CaSO4", "(NH4)2SO4", "Al2(SO4)3", "Fe2(SO4)3", "NaHSO4", "Na2CO3", "K2CO3",
  "CaCO3", "MgCO3", "BaCO3", "Li2CO3", "NaHCO3", "KHCO3", "NaNO3", "KNO3", "AgNO3", "NH4NO3",
  "Pb(NO3)2", "Cu(NO3)2", "Ca(NO3)2", "Mg(NO3)2", "Zn(NO3)2", "Fe(NO3)3", "Al(NO3)3",
  "Na3PO4", "K3PO4", "Ca3(PO4)2", "NaH2PO4", "Na2HPO4", "KMnO4", "K2MnO4", "K2Cr2O7",
  "Na2Cr2O7", "K2CrO4", "KClO3", "NaClO", "NaClO3", "NaClO4", "Na2S2O3", "Na2S", "ZnS", "FeS2",
  "NaCN", "KCN", "KSCN", "CaF2", "Na2SiO3", "Na2B4O7", "KHC8H4O4",
  // hydrides, halides of nonmetals
  "PCl3", "PCl5", "SiCl4", "CCl4", "CHCl3", "CH2Cl2", "CH3Cl", "BF3", "SF6", "NF3", "XeF4",
  "UF6", "PH3", "SiH4", "B2H6", "LiAlH4", "NaBH4", "CS2", "COCl2",
  // organics
  "C2H6", "C3H8", "C4H10", "C5H12", "C6H14", "C8H18", "C2H4", "C3H6", "C2H2", "C6H6", "C7H8",
  "C10H8", "CH3OH", "C2H5OH", "CH3CH2OH", "C3H7OH", "CH3CHO", "HCHO", "CH3COCH3", "C6H5OH",
  "C6H5NH2", "C6H5COOH", "C6H5CH3", "CH3NH2", "CH3CN", "C6H12O6", "C12H22O11", "C6H12",
  "C9H8O4", "C8H10N4O2", "C3H5(OH)3", "C2H4(OH)2", "CH3COOC2H5", "C2H3Cl",
  // common ion bodies (charge stripped)
  "OH", "NH4", "H3O", "NO3", "NO2", "SO4", "SO3", "CO3", "HCO3", "PO4", "HPO4", "H2PO4", "MnO4",
  "Cr2O7", "CrO4", "ClO4", "ClO3", "ClO", "CN", "SCN", "CH3COO", "C2O4", "S2O3", "HSO4", "O2",
]);

/**
 * Compounds that may be recovered from digit-free lowercase text ("nacl").
 * Deliberately short: excludes anything that is also a word or name
 * ("no", "hi", "co", "koh", "bao", "cao", "feo") and all two-letter tokens.
 */
export const DIGIT_FREE_RECOVERABLE: ReadonlySet<string> = new Set([
  "NaCl", "KCl", "KBr", "NaOH", "HCl", "HBr", "HCN", "NaBr", "LiCl", "LiBr", "AgCl", "AgBr",
  "MgO", "ZnO", "CuO", "NaCN", "KCN", "NaClO", "CsCl", "HgO", "KSCN",
]);

const NONMETALS = new Set([
  "H", "He", "B", "C", "N", "O", "F", "Ne", "Si", "P", "S", "Cl", "Ar", "Ge", "As", "Se", "Br",
  "Kr", "Sb", "Te", "I", "Xe", "At", "Rn", "Ts", "Og",
]);
const ANION_FORMERS = new Set(["O", "S", "N", "F", "Cl", "Br", "I", "P", "C", "Se", "Te", "As"]);

/** Lexicon key: body only, ASCII, no coefficient, charge, state or adducts. */
export function formulaKey(node: FormulaNode, render: (node: FormulaNode) => string): string {
  return render({ type: "formula", components: node.components });
}

/**
 * Coarse plausibility for case-recovered candidates outside the lexicon:
 * organic (C and H) or a metal with an anion-forming element. Used only to
 * decide whether such a candidate is worth *suggesting*; it never autocorrects.
 */
export function looksLikeCompound(features: FormulaFeatures): boolean {
  const elements = features.distinctElements;
  if (elements.includes("C") && elements.includes("H")) return true;
  const metal = elements.some((e) => !NONMETALS.has(e));
  return metal && elements.some((e) => ANION_FORMERS.has(e));
}
