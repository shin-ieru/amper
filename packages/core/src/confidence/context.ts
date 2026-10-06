/**
 * Context classification: negative signals that make a candidate unsafe to
 * touch (spec §14, §48). These only ever lower confidence.
 */

/** URL, e-mail and file-path shapes. Formula parsing would reject most of these anyway; this names why. */
export function nonProseReason(token: string): string | undefined {
  if (/:\/\//.test(token) || /^www\./i.test(token)) return "inside a URL";
  if (/\S@\S/.test(token)) return "inside an email address";
  if (/[\\/]/.test(token)) return "looks like a path";
  if (/`/.test(token)) return "inside code";
  return undefined;
}

/**
 * Tokens that parse as formulas but are overwhelmingly product names, business
 * jargon or mechanism labels. Data, not heuristics; extend with evidence.
 */
export const NEGATIVE_LEXICON: ReadonlySet<string> = new Set([
  "B2B", "B2C", "C2C", "P2P", "B2G",
  "PS1", "PS2", "PS3", "PS4", "PS5",
  "W3C", "Y2K", "CB2",
  // SN1/SN2 are reaction-mechanism names, conventionally S_N1 / S_N2, not formulas.
  "SN1", "SN2",
  "C3PO", "K8S",
]);

/**
 * Acronyms spelled entirely from one-letter element symbols (H B C N O F P S K V Y I W U).
 * An acronym followed by a trailing version number is a product label ("USB3",
 * "CPU2"), not a formula; element-symbol structure alone cannot tell "USB3"
 * from "UF6". Stems that collide with real compounds are deliberately absent:
 * HBO (HBO₂), IO (IO₃, IO₄), UI (UI₃).
 */
export const ACRONYM_STEMS: ReadonlySet<string> = new Set([
  "USB", "CPU", "PCB", "PC", "IP", "IOU", "SOS", "POS", "NHS", "NYC", "NYU", "CBS",
  "NBC", "CNN", "BBC", "PBS", "SKU", "VPN", "VC", "CV", "HIV", "HPV", "SUV", "UFO", "FBI", "UK",
  "UN", "KFC", "KPI", "CPI", "CFO", "CIO", "HP", "NSF", "NIH", "FY", "OS", "IOS", "UPS", "BC",
  "CCSS", "IPO", "ICU", "OB", "OBGYN", "NFC", "SSO", "UX", "COO", "CSS", "WPF", "FPS", "PSU",
  "IPV", "VP", "WIN",
]);

/**
 * The acronym part of a "LETTERS + trailing digits" label ("USB3" → "USB").
 * Undefined when digits appear inside the token: interior counts ("H3BO3",
 * "C6H12O6") are formula structure, never a version suffix.
 */
export function acronymStem(token: string): string | undefined {
  return /^([A-Z]+)[0-9]+$/.exec(token)?.[1];
}

/** A label word directly before a token means it is an identifier, not a formula ("room H2", "model X2"). */
export const LABEL_WORDS: ReadonlySet<string> = new Set([
  "room", "rooms", "rm", "model", "models", "version", "ver", "v", "type", "gate", "seat", "row",
  "level", "grade", "floor", "building", "bldg", "block", "flat", "apartment", "apt", "suite",
  "route", "highway", "platform", "terminal", "bus", "train", "flight", "size", "series", "chip",
  "macbook", "iphone", "pixel", "galaxy", "playstation", "xbox", "section", "chapter", "page",
  "item", "code", "error", "ticket", "lane", "bay", "zone", "sector", "wing", "pod", "server",
  // keyboard keys and priority labels: "press F2", "priority P4"
  "press", "hit", "key", "keys", "button", "tap", "priority", "pri", "severity", "sev",
]);

/** Copulas that mark a relational phrase as prose: "the values are not equal". */
export const COPULAS: ReadonlySet<string> = new Set([
  "is", "are", "was", "were", "be", "been", "being", "isn't", "aren't", "wasn't", "weren't",
  "seem", "seems", "seemed", "remain", "remains", "remained", "become", "becomes", "became",
]);
