# Named rules

Named rules are data (`packages/rules/src`). Parser-driven features (formulas, later ions, reactions and units) are not rules.

## Rule shape

```ts
NamedRule {
  id, category: "greek" | "symbol" | "custom", label, patterns[], replacement,
  mode: "auto" | "suggest", priority, confidence,
  guards?: ["after-copula"], completeFromChars?, noCompletion?, caseSensitive?
}
```

Patterns match whole words, case-insensitively, with whitespace collapsed. The **longest** phrase ending at the caret wins.

## Policy decisions

| Situation | Behaviour | Why |
|---|---|---|
| `capital/uppercase/upper case X`, `lowercase/lower case X`, `variant X`, `final sigma` | auto, 1.0 | Explicit intent |
| Bare Greek name (`sigma`, `Sigma`, `SIGMA`) | **auto**, 1.0, always the lowercase letter | Spec V2 §9.1 (supersedes V1 "suggest"): high-confidence scientific notation. English or Docs auto-capitalisation does not mean uppercase Greek |
| `small <name>` | **auto**, 1.0 | Spec V2 §9.2 explicit lowercase command (was suggest in V1) |
| Bare Greek name right after a qualifier word (`upper sigma`) | nothing | Only the whole explicit phrase converts; never "Capital σ" |
| `cap`/`uc`/`lc <name>` shorthand | suggest | Not in spec V2; kept conservative |
| `small X`, shorthand `cap/uc/lc X` | suggest, 0.9 | "a small delta in temperature" |
| Phrase that a longer phrase extends (`not equal` → `not equal to`) | suggest | Converting early strands words ("≠ to") |
| Relational phrase after a copula (`are not equal to`) | suggest | Prose, not notation |
| `angstrom`, `partial derivative`, `plus or minus` | suggest; `… symbol` forms are auto | "The angstrom is a unit" |
| `right arrow`, `left arrow` | not registered | "press the right arrow key" |
| `equi` (any case) | auto ⇌ U+21CC, **the primary equilibrium shortcut** | Whole token only: `equilibrium`, `equipment`, `equilateral` never match. `<=>` and `equilibrium arrow` remain secondary aliases; `<->` stays ⇄ |
| Arrow aliases | generated from `ARROW_DEFINITIONS` | One table drives shorthand, aliases and rendering: → U+2192, ← U+2190, ⇄ U+21C4, ⇌ U+21CC. Never ⇔/↔ |
| `subscript N`, `superscript N/plus/minus` | auto, command priority | Explicit commands (spec §11) |
| `x^2`, `cm^2`, `10^-3` | auto at a safe boundary; exact numeric superscript characters | Caret explicitly marks the exponent; chemistry caret charges/isotopes keep species-parser precedence |
| `x_2`, `x_12`, `x_-1`, `V_max` | auto at a safe boundary; exact Unicode subscript characters from the canonical table | Requires one letter base and a fully representable numeric or alphabetic suffix; identifier and code contexts stay unchanged |
| `x_(max)`, `x^(effective)` | auto at a safe boundary; native Docs subscript/superscript formatting for the enclosed phrase | Delimiters are removed; arbitrary text, spaces and punctuation are preserved and only the phrase is formatted |
| bare atomic fractions: integer digit sequence or one lowercase Latin variable on each side (`5/4`, `12/24`, `x/y`, `3/y`, `x/2`) | **suggestion only** (confidence 0.85): never rewritten at Space or any other boundary; Tab applies it | A bare slash is ambiguous in prose (`24/7`, `50/50`, `9/11`, `10/06`, `2026/10`, `y/n`, `q/a`, `p/e`, `h/w`), so Amper only offers it. Accepting keeps operands ordinary and applies native superscript to the whole numerator and subscript to the whole denominator around a baseline U+2044 slash. `frac(a/b)` gives the same result automatically. Multi-slash dates, decimals, non-atomic operands and protected contexts (URLs, paths, `and/or`, units) are not even offered. |
| `∑` / `∏` | n-ary operators U+2211/U+220F | Not the Greek letters Σ and Π |
| `Å` | U+00C5 | The NFC form of the Ångström sign |

## Categories

Toggleable in settings (spec §49): `greek`, `symbol`, `formula`, `charge`, `isotope`, `reaction`, `electron`, `custom`. Parser-driven categories are described in [parser.md](parser.md).

## Conflict priority (spec §54)

custom (1) → command (2) → named symbol (3) → charge/isotope (4) → reaction (5) → formula (6) → unit (7). Ties go to the longer span, then the higher confidence.

## Autocomplete

- A rule completes when its first word is typed in full (or a ≥3-letter prefix, as in `cap sig`) and the next word has been started.
- Rules with `completeFromChars` complete from a single partial word: Greek names from 4 characters, `equilibrium arrow` from 6, `nabla` from 4, `angstrom` from 5.
- Longer matches suppress shorter ones.
- **Fuzzy matching** (one edit or transposition, words of 5+ letters) applies only to complete multi-word *auto* phrases, and only as a suggestion: `equlibrium arrow` and `capital sigam` are suggested, never converted. Formulas are never fuzzy-matched.

## Custom rules

User rules compile to priority-1 named rules. Outputs are never re-fed into the matcher, so `a→b` plus `b→a` cannot loop, and identity rules are dropped.

## Explicit scientific shortcuts (next patch)

