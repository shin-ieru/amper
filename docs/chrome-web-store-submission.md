# Chrome Web Store submission: Amper v0.1.3

Prepared 6 October 2026 from the current Amper implementation. The v0.1.3 release adds extension icons, a 440×280 promotional image, and public landing/privacy pages; chemistry recognition and conversion behavior is unchanged. Nothing has been submitted to Google.

## Release package

- Archive: amper-v0.1.3.zip at the repository root
- Build source: apps/google-docs-extension/dist
- ZIP root: manifest.json
- Archive size: 41,381 bytes (107,974 uncompressed bytes)
- Contents: 11 files — manifest.json, bridge.js, content.js, popup.html, popup.js, reference.html, reference.js, and four icon PNGs
- SHA-256: e4a83cb131e927cec8f6eed0cbf8e50a112715b6c4210e2343353a76fc92811d
- Version: 0.1.3 in the extension manifest and all workspace package metadata

The ZIP contains only the production extension files needed by the current build, including `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, and `icons/icon128.png`. It excludes TypeScript sources, test files, source maps, caches, repository metadata, and development-only files not emitted by the build.

## Validation

- Typecheck: passed (`npm run typecheck`).
- Unit, integration, and corpus suite: passed — 19 test files, 785 tests (`npm test`).
- Production browser suite: passed — 63 tests (`npm run e2e`).
- Production extension popup/reference, consent, and icon suite: passed — 11 tests (`npm run e2e:extension`).
- Production extension build: passed (`npm run build:extension`).
- ZIP integrity and contents inspection: passed — 11 production files, `manifest.json` at the ZIP root, version 0.1.3, all four manifest icons present at their declared dimensions.
- Total automated test cases across the suites: 859 (785 Vitest + 63 production browser + 11 production extension browser).

## Packaged manifest facts

- Manifest version: 3
- Name: Amper
- Minimum Chrome version: 111
- Required permissions: storage
- Extension icon: 128×128 PNG at `icons/icon128.png`
- Additional extension/action icon sizes: 16×16, 32×32, and 48×48 PNGs from the same design
- Host permissions: none declared separately; the content scripts are scoped to https://docs.google.com/document/*
- Optional permissions: none
- Content script matches: https://docs.google.com/document/* for both scripts
  - bridge.js loads in the MAIN world at document_start but accepts no requests until the consent gate opens.
  - content.js loads in the isolated world at document_idle and attaches no Docs typing listeners until current consent is accepted and Amper is enabled.
- Web-accessible resources: none
- Externally connectable extension IDs: none
- Background page or service worker: none
- Remote code: none; the packaged code is self-contained.

### Permission justification

**storage**

Amper uses chrome.storage.local on this device for the user's consent version, enabled state, formatting settings, extension options, custom rules, never-convert entries, and settings migration version. It does not request storage.sync.

**Google Docs document-page access**

Amper's single purpose is formatting chemistry notation while the user types in Google Docs. The content scripts run only on document pages matching https://docs.google.com/document/*; no other host access is requested.

**Why bridge.js runs in the MAIN world**

Google Docs responds to synthetic keyboard events only when legacy keyCode fields are available to the page. The bridge is dormant until current consent has been accepted and Amper is enabled. After that, it dispatches the keyboard/clipboard events used to insert formatted text and read back a selected range for verification. Chemistry parsing and settings remain in the isolated extension code. The bridge does not make network requests.

## Store listing copy

### Name

Amper

### Short description

Chemistry autocorrect for Google Docs. Opt in; processing stays on your device.

### Detailed description

Write chemistry as fast as you write words.

Amper reads the text you type in Google Docs solely to detect and format chemistry notation. Processing happens locally in your browser. Document text is not sent to Amper servers or third parties. Amper does not process Google Docs typing until you choose **Enable Amper** in the popup; you can disable it later.

After enabling Amper, it formats chemistry notation as you type, as ordinary editable text.

- Formulas: h2so4 → H₂SO₄, Ca(OH)2 → Ca(OH)₂, N2 → N₂
- Charges and ions: Fe3+ → Fe³⁺, so4^2- → SO₄²⁻, [Fe(CN)6]3- → [Fe(CN)₆]³⁻
- Reactions and arrows: 2H2 + O2 -> 2H2O → 2H₂ + O₂ → 2H₂O; equi → ⇌
- State labels: (s), (l), (g), and (aq)
- Greek letters, hydrates, isotopes, electron configurations, and common scientific symbols

Press Backspace right after a conversion to restore what you typed. Ambiguous input such as O2+ is offered as a suggestion instead of guessed. Amper is intended for Google Docs and is not affiliated with or endorsed by Google.

Google Docs may save or sync the document through Google's own service.

Open the toolbar popup for examples, or choose “View all shortcuts” to search the shortcut reference.

### Category and language

Recommended category: Productivity. Listing language: English.

## Single-purpose statement

Amper has a single purpose: formatting chemistry and scientific notation as the user types in Google Docs documents. It converts typed formulas, ions, reactions, Greek letters, and related symbols into formatted text, and offers suggestions for ambiguous input.

## Data-use disclosure for the dashboard

Only after the user explicitly chooses **Enable Amper** does the extension observe keystrokes on Google Docs document pages and read the short in-memory text model it needs to identify chemistry notation. The model is capped at 512 JavaScript string units. Amper may read back the selected range when verifying a replacement. Processing occurs locally in the browser. A fresh install and an upgrade without the current consent marker both remain inactive until the user accepts. The consent version and enabled setting are persisted in chrome.storage.local; users can disable Amper later from the popup.

Suggested data categories to disclose:

- Website content: text typed in the Google Docs document near the caret, used locally to detect and format chemistry.
- User activity: keystrokes in the Google Docs editor, used locally to update the text model and identify conversion triggers.

Do not describe this data as never handled. It is handled locally, only after the affirmative action, for the extension's single purpose. The package contains no network client calls or server endpoint, and the inspected production code does not transmit document text to the developer or another third party. Google Docs' own normal document saving/sync is separate from Amper.

Suggested dashboard statements, subject to the exact current dashboard wording:

- The data is used only to provide Amper's disclosed chemistry-formatting feature.
- Amper does not sell or transfer document text or keystrokes.
- Amper does not use user data for advertising, creditworthiness, or lending.
- No analytics or advertising code is included.
- Production builds omit Developer / testing controls and the environment probe. Those controls exist only in development builds and are not included in the store package.

## Why Amper operates on Google Docs

Amper is a writing aid for people who write chemistry in Google Docs. After the user explicitly enables it, Amper formats notation such as chemical formulas, charges, reaction arrows, and physical-state labels in the document being edited. Until then, its typing listeners and document-editing bridge remain inactive. Amper requests no access to other websites.

## Privacy policy

The public policy page is rendered from the repository-root `PRIVACY.md`. Use this URL in the Chrome Web Store dashboard:

https://shin-ieru.github.io/amper/privacy/

The Pages deployment must be opened while signed out to confirm reachability. Because Amper processes website content and user activity locally after opt-in, a privacy policy is required even though the data is not sent to a server. The policy includes an affirmative statement about Chrome Web Store Limited Use. The dashboard privacy answers, listing copy, in-product disclosure, and policy must agree.

## URLs

- Homepage: https://shin-ieru.github.io/amper/
- Support: https://github.com/shin-ieru/amper/issues
- Privacy policy: https://shin-ieru.github.io/amper/privacy/

Confirm that the support page accepts issues and that the privacy URL is public before publishing the listing.

## Store screenshots

Chrome Web Store accepts full-bleed screenshots at **1280×800 pixels** (preferred) or **640×400 pixels**. It requires at least one screenshot and permits up to five. Use square corners with no added padding. Capture actual product behavior; do not create, reconstruct, or composite a Google Docs view.

1. **Manual — “Chemistry notation, formatted as you type.”** 1280×800. Capture the editable document content area after typing `N2 + 3H2 equi 2NH3`; show the actual formatted `N₂ + 3H₂ ⇌ 2NH₃` and enough surrounding document to make the example clear. Crop out account names, document title, and unrelated browser chrome.
2. **Manual — “Formulas, arrows, and state labels.”** 1280×800. In the same clean test document, show actual output such as `H₂O(l)`, `CO₂(g)`, and `equi → ⇌`; frame the document text, not a recreated UI.
3. **Prepared — “Try typing and settings.”** 1280×800. Real production popup after consent, showing the shortcut examples and product switches: `assets/store/screenshots/amper-popup-settings-1280x800.png`.
4. **Prepared — “Search the shortcut reference.”** 1280×800. Real production reference page with `equi` in search: `assets/store/screenshots/amper-reference-equi-1280x800.png`.

The two prepared images are captured from the built extension. The two Google Docs images remain for you to capture from a real editable document.

## Store asset checklist

- [x] Extension icon: `apps/google-docs-extension/static/icons/icon128.png` (128×128), referenced by the manifest.
- [x] Additional extension/action icons: `icon16.png`, `icon32.png`, and `icon48.png` from the same design.
- [x] Store icon: `apps/google-docs-extension/static/icons/icon128.png` (128×128).
- [x] At least one real product screenshot: prepared popup and reference captures are 1280×800.
- [x] Small promo image: `assets/store/amper-small-promo-440x280.png` (440×280 PNG).
- [ ] Marquee promo image: 1400×560, optional.
- [ ] Detailed description, category, and listing language.
- [ ] Public privacy policy URL, support URL, and homepage URL.
- [ ] Do not use Google logos or imply Google endorsement.

The production ZIP includes the 128×128 icon and the manifest references the smaller sizes. The 440×280 promotional image is prepared separately for the dashboard. The two prepared extension-page screenshots are ready; the two real Google Docs screenshots remain manual.

## Public-repository hygiene

The repository has no LICENSE file. No license has been selected or added. Decide whether to add a license before linking the public source repository as open-source software; without a license, do not advertise the code as open source. A license is separate from the Chrome Web Store listing requirements.

The public `/privacy/` page is generated from `PRIVACY.md` by `scripts/render-pages.mjs`; the repository Markdown remains the source of truth.

GitHub Pages deploys the checked-in `site/` directory through `.github/workflows/pages.yml`. The repository's Pages source must be set to **GitHub Actions**; the current unauthenticated URLs return 404 until that source is enabled and a deployment succeeds.

## Review blockers and risks

1. **Potential consent-timing policy blocker.** Amper's affirmative consent is collected in the popup after installation. The current Chrome Web Store disclosure policy says user-data practices must be prominently disclosed and affirmative informed consent obtained prior to installation. The listing and policy disclose processing but do not move the popup action before installation. Resolve the timing requirement before public release.
2. **Real Google Docs screenshots.** The two planned document screenshots still need to be captured manually from an editable document.
3. **No LICENSE file.** This is not a Web Store asset requirement, but the repository's code licensing remains unspecified.
4. **MAIN-world bridge.** It remains dormant until consent and enabled state allow processing. Explain its narrow event-dispatch and verification role in reviewer notes if asked.

Google's current policy requires an accurate privacy policy when an extension handles user data, transparent disclosure of collection, use, and sharing, and prominent disclosure plus affirmative informed consent prior to installation. Amper's first-run popup consent occurs after installation, so the consent-timing point above needs resolution before public release. See [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [2026 policy update](https://developer.chrome.com/blog/cws-policy-updates-2026), and [listing assets](https://developer.chrome.com/docs/webstore/images).

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

- [ ] Confirm the release commit/tag is v0.1.3 and the working tree is clean.
- [x] Run npm run typecheck, npm test, npm run e2e, and npm run e2e:extension.
- [x] Run npm run build:extension.
- [x] Inspect amper-v0.1.3.zip and confirm manifest.json is at the ZIP root, version is 0.1.3, and all 11 production runtime files are present.
- [x] Check that the ZIP contains no secrets, source maps, tests, caches, or repository artifacts.
- [x] Add the extension/store icon and small promo image.
- [ ] Load the extracted ZIP in a clean Chrome profile and verify the popup and shortcut reference.
- [ ] In an editable Google Doc, try h2so4, sigma, equi, H2O(l), and 2H2 + O2 -> 2H2O; verify Backspace restore and negative examples such as Room H2.
- [ ] Resolve the policy requirement for prominent disclosure and affirmative consent before installation; first-run popup consent is post-install.
- [ ] Confirm the homepage, privacy, and support URLs are publicly reachable while signed out.
- [ ] Confirm the GitHub Pages workflow completed successfully and the deployed homepage/privacy pages return HTTP 200 while signed out.
- [ ] Upload the package and complete the listing and Privacy practices fields. Review the dashboard preview before submitting.

No submission to Google has been made.
