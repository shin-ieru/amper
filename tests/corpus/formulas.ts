/**
 * Positive neutral-formula corpus (spec §52). Every entry must convert in
 * Chemistry Mode. Charges, states, hydrates and isotopes are Phase 2 and live
 * in their own corpora once those parsers exist.
 */
export const FORMULA_CORPUS: Record<string, string[]> = {
  "spec examples": [
    "H2O", "CO2", "NH3", "CH4", "H2SO4", "HNO3", "CaCO3", "NaHCO3", "C6H12O6", "KMnO4", "K2Cr2O7",
    "Ca(OH)2", "Al2(SO4)3", "(NH4)2SO4",
  ],
  acids: [
    "H2SO3", "H3PO4", "H2CO3", "HClO4", "HClO3", "HClO2", "HNO2", "H2S", "H3BO3", "H2CrO4", "H2C2O4",
    "HC2H3O2", "CH3COOH", "HCOOH", "H2SiO3", "H4SiO4", "HIO3", "HBrO3", "H2SeO4", "H3AsO4", "H2MnO4",
    // Regression: digit-stripped these read as acronyms (HBO, IO, UI); they are real compounds.
    "HBO2", "HIO4", "H5IO6",
  ],
  bases: [
    "Mg(OH)2", "Ba(OH)2", "Sr(OH)2", "Al(OH)3", "Fe(OH)3", "Fe(OH)2", "Cu(OH)2", "Zn(OH)2", "Ni(OH)2",
    "Co(OH)2", "Mn(OH)2", "Cr(OH)3", "Pb(OH)2", "Sn(OH)2", "Be(OH)2", "NH4OH", "Ca(OH)2", "Cd(OH)2",
  ],
  oxides: [
    "Fe2O3", "Fe3O4", "Al2O3", "SiO2", "TiO2", "MnO2", "Cr2O3", "CrO3", "Cu2O", "Na2O", "K2O", "Li2O",
    "P4O10", "P2O5", "SO2", "SO3", "NO2", "N2O", "N2O4", "N2O5", "Cl2O7", "Mn2O7", "V2O5", "ZrO2",
    "UO2", "WO3", "MoO3", "Co3O4", "Pb3O4", "PbO2", "SnO2", "Bi2O3", "La2O3", "CeO2", "Ag2O", "H2O2",
  ],
  salts: [
    "Na2SO4", "K2SO4", "MgSO4", "CuSO4", "ZnSO4", "FeSO4", "BaSO4", "CaSO4", "Na2CO3", "K2CO3",
    "MgCO3", "BaCO3", "Li2CO3", "NaNO3", "KNO3", "AgNO3", "Pb(NO3)2", "Cu(NO3)2", "Ca(NO3)2",
    "Mg(NO3)2", "Zn(NO3)2", "Fe(NO3)3", "Al(NO3)3", "NH4NO3", "Na3PO4", "Ca3(PO4)2", "K3PO4",
    "Mg3(PO4)2", "NaH2PO4", "Na2HPO4", "(NH4)3PO4", "(NH4)2HPO4", "NH4H2PO4", "CaCl2", "MgCl2",
    "FeCl3", "FeCl2", "AlCl3", "ZnCl2", "CuCl2", "BaCl2", "NiCl2", "CoCl2", "SnCl2", "SnCl4",
    "TiCl4", "PCl3", "PCl5", "SiCl4", "CCl4", "NH4Cl", "KClO3", "NaClO3", "NaClO4", "Ca(ClO)2",
    "KIO3", "NaBrO3", "Na2S2O3", "Na2S", "K2S", "FeS2", "ZnS", "CuS", "Ag2S", "Na2SiO3", "K2MnO4",
    "Na2Cr2O7", "K2CrO4", "Na2C2O4", "CaC2O4", "KHC8H4O4", "Na2B4O7", "Ca(H2PO4)2", "NaHSO4",
    "KHSO4", "Ca(HCO3)2", "KHCO3", "Mg(HCO3)2", "Al2(CO3)3", "Fe2(SO4)3", "Cr2(SO4)3",
    "(NH4)2CO3", "(NH4)2Cr2O7", "(NH4)2C2O4", "NH4HCO3", "CaF2", "MgF2", "SF6", "XeF4", "UF6",
    "BF3", "NF3", "ClF3", "IF7", "SbCl5", "AsH3", "PH3", "SiH4", "B2H6", "LiAlH4", "NaBH4",
    "CaH2", "Mg3N2", "Li3N", "Si3N4", "AlN", "Ca3P2", "CaC2", "SiC", "WC", "TiN", "UI3", "UI4",
  ],
  organic: [
    "C2H6", "C3H8", "C4H10", "C5H12", "C6H14", "C7H16", "C8H18", "C10H22", "C2H4", "C3H6", "C2H2",
    "C6H6", "C7H8", "C8H10", "C10H8", "C14H10", "CH3OH", "C2H5OH", "CH3CH2OH", "C3H7OH", "C4H9OH",
    "CH3CH2CH2OH", "CH3OCH3", "CH3CHO", "HCHO", "CH3COCH3", "C3H6O", "CH3COOCH3", "CH3COOC2H5",
    "C6H5OH", "C6H5NH2", "C6H5COOH", "C6H5CH3", "C6H5NO2", "CH3NH2", "(CH3)2NH", "(CH3)3N",
    "CH3CN", "CH2Cl2", "CHCl3", "CH3Cl", "C2H5Cl", "CF2Cl2", "C2F4", "C6H12", "C12H22O11",
    "C6H8O7", "C9H8O4", "C8H9NO2", "C8H10N4O2", "C17H35COOH", "C3H5(OH)3", "C2H4(OH)2",
    "CH3(CH2)2CH3", "CH3(CH2)4CH3", "(CH3)3COH", "(CH3)2CHOH", "C6H10O5", "C2H3Cl", "C3H3N",
    "C5H5N", "C4H4O", "C4H4S", "C4H5N", "C20H25N3O", "C27H46O", "C55H72MgN4O5",
  ],
  "grouped and complexes": [
    "[Cu(NH3)4]SO4", "[Ag(NH3)2]Cl", "K4[Fe(CN)6]", "K3[Fe(CN)6]", "[Co(NH3)6]Cl3",
    "[Co(NH3)5Cl]Cl2", "[Pt(NH3)2Cl2]", "Na3[AlF6]", "K2[PtCl6]", "[Ni(CO)4]", "Fe(CO)5",
    "Na2[Fe(CN)5NO]", "[Cr(H2O)6]Cl3", "[Cu(H2O)4]SO4", "Ca(OCl)2", "Ca5(PO4)3OH", "Ca5(PO4)3F",
    "Mg(ClO4)2", "Cu2(OH)2CO3", "Al2(SiO3)3", "Na2Zn(OH)4", "Fe4[Fe(CN)6]3", "Cr(NO3)3",
    "UO2(NO3)2", "Co(NO3)2", "Hg2Cl2", "Hg(NO3)2", "Pb(CH3COO)2", "Cu(CH3COO)2", "Zn(CH3COO)2",
  ],
  "with coefficients": [
    "2H2O", "3Ca(OH)2", "2KMnO4", "4NH3", "6CO2", "2C8H18", "5O2", "2H2", "3O2", "12CO2", "2NaCl2",
  ],
};

/**
 * Single-element species with a count are ambiguous with identifiers ("H2" vs
 * "room H2"), so without a coefficient they are suggested, not converted.
 */
export const SINGLE_ELEMENT_SUGGESTED = ["H2", "O2", "N2", "Cl2", "O3", "S8", "P4", "C60", "C70", "Br2", "I2"];

export const ALL_FORMULAS = Object.values(FORMULA_CORPUS).flat();
