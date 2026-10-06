# Amper

Chemistry autocorrect and autocomplete for Google Docs. Type `h2so4`, `SO4^2-`, `sigma`, `capital sigma`, `N2 + 3H2 equi 2NH3` or `H2O(l)` and Amper writes `H₂SO₄`, `SO₄²⁻`, `σ`, `Σ`, `N₂ + 3H₂ ⇌ 2NH₃` and H₂O with a subscripted (l), all as ordinary editable text. (`<=>` also gives ⇌ for power users; `<->` gives ⇄.) Press Backspace straight after a conversion to get back exactly what you typed.

Everything runs locally and deterministically. No document text leaves the device.

## What's in v0.1.0

**Greek and symbols**
- All 24 Greek letters: `sigma` → σ (any case), `capital sigma` / `uppercase omega` → Σ / Ω, `lowercase delta` / `small theta` → δ / θ. Explicit variants: `variant phi` → ϕ, `final sigma` → ς.
- Scientific symbols such as `plus minus` → ±, `not equals` → ≠, `degree symbol` → °, `middle dot` → ·, and `subscript 2` / `superscript plus` → ₂ / ⁺.

**Formulas and ions**
- Formulas with groups, nesting and coefficients: `Ca(OH)2` → Ca(OH)₂, `3Ca(OH)2` → 3Ca(OH)₂.
- Lowercase recovery: `h2so4` → H₂SO₄, `nacl` → NaCl, `fecl3` → FeCl₃.
- Elemental molecules: H₂ N₂ O₂ F₂ Cl₂ Br₂ I₂ O₃ S₈.
- Charges: `Fe3+` → Fe³⁺, `NH4+` → NH₄⁺, `[Fe(CN)6]3-` → [Fe(CN)₆]³⁻. Explicit caret syntax removes ambiguity: `SO4^2-` → SO₄²⁻, `O2^+` → O₂⁺.
- Hydrates: `CuSO4·5H2O` (or `*`) → CuSO₄·5H₂O.
- Isotopes: `^14C` → ¹⁴C.
- Electron configurations: `1s2 2s2 2p6` → 1s² 2s² 2p⁶.

**States**
- `(s)` `(l)` `(g)` `(aq)` are rendered with Google Docs native subscript. Following text stays normal.

**Reactions**
- `2H2 + O2 -> 2H2O` → 2H₂ + O₂ → 2H₂O. Each species is parsed independently, keeping coefficients, states, charges and electrons (`e-`).
- Arrows: `equi` (primary), `<=>` and `equilibrium arrow` → ⇌; `->` → →; `<-` → ←; `<->` → ⇄.

**Interaction**
- Converts at Space, Enter, `,` `;` `:` `!` `?`, with no Tab needed.
- Ambiguous input is offered as a suggestion (Tab accepts, Esc dismisses), never guessed: e.g. `O2+`, `SO42-`, `cocl2`.
- Immediate Backspace restores exactly what you typed, and native Undo works.
- Settings: enable, automatic conversion, autocomplete, Backspace restore, subscript state labels.
- False-positive protection for identifiers and prose (`Room H2`, `M2 MacBook`, `B2B`, `usb3`, `C3.ai`, `v2.0`, URLs).
- Local and deterministic: no network, no AI, no document text leaves the device.

## Known limitations

- **`P4` is suggestion-only on its own.** It is also a priority label and a processor name. It converts automatically inside a clear reaction (`P4 + 5O2 -> P4O10`).
- **`H2 model` converts `H2` before `model` is typed.** Amper cannot see future text. A label word *before* the formula (`Model H2`, `Room H2`) protects it, and Backspace restores.
- **Uncommon lowercase formulas** that are not in the common-formula list (e.g. `nh4no2`) may need canonical capitalisation (`NH4NO2`) or a suggestion.
- **Some Undo and formatting behaviour depends on Google Docs.** A conversion with a subscript state label can take more than one Undo step. Docs' own automatic substitutions and auto-capitalisation run alongside Amper (handled, but host-dependent).
- **Bare Greek names convert in prose too** ("the sigma level" → "the σ level", "ETA" → η). Use Backspace, or add the word to the never-convert list.
- **Not yet recorded in an editable Doc:** lists, tables, pageless documents, Suggesting mode, collaboration, IME input and screen readers (see [docs/google-docs-spike.md](docs/google-docs-spike.md)).
- **Amper converts only what it sees you type.** Clicking back into an existing word and pressing Space does not convert it.
- **Not part of v0.1.0:** reaction conditions (`->[heat]`), equation balancing, molecular structures, radicals, hybridisation (`sp3`), units, `D`/`T` symbols, and unspaced reactions (`2H2+O2->2H2O`).

## Requirements

Node 20 or later, plus npm. Google Chrome is needed for the browser E2E tests.

## Commands

```sh
npm install
npm run check          # typecheck every package and app, then run unit, integration and corpus tests
npm test               # tests only (Vitest)
npm run dev            # playground at http://localhost:5199
npm run e2e            # Playwright E2E against the playground (uses installed Chrome)
npm run build          # playground + extension builds
npm run build:extension
```

### Try it in Google Docs

1. `npm run build:extension`
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and choose `apps/google-docs-extension/dist`.
3. Open a Google Doc and reload it. Amper is chemistry-aware whenever it is enabled; the popup has only a few on/off switches.

v0.1.0 is an early release, loaded unpacked. The Google Docs integration relies on Docs' undocumented internals (see [ADR-003](docs/adr/ADR-003-google-docs-integration.md)); the manual protocol in [docs/google-docs-spike.md](docs/google-docs-spike.md#manual-validation-protocol-editable-document) is the regression checklist.

## Layout

```
packages/chemistry   elements, species/reaction/configuration parsers, AST (no DOM)
packages/renderer    AST → Unicode / ASCII                         (no DOM)
packages/rules       Greek, symbols, script commands, registry     (no DOM)
packages/core        engine, confidence, autocomplete, session, controller, adapter contract (no DOM)
packages/shared-ui   suggestion popup (shadow DOM)
apps/playground      textarea harness + debug panel (development only)
apps/google-docs-extension   MV3 extension: Docs adapter, MAIN-world bridge, popup
tests/integration    full typing flows on an in-memory editor
tests/corpus         formula, ion, state, hydrate, isotope, configuration and reaction corpora + negative corpora
tests/e2e            Playwright tests of the playground
docs/                architecture, parser, rules, spike, ADRs; docs/spike/ holds the live-Docs probes
```

## Docs

- [Architecture](docs/architecture.md)
- [Parsers (species, reactions, configurations)](docs/parser.md)
- [Named rules](docs/rules.md)
- [Google Docs spike](docs/google-docs-spike.md)
- ADRs: [001](docs/adr/ADR-001-core-independent-of-docs.md) · [002](docs/adr/ADR-002-unicode-first-rendering.md) · [003](docs/adr/ADR-003-google-docs-integration.md) · [004](docs/adr/ADR-004-deterministic-local-engine.md) · [005](docs/adr/ADR-005-formula-parser.md)
