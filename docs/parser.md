# Formula parser

`@chemly/chemistry` parses neutral formulas into an AST. Rendering lives in `@chemly/renderer`; scoring lives in `@chemly/core/confidence`.

## Grammar (Phase 1)

```
Formula     := Coefficient? Term+
Term        := (Element | Group) Count?
Group       := "(" Term+ ")" | "[" Term+ "]"
Coefficient := ASCII integer, only when a Term follows
Count       := integer, ASCII or already-rendered subscript
Element     := one of the 118 IUPAC symbols
```

- **Lexing is deterministic.** An uppercase letter can only start a symbol and a lowercase letter can only continue one, so `Co` is cobalt, `CO` is carbon + oxygen, and `Cx` is an error. No backtracking is needed.
- **Limits** keep runtime bounded: 64 characters, nesting depth 4, at most 3 digits per number, no leading zeros, no zero counts.
- **Already-rendered subscripts** (`H₂O`) parse as counts, so re-evaluating converted text is a no-op (render equals input).
- **The parser never throws.** Every failure returns `{ ok: false, error: { message, position } }`. A property test checks this against arbitrary strings.

## AST

```ts
FormulaNode { coefficient?, components: (ElementComponent | GroupComponent)[], charge?, state? }
ElementComponent { symbol, count?, span }
GroupComponent { bracket: "paren" | "square", components, count?, span }
```

`charge` and `state` are reserved for Phase 2. The renderer already handles them, so adding ions and phases is a parser change, not an AST change.

## From parse to decision

1. **Candidate.** Take the last whitespace token on the current line. Strip sentence punctuation and quotes, and strip brackets only when unbalanced: `(see H2O).` gives `H2O`, `(H2O),` gives `(H2O)`.
2. **Fast path.** With no ASCII digit there is nothing to subscript, so the engine stops.
3. **Parse and render.** If the Unicode rendering equals the input, nothing changes.
4. **Score** (`scoreFormula`). Hard rejections first:
   - the negative lexicon (`B2B`, `PS5`, `SN2`, …);
   - acronym plus a *trailing* version number (`USB3`, `CPU2`);
   - a preceding label word (`room H2`, `model X2`);
   - an explicit count of 1 (`F1`, `H1N1`);
   - a single element repeated non-adjacently (`B2B`).

   Then these base scores apply:

   | Shape | Chemistry Mode | Standard Mode |
   |---|---|---|
   | ≥ 2 distinct elements | 0.97 auto | 0.90 suggest |
   | single element + coefficient (`2H2`) | 0.97 auto | 0.85 suggest |
   | single element + count (`H2`, `C60`) | 0.85 suggest | 0.65 none |

The acronym guard looks only at *trailing* digits. Interior counts are formula structure: `H3BO3` is boric acid even though its letters spell "HBO". That case was a real regression, and it is now pinned by the corpus. Stems that collide with real compounds (HBO → HBO₂, IO → IO₃, UI → UI₃) are excluded from the acronym list.

## Known gaps (Phase 2)

Charges (`Fe3+`, `SO4^2-`), states (`(aq)`), hydrates (`·5H2O`), isotopes (`^14C`, and `D2O`, since D and T are deliberately not element symbols), reactions and ASCII arrows, and electron configurations. A lone `N2` inside `N2 + 3H2` is currently only suggested; the reaction parser will supply that context.
