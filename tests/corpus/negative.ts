/**
 * Negative corpus (spec §14, §52, §68). None of these may be changed
 * automatically in either mode.
 */
export const NEGATIVE_TOKENS = [
  // spec §52
  "H2 model", "Room B2", "B2B", "F1", "Formula 1", "M2 MacBook", "A4", "R2", "C3.ai", "PS5", "X2",
  "v2.0", "ISO9001", "HTTP2", "SHA256", "H264",
  // spec §14
  "Room H2", "R2 score", "M2 Mac", "A4 paper", "F1 race", "Version 2.0", "Model X2",
  // products, standards, tech
  "B2C", "P2P", "W3C", "Y2K", "PS4", "PS3", "MP3", "MP4", "H265", "HDMI2", "USB3", "IPv6", "Wi-Fi6",
  "4K", "5G", "3D", "2FA", "COVID19", "COVID-19", "GPT4", "S3", "EC2", "K8s", "B52", "F150", "V8",
  "K9", "U2", "N95", "H1N1", "B12", "A1", "C1", "E2", "SN1", "SN2", "CB2", "MI6", "R2D2", "C3PO",
  "BRCA1", "IL6", "USB2", "USB4", "CPU2", "HP5", "UK2", "Win10", "iOS17", "Mac15", "A320", "B737", "W2", "I9", "I5", "I7", "S23",
  // labels
  "room H2", "seat C4", "gate B12", "row K9", "level S3", "version C2", "model CO2", "type H2O",
  // non-formula shapes
  "https://example.com/H2O", "www.H2O.com", "user@H2O.org", "/tmp/H2O", "C:\\H2SO4", "`H2O`",
  // "h2o" was negative in Phase 1; the product milestone requires h2o → H₂O (see case-recovery corpus).
  "Co2", "CO2e", "H2O-based", "x2", "2x", "100", "3.14", "1st", "21st",
];

/** Spec §68: sentences that must remain byte-identical after typing. */
export const NO_CONVERSION_SENTENCES = [
  "I bought an M2 MacBook.",
  "Meet me in room H2.",
  "This is version 2.0.",
  "Use an A4 sheet.",
  "Formula 1 is this weekend.",
  "The B2B segment grew.",
  "The R2 value is 0.91.",
  // relational phrases in prose
  "These two values are not equal to each other.",
  "The sets were approximately equal in size.",
  "Take the partial derivative of f.",
  "The angstrom is a unit of length.",
  "Press the right arrow key.",
  "Five plus or minus two.",
];

/**
 * Superseded by spec V2 §1A/§9.1: bare Greek names (and "small <name>") are
 * high-confidence notation and convert automatically. V2 §68 still lists the
 * first two as no-conversion examples; that conflict is reported, and §1A says
 * the superseding decision wins. Immediate Backspace restores the prose.
 */
export const SUPERSEDED_GREEK_PROSE: [string, string][] = [
  ["The sigma level increased.", "The σ level increased."],
  ["The delta between the values is small.", "The δ between the values is small."],
  ["A small delta in temperature.", "A δ in temperature."],
];
