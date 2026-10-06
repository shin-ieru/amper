# Species, reaction and configuration parsers

`@amper/chemistry` parses notation into ASTs; `@amper/renderer` renders them; `@amper/core/confidence` scores them. No module guesses intent silently: the parser records what was written, `charges.ts` lists the readings, and the policy decides between autocorrect, suggestion and nothing.

## Species grammar

```
Species     := Coefficient? Unit (Dot Coefficient? Unit)* Charge? State?
Unit        := Term+
Term        := Isotope? (Element | Group) Count?
Group       := "(" Unit ")" | "[" Unit "]"
Isotope     := "^" Integer | superscript-Integer          before an element: ^14C, ¹⁴C
Charge      := "^" Integer? Sign                          explicit (caret)
             | Sign                                       implicit: Fe3+, NH4+, Cl-
             | superscript-Integer? superscript-Sign      already rendered: Fe³⁺
State       := "(s)" | "(l)" | "(g)" | "(aq)"
Dot         := "·" | "•" | "∙" | "⋅" | "*"                rendered as · (U+00B7)
Coefficient := ASCII integer, only when a Term follows
Element     := one of the 118 IUPAC symbols (D and T excluded)
```

- **Lexing is deterministic by case** against the element table: `Co` is cobalt, `CO` is C + O, `Cx` is an error. The lexer also accepts already-rendered sub/superscripts, so re-evaluating converted text is a no-op.
- **Limits:** 64 characters, nesting depth 4, 3-digit numbers, charge magnitude ≤ 9, mass number ≤ 300 and ≥ the element's atomic number (`^2C` fails). No leading zeros, no zero counts.
- **States** are tokens, not groups: `(s)` is solid, while `(S)` is a sulfur group. A state may appear only at the very end, and only one is allowed.
- **A period is never a hydrate dot** (spec §16). `CuSO4.5H2O` fails to parse; the engine *offers* `CuSO₄·5H₂O` and never applies it.
- **The parser never throws.** Property tests run thousands of chemistry-shaped random strings through it.

## AST decisions (Phase 2)

| Decision | Why |
|---|---|
| `Charge.notation: "caret" \| "implicit" \| "rendered"` | Only implicit charges are ambiguous. Recording how a charge was written lets the policy trust `SO4^2-` fully while treating `SO42-` as uncertain. |
| Implicit trailing digits stay a **count** in the AST (`Fe3+` → Fe with count 3, charge 1+) | The parser stays a pure description of the text. Reinterpretation happens in `interpretCharge`, which returns alternative ASTs. |
| `massNumber` lives on `ElementComponent` | Isotopes label atoms, not species (`^13CH4` is ¹³CH₄). |
| `adducts: { coefficient?, components }[]` on `FormulaNode` | A hydrate is one species. Charge and state apply to the whole. |
| `cloneFormula` written per node type, with `Record<keyof Node, true>` key lists | `structuredClone` is a host API outside the engine's ES-only lib. A JSON round-trip would silently drop future non-JSON fields. The key lists make an uncopied new field a compile error. |
| Reactions are **token sequences**, not one grammar string | `+` is both a separator and a charge sign. Requiring whitespace-delimited separators keeps `Na+ + Cl-` unambiguous, and each species is parsed by the same species parser. |

## Implicit charge readings (`charges.ts`)

| Written | Readings (best first) | Certainty |
|---|---|---|
| `Na+`, `Cl-`, `H+` (typical ±1 ion) | as written | likely |
| `B+`, `C-`, `O+`, `V-` (grades, blood types, rails) | as written | **ambiguous** |
| `Fe3+`, `Ca2+`, `S2-` (typical charge, no homonuclear ion) | count → charge | likely |
| `O2-`, `N3-` (typical charge **and** a real homonuclear ion) | O²⁻, O₂⁻ / N³⁻, N₃⁻ | **ambiguous** |
| `O2+`, `I3-`, `H2+`, `H3+` (homonuclear ion, atypical monatomic charge) | O₂⁺, O²⁺ / I₃⁻, I³⁻ | **ambiguous** |
| `NH4+`, `NO3-` (polyatomic, single-digit last count) | as written | likely |
| `SO42-` (polyatomic, multi-digit last count) | SO₄²⁻, SO₄₂⁻ | **ambiguous** |
| `Fe(OH)2+` (count after a parenthesised group) | Fe(OH)₂⁺, Fe(OH)²⁺ | **ambiguous** |
| `[Fe(CN)6]3-` (number after a square-bracketed complex) | charge | likely |
| any caret or rendered charge | as written | certain |