| Shortcut | Result | Notes |
|---|---|---|
| `sup(…)`, `sub(…)` | native superscript / subscript of the content | Whole command, balanced parentheses, case-insensitive keyword, must start a word. Any non-empty content without a nested command. While a command is open on the line, no other rule runs, so its content stays literal |
| `frac(a/b)` | a⁄b with native superscript numerator, U+2044, native subscript denominator | **Automatic, and the recommended fraction form.** The content is split at its one top-level `/`; a `/` inside parentheses or an inner command is not the separator. Operands may hold spaces, units, numbers, symbols and `sup(…)`/`sub(…)` (see *Compound fractions* below). Explicit, so it also formats pairs the bare form protects (`frac(b/c)`). Does not attach (`1 frac(1/2)` keeps its space) |
| `deg`, `degC`, `degF` | °, °C, °F | Also glued to a number: `25degC`, `-20degC`, `36.5degC`, `98.6degF`, `90deg`. Spacing is preserved |
| `celsius`, `fahrenheit`, `kelvin` | °C, °F, K | Suggestion only (prose words, Lord Kelvin) |
| *(no kelvin shortcut)* | — | Kelvin takes no degree sign: type SI `298 K` directly. `degK` and `298degK` are left as typed, bare `K` is never transformed, and `°K` is never produced |
| `plusminus`, `minusplus`, `neq`, `propto`, `sqrt` | ± ∓ ≠ ∝ √ | Join their canonical rules |
| `lte`, `gte` | ≤ ≥ | Lowercase only: `LTE`/`GTE` are left alone |
| `approx`, `inf` | ≈ ∞ | Suggestion only (prose abbreviation; infimum) |

**Compound fractions.** Google Docs gives each character exactly one vertical position (baseline, superscript or subscript), so a subscript cannot sit inside a raised numerator. `frac(…)` therefore makes an **inline** fraction, never a stacked one, joined by U+2044 with the spacing typed around the slash kept exactly (`frac(x/y)` → x⁄y, `frac(x / y)` → x ⁄ y). Operands render in one of two ways:

| Operands | Example | Result |
|---|---|---|
| no inner commands | `frac(12/24)`, `frac(dx/dt)`, `frac(1.5/2)`, `frac(X/Y)`, `frac(0.5 atm / 1 bar)`, `frac((n+1)/2)` | the whole numerator superscript, the whole denominator subscript; U+2044 and any spacing around it at baseline |
| with `sup(…)`/`sub(…)` | `frac(P sub(0.5 atm) / P sub(1 bar))`, `frac(T sub(0°C) / T sub(25°C))`, `frac(n sub(1) / n sub(2))` | compound fractions remain at baseline so inner superscript and subscript formatting is preserved (P, then subscript "0.5 atm") |

Inner commands follow the top-level rules (one separating space attaches, non-empty content). Nested fractions (`frac(1/frac(2/3))`) are deliberately unsupported: `frac` inside `frac`, and commands nested inside an inner command, are rejected and left literal, as are fractions with no top-level `/` or more than one. Operand text is literal: no chemistry, Greek or temperature rules run inside the command. Immediate Backspace restores the complete shorthand. Without `frac(…)`, a compound slash expression is never inferred: `P sub(0.5 atm) / P sub(1 bar)` keeps its `/`, and `0.5 atm/1 bar`, `dx/dt` or `mol/L` are not even offered.

**Space attachment.** Exactly one separating space before `sup(…)` or `sub(…)` is consumed, so the script attaches to the word before it: `x sup(2)` → x², `V sub(max)` → Vₘₐₓ, `E sup(activation energy)` → E with "activation energy" superscripted, `H sub(formation of methane)` likewise subscripted. The space is only consumed when a non-space character other than `(`, `[` or `{` precedes it. A command at the start of a line, after an opening bracket, or after two or more spaces keeps the spacing exactly as typed. Immediate Backspace restores the command, including the space.

Deliberately **not** added, because they are English words or common abbreviations: `pm` (3 pm), `mp` (MP, mp3), `therefore`, `because`, `partial`, `integral`, `sum`, `product`, `times`, `dot`. The existing `… symbol` phrases cover them. Bare `C`, `F` and `K` are never temperatures. The compact `x^2`, `x_2`, `x^(…)` and `x_(…)` forms stay automatic as power-user alternatives; `sup(…)`/`sub(…)` are the recommended forms. A bare `x/y` is only offered as a suggestion (see the table above).

## Consequences of bare-name autocorrect (spec V2)

Prose uses of Greek names now convert: "The sigma level", "a small delta", and the words "eta" (ETA), "pi", "xi", "nu", "alpha/beta" (release names) or "Delta" (the airline). Mitigations: immediate Backspace restores the word exactly; two restores of the same word in a session demote it to a suggestion (spec §56); the never-convert list is permanent. Spec V2 §68 still lists "The sigma level increased." and "The delta between the values is small." as no-conversion examples, which contradicts §9.1; §1A says the superseding decision wins, and the corpus records them as superseded.

## Definition of done (spec §64)

Each rule family has positive, case-variation, boundary, punctuation, reversal and suppression tests (`packages/rules/src/registry.test.ts`, `tests/integration/typing.test.ts`), plus negative prose in the corpus files. Family-wide suites in `tests/integration/families.test.ts` are generated from canonical tables (all 24 Greek letters × forms × case × every trigger × Backspace; every arrow shorthand and alias by code point; every trigger × every rule family; all four state labels × presentation; every caret exponent character; every atomic numeric/variable fraction operand pair × every trigger, offered but never rewritten, then Tab and Backspace; every `frac(…)` pair automatic).
