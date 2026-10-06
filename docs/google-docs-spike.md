# Google Docs integration spike

**Date:** 2026-10-06 · **Spec:** §37–40 · **Decision record:** [ADR-003](adr/ADR-003-google-docs-integration.md)

## Conclusion

**Viable with documented limitations.** Update 2026-10-06: the product owner has manually verified that the extension attaches to and edits a real, editable Google Doc, closing the one link this spike could not test (below, kept for the record). Per-row results for lists, tables, pageless, Suggesting mode, collaboration, IME and screen readers are still to be recorded under "Edit-mode results".

A Manifest V3 extension can observe typing in current Google Docs, model the text just before the caret, select exactly the characters to replace, **read them back to verify** before touching them, intercept Backspace/Tab/Esc, and show an inline suggestion UI. Each of those mechanisms was **verified against live Google Docs** (details below).

One link in the chain is **not yet verified**: synthetic *insertion* of replacement text in an *editable* document. The spike environment had no Google account, so only a public, view-only document was available, and Docs refuses edits there. Indirect evidence is strong but not conclusive:

- Docs consumes synthetic `keypress` events (`defaultPrevented: true`), just as it does synthetic Backspace and Shift+Arrow, both of which we confirmed take effect.
- Public prior work types into Docs through the same hidden iframe ([google-docs-utils][gdu]).