Typical charges come from a data table (`TYPICAL_ION_CHARGES`); homonuclear ions come from `KNOWN_HOMONUCLEAR_IONS`. Ambiguous readings are always **offered as suggestions**, labelled (for example "O²⁻ (charge 2−)"), and never applied. Caret syntax is the documented way to be explicit: `O2^+`, `O^2+`, `SO4^2-`.

## Confidence (`scoreSpecies`)

Guards run first and look at the identifier with any charge or state suffix removed, so `PS5+` and `USB3-` stay protected. The guards are: the negative lexicon, an acronym plus a trailing version number, a preceding label word, an explicit count of 1, and a single element repeated non-adjacently.

| Shape | Chemistry | Standard |
|---|---|---|
| Explicit caret charge or isotope | 0.99 | 0.99 |
| Implicit charge, *likely* | 0.97 | 0.90 |
| Implicit charge, *ambiguous* | 0.85 | 0.80 (bare one-letter: 0.60) |
| ≥ 2 distinct elements (incl. hydrates) | 0.97 | 0.90 |
| one element + coefficient / state / isotope / reaction context | 0.97 | 0.85 |
| one element + count, no context (`H2`, `C60`) | 0.85 | 0.65 |

Reaction context is a positive signal: the token follows `+` or an arrow, which itself follows a species.

## Reactions

`parseReactionSuffix` walks back from the caret collecting `Species ((+ | Arrow) Species)*`. It accepts spaced coefficients (`2 H2O`), electrons (`e-`, `2e-`, `e^-`), multi-step chains and already-rendered tokens. Arrows are `->` →, `<-` ←, `<->` ⇄ and `<=>` ⇌. The bidirectional and equilibrium arrows are kept distinct (spec §20).

- A **standalone arrow** converts in Chemistry Mode only when a species stands before it. `x -> y` and `a <- b` are only offered.
- A **complete reaction** is rewritten from its *first changed token*, preserving the user's spacing. Its confidence is the minimum over its species, so one ambiguous species makes the whole reaction a suggestion. Certain tokens inside it still convert as they are typed.
- **Nothing is balanced or solved.** Unbalanced skeleton equations convert like balanced ones.
- Unspaced equations (`2H2+O2->2H2O`) are deliberately left alone.

## Electron configurations

`parseConfigToken` validates physics, not just shape: n ≥ l + 1 and electrons ≤ 2(2l + 1). That rejects `1p2`, `2d6` and `2p7`. Noble-gas cores (`[Ne]`) start a run.

- A run of two or more orbitals, or a core plus one orbital, converts in Chemistry Mode.
- A single orbital (`3d6`, which is also dice notation) is only offered.
- Duplicate subshells break a run.

## Case recovery

Users should not need IUPAC capitalisation for Amper to help. When a token does not parse as typed and contains lowercase letters, `caseCandidates` enumerates every way to split each letter run into element symbols case-insensitively. Digits, brackets, charges and a trailing state (`(aq)` is never re-cased) are kept as written. Each candidate is parsed and scored by the normal species pipeline. Then:

| Situation | Behaviour | Example |
|---|---|---|
| exactly one candidate is in `COMMON_FORMULAS` (or is a confidently charged monatomic ion) | autocorrect | `co2` → CO₂ (not Co₂), `h2so4` → H₂SO₄, `fe3+` → Fe³⁺ |
| several candidates are common | offer them all | `cocl2` → CoCl₂ (cobalt chloride) or COCl₂ (phosgene) |
| none common, but looks like a compound (organic, or metal + anion-former) | offer | `cof2` → CoF₂ |
| pure-letter word | only the short `DIGIT_FREE_RECOVERABLE` list | `nacl` → NaCl; `bacon`, `Koh`, `no`, `hi` never change |
| lone element without charge, coefficient, state or reaction | nothing | `h2` (also an HTML heading) |

Identifier guards run on the typed token *upper-cased* too, so `usb3`, `css3`, `c3po`, `k8s`, `ipv6`, `win10` and `b2b` stay protected. The transaction keeps the exact typed text, so `h2so4` → H₂SO₄ → Backspace → `h2so4`. In the conservative engine profile, recovery only ever suggests.

## Respecting reverts

Tokens the user reverted, by immediate Backspace or by native Undo of a pending conversion, are *frozen* for the session. Reaction and configuration rewrites leave them exactly as typed (`spliceTokens`). At the next boundary, nothing may convert a span overlapping just-restored text.

## Not in Phase 2

- Reaction conditions (`->[heat]`).
- Natural-language isotope phrases (`carbon 14 isotope`) and left-subscript atomic numbers (`_6^14C`).
- Deuterium and tritium symbols (`D2O`).
- Hybridisation (`sp3`), radicals (`OH•`), units.
- Equation balancing.
