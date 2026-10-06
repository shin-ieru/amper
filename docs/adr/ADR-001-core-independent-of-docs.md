# ADR-001: Core engine independent of Google Docs

**Status:** Accepted · 2026-10-06

## Context
Google Docs is the product (spec §4.1), but its DOM is internal, undocumented and changes without notice (spike F1, F17). Chemistry logic needs fast, exhaustive testing that a browser cannot provide.

## Options
1. Engine inside the extension, written against the Docs DOM.
2. Engine as pure TypeScript packages; hosts implement an adapter contract.

## Decision
Option 2. `@amper/chemistry`, `@amper/renderer`, `@amper/rules` and `@amper/core` have no DOM, network or host dependencies. Hosts implement `EditorAdapter`. A shared `AmperController` and `AmperSession` hold all conversion and reversal behaviour.

## Rationale
- The same session code runs in the in-memory test editor, the playground and Docs, so reversal semantics are tested once and reused everywhere.
- Docs breakage stays confined to `apps/google-docs-extension`.

## Tradeoffs
The adapter contract must be expressive enough for the weakest host (Docs). That forced caret-relative edits (ADR-003).

## Evidence
`packages/tsconfig.json` compiles the engine with `lib: ["ES2023"]` and `types: []`, so DOM use is a type error. `engine.test.ts › architecture` scans the sources for DOM and Docs identifiers. 201+ unit and integration tests run in Node in under a second.
