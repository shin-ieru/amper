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

## Consequences of bare-name autocorrect (spec V2)

Prose uses of Greek names now convert: "The sigma level", "a small delta", and the words "eta" (ETA), "pi", "xi", "nu", "alpha/beta" (release names) or "Delta" (the airline). Mitigations: immediate Backspace restores the word exactly; two restores of the same word in a session demote it to a suggestion (spec §56); the never-convert list is permanent. Spec V2 §68 still lists "The sigma level increased." and "The delta between the values is small." as no-conversion examples, which contradicts §9.1; §1A says the superseding decision wins, and the corpus records them as superseded.

## Definition of done (spec §64)

Each rule family has positive, case-variation, boundary, punctuation, reversal and suppression tests (`packages/rules/src/registry.test.ts`, `tests/integration/typing.test.ts`), plus negative prose in `tests/corpus/negative.ts`. Family-wide suites in `tests/integration/families.test.ts` are generated from the canonical tables (all 24 Greek letters × forms × case × every trigger × Backspace; every arrow shorthand and alias by code point; every trigger × every rule family; all four state labels × presentation).
