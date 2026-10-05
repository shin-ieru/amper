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
| Bare Greek name (`sigma`) | suggest, 0.75 | It is a word in prose (spec §4.5) |
| Bare Greek name right after a qualifier word (`upper sigma`) | nothing | Only the whole explicit phrase converts; never "Capital σ" |
| `small X`, shorthand `cap/uc/lc X` | suggest, 0.9 | "a small delta in temperature" |
| Phrase that a longer phrase extends (`not equal` → `not equal to`) | suggest | Converting early strands words ("≠ to") |
| Relational phrase after a copula (`are not equal to`) | suggest | Prose, not notation |
| `angstrom`, `partial derivative`, `plus or minus` | suggest; `… symbol` forms are auto | "The angstrom is a unit" |
| `right arrow`, `left arrow` | not registered | "press the right arrow key" |
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

## Definition of done (spec §64)

Each rule family has positive, case-variation, boundary, punctuation, reversal and suppression tests (`packages/rules/src/registry.test.ts`, `tests/integration/typing.test.ts`), plus negative prose in `tests/corpus/negative.ts`.
