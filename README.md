# Amper

Chemistry autocorrect and autocomplete for Google Docs. Type `H2SO4`, `SO4^2-`, `capital sigma` or `2H2 + O2 -> 2H2O` and Amper writes `H₂SO₄`, `SO₄²⁻`, `Σ`, `2H₂ + O₂ → 2H₂O` as ordinary editable text. Press Backspace straight after a conversion to get back exactly what you typed.

Everything runs locally and deterministically. No document text leaves the device.

## Status

| Area | State |
|---|---|
| Core engine, transactions, Backspace reversal, suppression | Done (Phase 0) |
| All 24 Greek letters, variants, scientific symbols, script commands | Done (Phase 1) |
| Neutral formula parser: groups, nesting, coefficients | Done (Phase 1) |
| Autocomplete, fuzzy suggestions, never-convert, custom rules, category toggles | Done |
| Playground harness with debug panel | Done |
| Google Docs spike | **Viable with documented limitations; edit-mode insertion still to be confirmed.** See [docs/google-docs-spike.md](docs/google-docs-spike.md) |
| Charges (implicit + caret), states, hydrates, isotopes, electron configurations, ASCII arrows, full reactions | Done (Phase 2); see [docs/parser.md](docs/parser.md) |
| Product behaviour: chemistry-aware by default, case recovery (`h2so4` → H₂SO₄), safe-punctuation triggers, Docs case-drift handling | Done |
| Production Google Docs integration (Phase 3) | Blocked on the manual edit-mode check in the spike doc |

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
3. Open a Google Doc and reload it. Amper is chemistry-aware whenever it is enabled; the popup only has on/off switches.

The extension is a **spike prototype**. Before relying on it, run the manual protocol in [docs/google-docs-spike.md](docs/google-docs-spike.md#manual-validation-protocol-editable-document).

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
