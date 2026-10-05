import { parseConfigToken, type ConfigToken } from "@chemly/chemistry";
import { configTokenToUnicode } from "@chemly/renderer";
import { PRIORITY } from "@chemly/rules";
import type { ChemlyMode, Recognition } from "../../types";
import { trimFormulaToken, wordTokens } from "../text";
import { spliceTokens } from "./splice";

/**
 * Electron configurations (spec §19): the run of configuration tokens ending
 * at the caret. "1s2" alone is only offered; a second orbital (or a noble-gas
 * core) makes the run unmistakable, and the whole run is converted from its
 * first unconverted token.
 */
export function recognizeElectronConfiguration(
  text: string,
  from: number,
  mode: ChemlyMode,
  frozen?: ReadonlySet<string>,
): Recognition[] {
  const tokens = wordTokens(text, from);
  const last = tokens[tokens.length - 1];
  if (!last || last.end !== text.length) return [];
  const lastSpan = trimFormulaToken(text, last.start, last.end);
  const run: { start: number; end: number; parsed: ConfigToken }[] = [];

  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!;
    const span = i === tokens.length - 1 ? lastSpan : token;
    const parsed = parseConfigToken(text.slice(span.start, span.end));
    if (!parsed) break;
    if (parsed.kind === "core" && run.some((r) => r.parsed.kind === "core")) break;
    run.unshift({ start: span.start, end: span.end, parsed });
    if (parsed.kind === "core") break; // a core starts the configuration
  }
  const orbitals = run.filter((r) => r.parsed.kind === "orbital");
  if (orbitals.length === 0) return [];
  const keys = orbitals.map((r) => (r.parsed.kind === "orbital" ? `${r.parsed.orbital.n}${r.parsed.orbital.subshell}` : ""));
  if (new Set(keys).size !== keys.length) return [];

  const rendered = run.map((r) => ({ ...r, text: configTokenToUnicode(r.parsed) }));
  const splice = spliceTokens(text, rendered, frozen);
  if (!splice) return [];

  const definite = orbitals.length >= 2 || run[0]!.parsed.kind === "core";
  const chemistry = mode === "chemistry";
  return [
    {
      recognizer: "electron",
      ruleId: "electron.configuration",
      category: "electron",
      start: splice.start,
      end: splice.end,
      original: text.slice(splice.start, splice.end),
      replacement: splice.replacement,
      confidence: definite ? (chemistry ? 0.97 : 0.9) : chemistry ? 0.85 : 0.6,
      priority: PRIORITY.formula,
      label: splice.replacement,
      reasons: [
        `${orbitals.length} orbital${orbitals.length === 1 ? "" : "s"} with valid electron counts`,
        definite ? "configuration run" : "a single orbital token may be something else (dice, labels)",
        chemistry ? "Chemistry Mode" : "Standard Mode",
      ],
    },
  ];
}