**Before Phase 3 commits to this approach, run the 15-minute [manual protocol](#manual-validation-protocol-editable-document) in a signed-in browser.** If insertion fails with both strategies, the conclusion becomes *not viable with current method*, and the fallback path in [§ Alternatives](#alternatives-considered) applies.

## How the evidence was gathered

| Method | What it can show | Scripts |
|---|---|---|
| Headless Google Chrome (throwaway profile) on a public view-only Doc (Google's own Docs API quickstart sample) | Real Docs DOM, event routing, selection, copy, interception | [`probe-dom.mjs`](spike/probe-dom.mjs), [`probe-keys.mjs`](spike/probe-keys.mjs), [`probe-synthetic.mjs`](spike/probe-synthetic.mjs), [`probe-handlers.mjs`](spike/probe-handlers.mjs) |
| The **built** MAIN-world bridge evaluated in that page | The production bridge code drives real Docs correctly | [`validate-bridge.mjs`](spike/validate-bridge.mjs) |
| The **built extension** loaded into Playwright Chromium on that page | Manifest, world split, iframe attachment, trusted-key observation, overlay, Esc interception, probe messaging | [`validate-extension.mjs`](spike/validate-extension.mjs) |
| Unit tests with a recording fake of Docs' observed semantics | Adapter edit sequence, abort-on-mismatch | `apps/google-docs-extension/src/content/*.test.ts` |

Selection effects were measured by **pixel-diffing the canvas**, because Docs hides the caret element in view-only mode. Rerun any script with `node docs/spike/<name>.mjs`; `validate-extension.mjs` needs `npx playwright install chromium` first, since branded Chrome 137+ ignores `--load-extension`.

## Verified facts about current Google Docs

| # | Finding | Evidence |
|---|---|---|
| F1 | The document body is **canvas-rendered**. There were 0 legacy word/line DOM nodes, so text cannot be read from the DOM. | `probe-dom`: `canvasTiles: 1`, `legacyWordNodes: 0`, `lineviews: 0` |
| F2 | Keystrokes go to a hidden `iframe.docs-texteventtarget-iframe`. It is `about:blank`, same-origin with the page, and contains `<div contenteditable="true" role="textbox">`. The iframe is focused while editing. | `probe-dom`, `probe-keys` (`activeElementIsIframe: true`) |
| F3 | **Trusted** keydowns reach a capture listener on the iframe's window. | `probe-keys`: `keydown:ArrowRight:true` ×3; `validate-extension`: typing `capital sig` drove the Σ suggestion |
| F4 | A capture listener calling `preventDefault()` + `stopImmediatePropagation()` **prevents Docs from handling the key**. This is what Backspace-restore and Tab-accept depend on. | `probe-synthetic`: `blockedTrustedLeavesCanvasUnchanged: true` |
| F5 | Docs **acts on synthetic (untrusted) key events** that carry legacy `keyCode`/`which`. Synthetic Shift+ArrowLeft ×3 produced a selection pixel-identical to the trusted one. | `probe-synthetic`: `syntheticEqualsTrustedSelection: true` |
| F6 | Synthetic events with only modern `key`/`code` fields are **ignored**. | `probe-synthetic`: `modernOnlySyntheticChangesCanvas: false` |
| F7 | A synthetic `copy` event with our own `DataTransfer` makes Docs **write the current selection into it** (`text/plain`, `text/html`, Docs-internal types). The system clipboard is never touched. With a collapsed caret it returns nothing. | `probe-synthetic`: `text: "doc"`; `validate-bridge`: `copyWithCollapsedCaret: null` |
| F8 | Selected text is **not** mirrored into the hidden iframe's DOM. | `probe-synthetic`: `selectionMirroredIntoIframe: ""` |
| F9 | Docs calls `preventDefault()` on synthetic `keypress`, Backspace and Shift+ArrowLeft, meaning its handlers claim them. A synthetic `paste` was *not* claimed in view-only mode, which is inconclusive because paste is disallowed there. | `probe-handlers` |
| F10 | `.kix-cursor-caret` exists, giving caret geometry for positioning the overlay. It is `display: none` in view-only mode. | `probe-dom`, `probe-keys` |
| F11 | `docs.google.com` **enforces Trusted Types**: `<script>` text injection throws. Any `innerHTML`-style sink in our UI would also fail, so the overlay uses DOM APIs only. | `validate-bridge` first run: `This document requires 'TrustedScript' assignment` |
| F12 | `window._docs_annotate_canvas_by_ext` is undefined by default. The annotated-canvas mode used by Grammarly-class extensions is gated by a **Google allowlist** of extension IDs. | `probe-dom`; [Chromium extensions group][allowlist], [9to5Google][canvas] |
| F13 | Apps Script has **no `onEdit` trigger for Docs**, only for Sheets. Live autocorrect cannot be built on Apps Script. | [Apps Script triggers][triggers]; [tanaike][pseudo] |
| F14 | The **production build** works end-to-end on a live Doc. The MAIN-world bridge answers, the content script attaches to the iframe, trusted typing is observed, the autocomplete overlay renders inside Docs, and Esc is intercepted. | `validate-extension`: `attached: true`, `overlayShownForTrustedTyping: true`, `escapeDismissed: true` |
| F15 | The bridge's exact edit choreography is correct on live Docs: step left N, Shift+select M, read back via copy, and on mismatch collapse right and return. | `validate-bridge`: all four `pass: true` (`"doc"`, `"ple"`, `"doc"`, `" doc"`) |

## Architecture this produced

```
Docs top document                                hidden text-event iframe (about:blank, same origin)
┌──────────────────────────────────────────┐     ┌───────────────────────────────────┐
│ content.js  (isolated world)             │     │ <div contenteditable role=textbox>│
│  ├ capture listeners ───────────────────────────▶ trusted keydown / composition / paste
│  ├ TypingBuffer  (text typed since last  │     └───────────────▲───────────────────┘
│  │   caret discontinuity)                │                     │ synthetic keydown/keypress/copy
│  ├ AmperController + AmperSession      │                     │ with legacy keyCode (F5, F6)
│  │   (shared @amper/core, no DOM)       │                     │
│  ├ SuggestionList overlay (shadow DOM)   │     ┌───────────────┴───────────────────┐
│  └ bridgeRequest() ── CustomEvent ─────────────▶ bridge.js (MAIN world, ~2 KB)     │
└──────────────────────────────────────────┘     │ only dispatches events, reads copy│
                                                 └───────────────────────────────────┘
```

- **Why two worlds.** Docs needs legacy `keyCode` on synthetic events (F6). Those are set with `Object.defineProperty` on the event object, and the page's code cannot see properties defined from an isolated world (each world has its own JS wrappers). The bridge therefore runs in the MAIN world and does nothing else. The engine, settings and storage stay isolated.
- **Reading context.** Docs exposes no text (F1), so `TypingBuffer` models "text immediately before the caret" from observed trusted keys, and resets to empty on anything it cannot model: clicks, arrows, shortcuts, paste, IME commits, focus loss. **Empty context means no conversion.** Uncertainty degrades to doing nothing, never to a wrong edit.
- **Writing.** `planRewrite` narrows each rewrite to the changed characters and steps *around* the boundary the user typed, so a space or paragraph/list break is never re-typed. Per conversion: `moveLeft(keep)` → `selectBack(n)` → `copySelection` verify (F7) → `insert` → `moveRight(keep)`. If the read-back text differs from what the buffer expects, the adapter collapses the selection, restores the caret, resets the buffer and **makes no edit**.
- **Restoring.** Backspace is intercepted (F4) only while a conversion is intact immediately before the caret. Restoration uses the same rewrite primitive.

## Spike questions (spec §38)

Status key: **✅ verified live** · **🟡 implemented, verified off-Docs only** · **⬜ untested, needs an editable doc**

| # | Question | Status | Answer |
|---|---|---|---|
| 1 | Observe relevant text input? | ✅ | Yes. Trusted key events via a capture listener on the text-event iframe (F2, F3, F14). |
| 2 | Determine text immediately before the caret? | ✅ / limited | Not from the DOM (F1). The shadow buffer covers text typed since the last caret discontinuity. Actual document text can also be read on demand via synthetic select + copy (F7), which is used for verification. **Limitation:** clicking back into an existing word and pressing Space does not convert it. |
| 3 | Replace only the intended range? | ✅ select/verify · ⬜ insert | Exact N-character selection and read-back were verified (F5, F7, F15). Insertion in edit mode is unverified. |
| 4 | Preserve caret position? | ✅ choreography · ⬜ post-insert | Collapse-and-return verified (F15). The caret after insertion is unverified. |
| 5 | Avoid breaking native typing? | ✅ observation · ⬜ edit mode | Listeners are passive except when consuming Backspace, Tab, Esc or arrows. Blocking is real (F4), so consumption is gated to a visible suggestion or an intact pending conversion. |
| 6 | Sensible Undo unit? | ⬜ | Unknown. Selection keys are not undo steps; whether Docs groups the inserted characters into one step must be observed. Native Undo in the **playground** is verified as one step. |
| 7 | Immediate Backspace restores original? | ✅ interception · ⬜ insert | Built from F4 + the rewrite primitive. A post-delete fallback exists in core (`backspaceApplied`) for hosts where interception fails. |
| 8 | Paged documents? | ✅ | The probe document is paged (`kix-page-paginated` present). |
| 9 | Pageless documents? | ⬜ | The mechanisms are layout-independent, but this is untested. |
| 10 | Lists? | ⬜ | By design the typed Enter is never re-sent (`planRewrite` keeps the boundary), so list items are not recreated. Untested. |
| 11 | Tables? | ⬜ | Tab moves between cells. Amper consumes Tab **only** while a suggestion is visible. Untested. |
| 12 | Avoid comments and unrelated UI? | 🟡 | Only the document text-event iframe is observed; comment boxes, menus and dialogs are separate DOM inputs. Whether comment typing ever routes through the same iframe is untested. |
| 13 | Suggesting mode? | ⬜ | Expected to behave like user typing (edits become suggestions). Untested. |
| 14 | Collaborative edits? | 🟡 | Remote edits elsewhere don't affect the text immediately before the local caret. Verify-before-replace catches a collaborator editing the same span (abort). Never rewrites remote text. Untested live. |
| 15 | IME / composition? | 🟡 | Composition events reset the buffer and block evaluation. Unit-tested; untested in Docs. |
| 16 | Accessibility / screen-reader mode? | ⬜ | Docs' screen-reader support changes rendering. Untested. The overlay is ARIA-labelled and makes no live announcements. |
| 17 | How brittle against Docs UI changes? | Assessed | **High inherent risk.** It depends on an internal iframe class (with a structural fallback), Docs' handling of synthetic legacy-`keyCode` events, synthetic-copy behaviour, and `.kix-cursor-caret` for positioning (fallback exists). All are undocumented and can change without notice. Mitigations: a single module per dependency, the built-in probe, fail-safe no-op when anything is missing, and verify-before-replace. |
| 18 | Avoid unstable CSS class names? | Partially | Frame discovery falls back to structure (a same-origin frame with `contenteditable` `role=textbox`). Overlay positioning still prefers `.kix-cursor-caret`. Synthetic-event semantics cannot be made class-free. |
| 19 | Position inline suggestions correctly? | ✅ render · ⬜ at caret | The overlay renders inside Docs (F14) at the fallback position, because the caret is hidden in view-only mode. Anchoring to the visible caret in edit mode is untested. |
| 20 | Detect host changes without polling? | ✅ | Event-driven key observation. A MutationObserver watches only for the iframe being created or replaced (subtree until found, then the parent only). Nothing scans document text, and there is no text in the DOM to scan. |

## Genuine limitations discovered

1. **Canvas rendering hides document text** (F1). Amper converts only what it watched being typed. That is safe, but it means no "fix the token I clicked back into" behaviour without the read-back trick.
2. **Synthetic events need the MAIN world** (F6 + isolated-world semantics). This adds a second script and a tiny cross-world protocol. A page script could, in principle, spoof bridge responses. That is acceptable on `docs.google.com`, and it is why verification failures abort rather than proceed.
3. **Trusted Types are enforced** (F11). There must be no `innerHTML`/script sinks anywhere in code that runs on Docs.
4. **The allowlisted annotated canvas is not available to Amper** (F12). Injecting another extension's allowlisted ID would be impersonation, so it is rejected outright.
5. **Docs' own Substitutions and auto-capitalisation** can change characters the buffer believes it knows. Verify-before-replace handles this. A *case-only* difference (Docs turning `capital` into `Capital`) proceeds, and the adapter reports the document's real text, so Backspace restores what was actually there. Any other difference aborts with no edit. Found in manual testing; covered by `docs-regressions.test.ts`.
6. **Undo granularity is not controllable** by an extension and is still unknown (Q6).
7. **Automated Docs E2E needs a dedicated test Google account** plus Chrome for Testing or Chromium. Branded Chrome 137+ ignores `--load-extension` ([PSA][loadext]).
8. **No Apps Script path for live typing** (F13). Apps Script remains useful only for explicit commands, bulk formatting and a sidebar (spec §40).

## Findings from manual editable-doc testing

| # | Finding | Handling |
|---|---|---|
| M1 | Docs sentence auto-capitalisation re-cases typed words (`capital` → `Capital`) behind Amper's model | Case-only read-back differences proceed; the session records the document's real text (product milestone) |
| M2 | `<=>` did not end as the equilibrium arrow ⇌. The engine emits U+21CC (verified by code point), so the likely cause is Docs' own automatic substitutions rewriting the ASCII token (e.g. to ⇔) before Amper converts it. I could not confirm Docs' exact default list from public sources | The adapter no longer depends on any list: when the read-back of an ASCII arrow token ends in a single host arrow character, Amper re-selects that character, verifies it, and replaces it with the canonical glyph. Diagnostics log Amper's inserted code points (never document text) for retest |
| M3 (validated 2026-10-06) | Native subscript is only reachable as a *toggle* (⌘/Ctrl + ,), and Docs inherits the formatting of the preceding character for new text, so subscript could leak into what follows | The adapter (1) re-inserts any label it formats, so it is baseline before toggling; (2) **reads the label back** through the synthetic copy's `text/html` and toggles again if it is still baseline; (3) selects the following character, reads it back, and un-toggles it if subscript leaked; (4) logs `formatted … verified: sub/baseline/unknown, leak: none/fixed/unfixed/unverified`. If Docs ignores the shortcut, the text stays correct (baseline) and the log says so. Nothing is faked |
| M4 | Docs' clipboard HTML carries `vertical-align` on every span (live: `vertical-align:baseline`), so formatting can be *read back* | `probe-format-html.mjs`; `validate-bridge.mjs` also verifies forward selection and left-collapse live. `vertical-align:sub` for subscript text is Docs' expected export but could not be observed on a view-only doc |

## Manual validation protocol (editable document)

The tester needs a Google account, about 15 minutes, and Chrome 111 or later.

1. `npm run build:extension`, then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and choose `apps/google-docs-extension/dist`.
2. Open `https://docs.new`. Amper is chemistry-aware whenever it is enabled; there is no mode to choose. Subscript state labels are on by default (popup checkbox). In the popup, open **Developer / testing**, turn on **Console diagnostics**, and reload the doc. Open DevTools → Console and filter for `[Amper]`.
3. Run each row with **Insertion: Synthetic keypress** (Developer / testing), then repeat the failing rows with **Synthetic paste**.

| ID | Do | Expect | Answers |
|---|---|---|---|
| T1 | Type `capital sigma ` | `Σ ` and the caret after the space; console `applied … convert` | Q3, Q4 |
| T2 | Then press Backspace | `capital sigma`; console `restore` | Q7 |
| T3 | Type `H2SO4 ` then press Cmd/Ctrl+Z once | `H2SO4 ` (record how many undos it actually takes) | Q6 |
| T4 | Type `I bought an M2 MacBook. ` | Unchanged | Q5 |
| T5 | Type `capital sig`, then Tab | Popup at the caret; `Σ`, no indent | Q11, Q19 |
| T6 | In a bulleted list, type `CO2⏎` then `H2O ` | `CO₂`, a new bullet, `H₂O`; list intact | Q10 |
| T7 | In a table cell, type `Ca(OH)2 `, then Tab with no popup | Converts; Tab moves to the next cell | Q11 |
| T8 | File → Page setup → Pageless, then repeat T1 | Same as T1 | Q9 |
| T9 | Switch to Suggesting mode, then repeat T1 and T2 | Edits appear as suggestions; Backspace restores | Q13 |
| T10 | Second account in the same doc types elsewhere while you type `NH3 ` | Only your text changes | Q14 |
| T11 | Type with a Japanese/Chinese IME | Nothing converts mid-composition | Q15 |
| T12 | Tools → Accessibility → screen reader support on, then repeat T1 | Record behaviour | Q16 |
| T13 | Type `capital sigma` in a comment box, then Space | Unchanged (not observed) | Q12 |
| T14 | Type 30 words quickly mixing `CO2`, `capital pi` and prose | No dropped or reordered keystrokes | Q5 |

Record the results, plus the popup's **Run environment probe** output, in this file under a new "Edit-mode results" heading, and update the conclusion.

## Edit-mode results

**2026-10-06, product owner, editable Google Doc:** native subscript state labels work for `(s)`, `(l)`, `(g)` and `(aq)`; following text returns to baseline; `equi` → ⇌ works as intended (T24, T25, T28 pass, as reported). The remaining rows below are still to be recorded individually.

| Field | Value |
|---|---|
| Date / tester | |
| Chrome version | |
| Insertion strategy that worked (keypress / paste / neither) | |
| Undo steps per conversion (T3) | |
| Popup probe output | (paste JSON) |

| ID | Result (pass / fail / partial) | Notes |
|---|---|---|
| T1 | | |
| T2 | | |
| T3 | | |
| T4 | | |
| T5 | | |
| T6 | | |
| T7 | | |
| T8 | | |
| T9 | | |
| T10 | | |
| T11 | | |
| T12 | | |
| T13 | | |
| T14 | | |
| T15 (Phase 2) type `SO4^2- ` and `2H2 + O2 -> 2H2O ` in Chemistry Mode | | |
| T16 (Phase 2) Cmd/Ctrl+Z after a reaction conversion, then keep typing the reaction | | Docs resets Amper's buffer on Undo, so the reverted text is never revisited |
| T17 (product) At the start of a paragraph type `capital sigma ` (Docs capitalises it) | | Expect exactly `Σ `; Backspace → `Capital sigma` |
| T18 (product) type `h2so4 `, `nacl `, `fecl3 ` | | Expect `H₂SO₄ `, `NaCl `, `FeCl₃ ` with no Tab; Backspace restores the lowercase |
| T19 (product) type `H2O, ` | | Converts at the comma |
| T20 (V2) type `sigma `, `Sigma `, `OMEGA `, `delta, ` | | `σ ω δ` automatically, no Tab; Backspace after `Sigma ` → `Sigma` |
| T21 (V2) type `capital sigma `, `small theta ` | | `Σ`, `θ`; never `Capital σ` |
| T22 (V2) type `H2O <=> ` and `equilibrium arrow ` with Docs substitutions **on** | | Both exactly ⇌ (console `applied … glyphs: U+21CC`; `host-substitution` if Docs rewrote it first) |
| T23 (V2) type `H2O <-> ` | | ⇄ (U+21C4), not ⇌ or ↔ |
| T24 type `H2O(l) is water` | | `(l)` subscript (whole label, both parentheses); `is water` baseline; console `formatted … verified: "sub", leak: "none"` |
| T25 type `H2O(l) NaCl(aq) CO2(g) CaCO3(s) done` | | each label subscript, spaces and `done` baseline |
| T26 after `H2O(l) `, press Backspace | | `H2O(l)` restored as plain baseline text |
| T27 after `CO2(g) `, press ⌘/Ctrl+Z repeatedly | | record how many steps undo the formatting and the text |
| T28 type `equi `, `Equi `, `EQUI `, and `equilibrium equipment ` | | `⇌` (U+21CC) three times; the words unchanged; Backspace after `Equi ` → `Equi` |

## Alternatives considered

| Option | Verdict |
|---|---|
| Apps Script / Workspace add-on live autocorrect | Rejected: no Docs `onEdit` (F13). Keep for explicit commands and bulk "format selection" (spec §40, §58). |
| Annotated canvas (`_docs_annotate_canvas_by_ext`) | Unavailable without Google allowlisting (F12). Worth applying for, since it would add a real text model, but it is not something to build the MVP on. |
| Docs API (REST) edits from the extension | Requires OAuth and server round-trips per keystroke, and loses local caret context. Rejected for the typing path; viable for bulk formatting. |
| Docs' built-in Tools → Preferences → Substitutions | No API and no formula parsing. It could only ever cover fixed phrases. Rejected. |
| **Fallback if insertion fails:** explicit-trigger mode | Keep detection and suggestions in-page. On accept, write the Unicode result to the clipboard and prompt the user to paste (one keystroke). Weaker UX, still local and editable. |

[gdu]: https://github.com/Amaimersion/google-docs-utils
[allowlist]: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/OP03CIUfews
[canvas]: https://9to5google.com/2021/05/11/google-docs-canvas-rendering/
[triggers]: https://developers.google.com/apps-script/guides/triggers
[pseudo]: https://tanaikech.github.io/2021/12/01/pseudo-onedit-trigger-for-google-document-using-google-apps-script/
[loadext]: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ
