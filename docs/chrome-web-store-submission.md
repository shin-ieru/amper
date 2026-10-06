# Chrome Web Store submission: Amper v0.1.1

Prepared 6 October 2026 from the current Amper implementation. The existing tag v0.1.0 still points to commit 422b1d0; the current implementation continued through 84bd7ec and is prepared as v0.1.1. Nothing has been submitted to Google.

## Release package

- Archive: amper-v0.1.1.zip at the repository root
- Build source: apps/google-docs-extension/dist
- ZIP root: manifest.json
- Archive size: 37,429 bytes (105,384 uncompressed bytes)
- Contents: 7 files — manifest.json, bridge.js, content.js, popup.html, popup.js, reference.html, and reference.js
- SHA-256: 104beb81b5a52c25bcdd106add2baf883f04549f636699e70fbab3bdf559265a
- Version: 0.1.1 in the extension manifest and all workspace package metadata

The ZIP contains only the production extension files needed by the current build: manifest.json, bridge.js, content.js, popup.html, popup.js, reference.html, and reference.js. It excludes TypeScript sources, test files, source maps, caches, repository metadata, and development-only files not emitted by the build.

## Validation completed

- Typecheck: passed.
- Full unit, integration, and corpus suite: passed — 18 test files, 780 tests.
- Production browser suite: passed — 63 tests.
- Extension popup/reference browser suite: passed — 8 tests.
- Production extension build: passed.
- ZIP integrity and contents inspection: passed; manifest.json is at the ZIP root and reports Amper 0.1.1.
- Secret, source map, test, cache, and network/remote-code marker scan of packaged files: passed.

## Packaged manifest facts

- Manifest version: 3
- Name: Amper
- Minimum Chrome version: 111
- Required permissions: storage
- Host permissions: none declared separately; the content scripts are scoped to https://docs.google.com/document/*
- Optional permissions: none
- Content script matches: https://docs.google.com/document/* for both scripts
  - bridge.js runs in the MAIN world at document_start.
  - content.js runs in the isolated world at document_idle.
- Web-accessible resources: none
- Externally connectable extension IDs: none
- Background page or service worker: none
- Remote code: none; the packaged code is self-contained.

### Permission justification

**storage**

Amper uses chrome.storage.local on this device for its settings, extension options, custom rules, never-convert entries, settings migration version, and first-run onboarding state. It does not request storage.sync.

**Google Docs document-page access**

Amper's single purpose is formatting chemistry notation while the user types in Google Docs. The content scripts run only on document pages matching https://docs.google.com/document/*; no other host access is requested.

**Why bridge.js runs in the MAIN world**

Google Docs responds to synthetic keyboard events only when legacy keyCode fields are available to the page. The bridge dispatches the keyboard/clipboard events used to insert formatted text and read back a selected range for verification. Chemistry parsing and settings remain in the isolated extension code. The bridge does not make network requests.

## Store listing copy

### Name

Amper

### Short description

Chemistry autocorrect and autocomplete for Google Docs. Runs locally.

### Detailed description

Write chemistry as fast as you write words.

Amper formats chemistry notation as you type in Google Docs, as ordinary editable text.

- Formulas: h2so4 → H₂SO₄, Ca(OH)2 → Ca(OH)₂, N2 → N₂
- Charges and ions: Fe3+ → Fe³⁺, so4^2- → SO₄²⁻, [Fe(CN)6]3- → [Fe(CN)₆]³⁻
- Reactions and arrows: 2H2 + O2 -> 2H2O → 2H₂ + O₂ → 2H₂O; equi → ⇌
- State labels: (s), (l), (g), and (aq)
- Greek letters, hydrates, isotopes, electron configurations, and common scientific symbols

Press Backspace right after a conversion to restore what you typed. Ambiguous input such as O2+ is offered as a suggestion instead of guessed. Amper is intended for Google Docs and is not affiliated with or endorsed by Google.

Amper processes the text it needs on your device to format chemistry. Its code does not send document text to Amper or third-party servers. Google Docs may save or sync the document through Google's own service.

