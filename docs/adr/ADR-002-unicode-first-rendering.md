# ADR-002: Unicode-first rendering

**Status:** Accepted · 2026-10-06

## Context
The output must be editable, copyable, searchable and collaborative (spec §4.4, §59).

## Options
1. Unicode sub- and superscript characters (`H₂SO₄`, `Fe³⁺`).
2. Host-native formatting (Docs subscript styling).
3. Equation objects or images.

## Decision
Unicode by default, produced from an AST (`formulaToUnicode`). The renderer interface keeps room for host operations (spec §36) when Unicode is insufficient, for example arbitrary superscript letters.

## Rationale
- Unicode is plain text, so it survives copy, paste, export and search.
- It needs one caret-relative text edit, the only primitive Docs offers an extension (ADR-003).
- Native formatting would need Docs styling operations, which the spike did not find an extension-accessible path for.

## Tradeoffs
- Unicode digits render slightly differently from styled subscripts in some fonts.
- Search for "H2SO4" will not match "H₂SO₄" until normalisation ships (`formulaToAscii` already exists for that).

## Evidence
The renderer round-trip tests and the corpus of 300+ formulas, validated against an independent oracle.
