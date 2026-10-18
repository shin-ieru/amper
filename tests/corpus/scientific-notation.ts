/** Positive scientific-notation examples and the slash contexts held unchanged. */
export const SCIENTIFIC_NOTATION_POSITIVES: readonly [string, string][] = [
  ["x^2", "x²"],
  ["x^3", "x³"],
  ["x^12", "x¹²"],
  ["cm^2", "cm²"],
  ["m^3", "m³"],
  ["10^-3", "10⁻³"],
];

/**
 * Bare a/b fractions: offered as a suggestion (Tab applies native formatting),
 * never converted automatically. frac(a/b) is the automatic form.
 */
export const BARE_FRACTION_SUGGESTIONS: readonly [string, string][] = [
  ["x/y", "x⁄y"],
  ["t/v", "t⁄v"],
  ["a/b", "a⁄b"],
  ["b/y", "b⁄y"],
  ["1/2", "1⁄2"],
  ["5/4", "5⁄4"],
  ["12/24", "12⁄24"],
  ["123/456", "123⁄456"],
  ["3/y", "3⁄y"],
  ["12/x", "12⁄x"],
  ["x/2", "x⁄2"],
  ["n/10", "n⁄10"],
];

/** Prose slashes that look like fractions: must never be rewritten (they may be offered). */
export const AMBIGUOUS_SLASH_PROSE = ["24/7", "50/50", "9/11", "10/06", "2026/10", "y/n", "q/a", "p/e", "h/w"];

export const SCIENTIFIC_NOTATION_FALSE_POSITIVES = [
  "https://example.com/t/v",
  "www.example.com/t/v",
  "./src/t/v",
  "/Users/me/Amper/t/v",
  "2026/10/06",
  "and/or",
  "n/a",
  "w/o",
  "c/o",
  "input/output",
  "yes/no",
  "`t/v`",
  "const t/v",
  "<a href=\"t/v\">",
  "path t/v",
  "id t/v",
  "km/h",
  "cm/s",
  "m/s",
  "L/min",
  "g/mol",
  "kg/mol",
  "mol/L",
  "X/y",
  "x/Ж",
  "x1/y",
  "T/v",
  "foo/bar",
  "1.5/2",
  "3/2.5",
  "123/456/789",
  "ab/5",
  "5/cd",
  "β/γ",
  "ϑ/ς",
] as const;

/** Positive explicit underscore subscripts generated from the canonical Unicode map. */
export const EXPLICIT_SUBSCRIPT_POSITIVES: readonly [string, string][] = [
  ["x_2", "x₂"],
  ["x_12", "x₁₂"],
  ["a_0", "a₀"],
  ["x_-1", "x₋₁"],
  ["x_+12", "x₊₁₂"],
  ["V_max", "Vₘₐₓ"],
  ["x_βγ", "xᵦᵧ"],
  ["x_əβ", "xₔᵦ"],
];

export const EXPLICIT_SUBSCRIPT_FALSE_POSITIVES = [
  "variable_name",
  "snake_case",
  "_private",
  "const x_2",
  "let x_max",
  "`x_2`",
  "```\nx_2\n```",
  "<span>x_2</span>",
  "href x_2",
  "id x_2",
  "https://example.com/x_2",
  "www.example.com/x_2",
  "./src/x_2",
  "/tmp/x_2",
  "C:\\Users\\x_2",
] as const;

/** Delimited phrase cases: native Docs formatting covers these full exact ranges. */
export const DELIMITED_SCRIPT_PHRASE_POSITIVES = [
  { typed: "x_(max)", output: "xmax", phrase: "max", style: "subscript" },
  { typed: "x^(effective)", output: "xeffective", phrase: "effective", style: "superscript" },
  { typed: "x_(formation of methane)", output: "xformation of methane", phrase: "formation of methane", style: "subscript" },
  { typed: "x^(rate, at 25 °C)", output: "xrate, at 25 °C", phrase: "rate, at 25 °C", style: "superscript" },
  { typed: "x_(min. value)", output: "xmin. value", phrase: "min. value", style: "subscript" },
  { typed: "H2O_(liquid)", output: "H₂Oliquid", phrase: "liquid", style: "subscript" },
  { typed: "DeltaH_(formation of methane)", output: "ΔHformation of methane", phrase: "formation of methane", style: "subscript" },
  { typed: "x_(a (nested) phrase)", output: "xa (nested) phrase", phrase: "a (nested) phrase", style: "subscript" },
] as const;

/** Explicit syntax does not activate in ordinary identifiers or protected editor contexts. */
export const DELIMITED_SCRIPT_PHRASE_FALSE_POSITIVES = [
  "snake_case",
  "variable_name",
  "_private",
  "`x_(max)`",
  "<span>x_(max)",
  "<div>x^(effective)",
  "`````\nx_(max)\n`````",
  "const x_(max)",
  "https://example.com/x_(max)",
  "www.example.com/x_(max)",
  "./src/x_(max)",
  "/tmp/x_(max)",
  "href x_(max)",
  "id x_(max)",
  "x_()",
  "x_(max",
  "x^(effective))",
  "x_(max)tail",
] as const;
