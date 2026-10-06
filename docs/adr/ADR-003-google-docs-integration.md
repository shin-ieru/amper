# ADR-003: Google Docs integration mechanism

**Status:** Accepted, provisional on edit-mode validation · 2026-10-06

## Context
Amper needs per-keystroke behaviour in Docs. Docs renders text to canvas, routes keys through a hidden iframe, has no Apps Script `onEdit`, and gates its annotated canvas behind an allowlist (spike F1, F2, F12, F13).

## Options
1. Apps Script / Workspace add-on.
2. MV3 extension using the annotated canvas.
3. MV3 extension: observe trusted keys on the text-event iframe, model text in a shadow buffer, and edit through synthetic legacy-keyCode events dispatched from a MAIN-world bridge, with copy-based verification.
4. Explicit-trigger clipboard fallback.

## Decision
Option 3. Option 4 is the documented fallback if edit-mode insertion fails.

## Rationale
- Every mechanism except edit-mode insertion was verified live: observation, interception, synthetic selection, read-back via synthetic copy, and the whole built extension attaching and showing suggestions in Docs.
- Option 1 cannot see typing.
- Option 2 is unavailable without Google's approval.

## Consequences
- Edits are **caret-relative tail rewrites**, not ranges (`TailRewrite`).
- **Context is the shadow buffer.** Unknown context means no action.
- **Every replacement is verified** by selecting and reading back before inserting. A mismatch aborts with no edit.
- **Two worlds:** a ~2 KB MAIN-world `bridge.js` holds no logic or state; everything else stays isolated.
- **No `innerHTML`** in UI that runs on Docs (Trusted Types).

## Tradeoffs
- Depends on undocumented Docs behaviour (high maintenance risk).
- No conversion of text the user did not just type.
- Undo granularity is outside Amper's control.

## Evidence
`docs/google-docs-spike.md`, with the probes and validators in `docs/spike/`.