Open the toolbar popup for examples, or choose “View all shortcuts” to search the shortcut reference.

### Category and language

Recommended category: Productivity. Listing language: English.

## Single-purpose statement

Amper has a single purpose: formatting chemistry and scientific notation as the user types in Google Docs documents. It converts typed formulas, ions, reactions, Greek letters, and related symbols into formatted text, and offers suggestions for ambiguous input.

## Data-use disclosure for the dashboard

The extension reads user-entered text and observes keystrokes on Google Docs document pages so it can identify chemistry notation as the user types. The current implementation uses a short in-memory text model, capped at 512 JavaScript string units, plus a selected range read-back when verifying a replacement. Processing occurs locally in the browser.

Suggested data categories to disclose:

- Website content: text typed in the Google Docs document near the caret, used locally to detect and format chemistry.
- User activity: keystrokes in the Google Docs editor, used locally to update the text model and identify conversion triggers.

Do not describe this data as never handled. It is handled locally for the extension's single purpose. The package contains no network client calls or server endpoint, and the inspected production code does not transmit document text to the developer or another third party. Google Docs' own normal document saving/sync is separate from Amper.

Suggested dashboard statements, subject to the exact current dashboard wording:

- The data is used only to provide Amper's disclosed chemistry-formatting feature.
- Amper does not sell or transfer document text or keystrokes.
- Amper does not use user data for advertising, creditworthiness, or lending.
- No analytics or advertising code is included.
- If diagnostics are enabled by the user in the popup's Developer / testing section, Amper writes technical event information to the browser's local developer console; it is not transmitted.

## Why Amper operates on Google Docs

Amper is a writing aid for people who write chemistry in Google Docs. It formats notation such as chemical formulas, charges, reaction arrows, and physical-state labels in the document the user is editing. That requires observing typing and applying edits in Google Docs document pages. Amper requests no access to other websites.

## Privacy policy draft

The proposed policy is in the repository root at PRIVACY.md. After it is committed and pushed, use this public URL in the Chrome Web Store dashboard:

https://github.com/shin-ieru/amper/blob/main/PRIVACY.md

This URL must be opened while signed out to confirm it is reachable. Because Amper processes website content and user activity locally, the Chrome Web Store policy says a privacy policy is required even when data is not sent to a server. The Dashboard privacy answers, listing copy, in-product disclosure, and policy must agree.

## URLs

- Homepage: https://github.com/shin-ieru/amper
- Support: https://github.com/shin-ieru/amper/issues
- Privacy policy: https://github.com/shin-ieru/amper/blob/main/PRIVACY.md

Confirm that the support page accepts issues and that the privacy URL is public before publishing the listing.

## Screenshot plan

Capture up to five 1280×800 images in a real Google Doc, with no personal information or Google branding in the artwork. Use a clean profile, a plain document, and a readable zoom level.

1. “Type h2so4. Get H₂SO₄.” Show converted H₂SO₄, Ca(OH)₂, and N₂ in an editable document.
2. “Write reactions naturally.” Show N₂ + 3H₂ ⇌ 2NH₃ and 2H₂ + O₂ → 2H₂O.
3. “State labels made clear.” Show examples with (s), (l), (g), and (aq) as they appear in the extension.
4. “Ambiguous? Amper asks.” Show the suggestion choices for O2+.
5. “Every shortcut, searchable.” Show the popup and reference page with equi searched.

Use actual extension behavior in each image and avoid personal account names, document titles, or text.

## Store asset checklist

- [ ] Extension icon: 128×128 PNG inside the ZIP and referenced by the manifest. Optional 16×16, 32×32, and 48×48 sizes can be supplied for browser surfaces.
- [ ] Store icon: 128×128.
- [ ] At least one screenshot: 1280×800 or 640×400; up to five are allowed.
- [ ] Small promo image: 440×280 PNG or JPEG.
- [ ] Marquee promo image: 1400×560, optional.
- [ ] Detailed description, category, and listing language.
- [ ] Public privacy policy URL, support URL, and homepage URL.
- [ ] Do not use Google logos or imply Google endorsement.

