# Architecture

Amper is a deterministic, local chemistry-notation engine plus thin host adapters. The product is the Google Docs extension; the playground is a test harness that uses the same engine.

## Packages

| Package | Role | May depend on |
|---|---|---|
| `@amper/chemistry` | Element table, species lexer/parser/AST, charge readings, electron configurations, reaction token structure | — |
| `@amper/renderer` | AST → Unicode (default), AST → ASCII (normalisation) | chemistry |
| `@amper/rules` | Data-driven named rules (Greek, symbols, script commands), registry, custom-rule compiler | — |
| `@amper/core` | Engine pipeline, confidence policy, autocomplete, session (transactions + reversal), controller, adapter contract | chemistry, renderer, rules |
| `@amper/shared-ui` | Framework-free suggestion popup (shadow DOM) | core (types) |
| `apps/playground` | Textarea harness with debug panel | core, shared-ui |
| `apps/google-docs-extension` | MV3 extension: Docs adapter, MAIN-world bridge, popup | core, shared-ui |

The four engine packages compile against an **ES-only lib with no DOM types** (`packages/tsconfig.json`), so a DOM or Docs dependency in core is a compile error. A unit test also scans the engine sources for DOM and Docs identifiers (ADR-001).

## Typing path

```
host keystroke ─▶ EditorAdapter ─▶ AmperController ─▶ AmperSession ─▶ AmperEngine.evaluate()
                     ▲                                       │              │
                     │                                       │   bounded window (256 chars)
                     │                                       │   current line → candidates
                     │                                       │   recognisers: named · species · electron config · reaction
                     │                                       │   conflict resolution (priority, span, confidence)
                     │                                       │   band: ≥0.95 auto · 0.70–0.94 suggest · else none
                     │                                       ▼
                     └──── TailRewrite {deleteCount, insertText} + AmperTransaction
```

- **Boundaries.** Space, NBSP, Enter and the safe punctuation `, ; : ! ?` trigger evaluation. The period is not a trigger ("C3.ai", "v2.0", "2.5" continue past it) and neither is `)`, which is formula syntax. "H2O." converts at the next Space or Enter, keeping the period.
- **Product profile.** `productSettings()` (chemistry-aware, every assist on) is what the extension and the playground use. "standard" survives only as a conservative engine profile for tests and diagnostics; there is no user-facing mode.
- **Case recovery** is a separate stage that runs only when the typed text does not parse as written. It enumerates element tokenisations case-insensitively, re-cases them canonically and ranks them against a common-formula lexicon. It autocorrects only one clear interpretation. See [parser.md](parser.md#case-recovery).
- **Formatting spans.** Presentation (currently only subscript state labels) travels beside the text as `FormatSpan[]`, from recogniser to transaction to `TailRewrite.formatting`. Adapters without formatting ignore it, and no parser or text behaviour depends on it.
- **Host-observed text.** `applyRewrite` may return `{ ok, removedTail }` when the host replaced text that differs only by host-side changes (Docs auto-capitalisation). The session then stores the real text, so Backspace restores the document as it was.
- **TailRewrite** is the only edit primitive: delete N characters before the caret and insert text. Conversion, restoration and suggestion acceptance all use it. It is caret-relative because Docs has no addressable offsets (ADR-003). `planRewrite` narrows it to the changed characters for hosts where edits are expensive.
- **Session state.** It holds one pending reversible transaction, one suppression entry, the visible suggestions, and per-input restore counts. Any other input, a caret move, an undo or a paste clears the one-shot state.
- **Structural rewrites** (reactions, electron configurations) replace text from their *first changed token*. Only a structural recogniser that is uncertain yields to a certain conversion of a smaller span inside it; a custom or named rule keeps its §54 priority.
- **Respecting reverts.** Tokens the user reverted (by Backspace restore, or by native Undo of a pending conversion, reported by adapters as a `history` input event) are frozen for the session. Structural rewrites never touch them again.
- **Reversal.** If the host can intercept keys, Backspace is consumed and the original is restored (`backspacePressed`). If it cannot, the host deletes one character first and the remainder is restored (`backspaceApplied`). The restored text is suppressed at the next boundary. After two restores of the same input in a session, that input is suggested instead of converted (spec §56).
- **Undo.** Native. The playground's rewrites are single `execCommand("insertText")` steps (verified by E2E). Docs Undo granularity is still open (spike Q6).

## Hosts

`EditorAdapter` (`packages/core/src/controller/adapter.ts`) follows spec §41, with two adaptations: context is "text before the caret", and edits are tail rewrites. Adapters report committed input (`insertText`, `deleteBackward`, `other`), key downs (which they may consume), caret movement and composition.

| Adapter | Context source | Edit mechanism | Key interception |
|---|---|---|---|
| `VirtualEditor` (tests) | string + caret | splice | configurable |
| `TextareaAdapter` | `textarea.value` | `execCommand("insertText")`, falling back to `setRangeText` | `preventDefault` |
| `DocsAdapter` | `TypingBuffer` shadow model | MAIN-world bridge: synthetic legacy-keyCode events, copy-verify | capture-phase `stopImmediatePropagation` |

## Privacy and performance

- No network access anywhere in the engine or extension. Extension storage is `chrome.storage.local`. The only permission is `storage`; host access is limited to `https://docs.google.com/document/*`.
- Diagnostics log event names, rule ids and lengths, never document text.
- Median decision time is asserted to be under 5 ms (measured ≈ 0.1 ms in the playground debug panel). The context window is fixed at 256 characters, independent of document length.

## Legacy name (Chemly → Amper)

The project was renamed from Chemly to Amper on 2026-10-06. The only intentional remaining references to the old name are the pre-rename storage keys. They exist solely so existing users keep their settings:

| Key | Where | Handling |
|---|---|---|
| `chemly.settings`, `chemly.extension` | `chrome.storage.local` (extension) | `migrateLegacyStorage` copies each to its `amper.*` key once (never overwriting newer data), then removes it |
| `chemly.playground.settings` | `localStorage` (playground) | Same, in `loadSettings` |

Tests that exercise the migration necessarily name these keys. Do not remove the legacy keys until users of pre-rename builds no longer need the migration.
