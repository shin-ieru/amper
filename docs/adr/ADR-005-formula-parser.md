# ADR-005: Formula parser architecture

**Status:** Accepted · 2026-10-06

## Context
The spec forbids digit-subscripting regexes (§12, §78). Formulas need grouping, coefficients and later charges, states, hydrates and reactions, plus non-Unicode exports.

## Options
1. Regex transforms.
2. A lexer with an element whitelist and a recursive-descent parser producing an AST, rendered separately.
3. An external chemistry library.

## Decision
Option 2. Lexing is deterministic by letter case against the 118 IUPAC symbols. The parser is recursive descent with hard limits: 64 characters, depth 4, 3-digit numbers. It returns errors as values and never throws. The AST carries spans and reserves `charge` and `state`.

## Rationale
- Invalid symbols fail at the lexer, which removes most false positives before any scoring.
- The AST supports Unicode, ASCII and future LaTeX, mhchem and MathML renderers (spec §60).
- Already-rendered subscripts parse, so re-evaluation is idempotent.

## Tradeoffs
- The grammar must be extended deliberately for each Phase 2 feature.
- D and T are excluded until isotope support, so `D2O` does not convert yet.

## Evidence
`parser.test.ts`: 16 malformed classes and 4,000 property-test runs that never throw. The corpus test converts 300+ real formulas exactly as an independent oracle predicts.