The current extension manifest and ZIP have no icon. The Web Store requires a 128×128 icon in the ZIP, and the listing requires an icon, at least one screenshot, and a 440×280 small promotional image. Those assets are not included in this package.

## Public-repository hygiene

The repository has no LICENSE file. No license has been selected or added. Decide whether to add a license before linking the public source repository as open-source software; without a license, do not advertise the code as open source. A license is separate from the Chrome Web Store listing requirements.

PRIVACY.md is prepared as the privacy-policy draft. Review its contact details and publishability before using its URL in the dashboard.

## Review blockers and risks

1. **Missing required store assets.** The extension ZIP has no icon, and no store screenshots or small promotional tile have been prepared.
2. **Consent and disclosure review needed.** The current product defaults to enabled automatic conversion. On a Google Docs document page it observes typing before the user opens the popup. The popup says formatting is local and text is not sent, but the current code does not gate processing behind an in-product affirmative consent step. Chrome announced tighter disclosure requirements in July 2026, with enforcement beginning 1 August 2026. Review this behavior against the current policy before public submission; if an explicit opt-in is required, that needs a product change and is outside this version-only release.
3. **Developer / testing controls are included in the current popup.** Insertion strategy, verification, diagnostics, and an environment probe are present in the built popup. They are labeled as development controls but are still part of the production UI; decide whether to remove them in a later product change.
4. **No LICENSE file.** This is not a Web Store asset requirement, but the repository's code licensing remains unspecified.
5. **MAIN-world bridge.** Explain its narrow event-dispatch and verification role in reviewer notes if asked.

Google's current policy requires an accurate privacy policy when an extension handles user data and requires transparent disclosure of collection, use, and sharing. Its July 2026 policy update also says all data collection must be prominently disclosed. See [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [2026 policy update](https://developer.chrome.com/blog/cws-policy-updates-2026), and [listing assets](https://developer.chrome.com/docs/webstore/images).

## Public-distribution checklist

- [ ] Register the developer account; enable required 2-Step Verification.
- [ ] Verify publisher display name and contact email.
- [ ] Choose Public or Unlisted visibility and intended distribution regions.
- [ ] Complete the Privacy practices dashboard using disclosures consistent with the package and PRIVACY.md.
- [ ] Complete single purpose, permission justifications, data-use answers, and certifications.
- [ ] Publish and verify the privacy policy URL while signed out.
- [ ] Confirm current disclosure/consent compliance before enabling public distribution.
- [ ] Upload the icon, screenshots, and small promo image.
- [ ] Keep listing claims consistent with what the build actually does; do not imply Google endorsement.
- [ ] Decide whether to add a LICENSE to the public repository.

## Manual pre-submission checklist

- [ ] Confirm the release tag is v0.1.1 and the working tree is clean.
- [x] Run npm run typecheck, npm test, npm run e2e, and npm run e2e:extension.
- [x] Run npm run build:extension.
- [x] Inspect amper-v0.1.1.zip and confirm manifest.json is at the ZIP root, version is 0.1.1, and the seven required runtime files are present.
- [x] Check that the ZIP contains no secrets, source maps, tests, caches, or repository artifacts.
- [ ] Add the required extension/store icon and small promo image before upload.
- [ ] Load the extracted ZIP in a clean Chrome profile and verify the popup and shortcut reference.
- [ ] In an editable Google Doc, try h2so4, sigma, equi, H2O(l), and 2H2 + O2 -> 2H2O; verify Backspace restore and negative examples such as Room H2.
- [ ] Review the updated user-data disclosure and consent behavior against the current Chrome Web Store policies.
- [ ] Confirm the privacy policy and support URLs are publicly reachable.
- [ ] Upload the package and complete the listing and Privacy practices fields. Review the dashboard preview before submitting.

No submission to Google has been made.
