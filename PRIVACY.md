# Amper Privacy Policy

Effective 6 October 2026

Amper is a Chrome extension that formats chemistry notation while you type in Google Docs.

## Your choice comes first

Before Amper processes any text typed in a Google Docs document, the popup displays a disclosure and asks you to choose **Enable Amper**. This applies to new installations and upgrades from earlier Amper versions that do not have a saved acceptance of this disclosure. Existing settings are retained, but they do not count as consent.

Amper saves the disclosure version you accepted and the enabled/disabled setting in Chrome's local extension storage. If you later turn Amper off in the popup, it stops observing Google Docs typing. You can turn it back on in the popup at any time. If a future disclosure version is introduced, Amper will wait for you to accept it before processing resumes.

## Information Amper processes

When you have accepted the disclosure and Amper is enabled on a Google Docs document page, it observes the keystrokes you type and keeps a short in-memory model of the text immediately before the caret. The model is capped at 512 JavaScript string units and is used solely to detect and format chemistry notation. When verifying a replacement, Amper reads back the selected text range through a page-local clipboard event. It does not scan or store the full document.

Processing occurs locally in your browser. Amper does not send document text or keystrokes to Amper servers or third parties. The extension package has no network client or server endpoint. Google Docs may save or sync the edited document through Google's own service; that is separate from Amper's processing.

## Information stored by Amper

Amper stores the consent version, whether Amper is enabled, your formatting preferences, and any never-convert entries or custom rules in Chrome's local extension storage on your device. Amper does not use Chrome's sync storage and does not store document text there.

## Production build

The Chrome Web Store build does not include the Developer / testing controls or the environment probe. It contains no analytics, advertising, or tracking code.

## Chrome Web Store Limited Use

Amper's use of information handled by the extension is limited to the disclosed single purpose of formatting chemistry text while you type in Google Docs, in accordance with the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Sharing

Amper does not sell, transmit, or share the document text or keystrokes it processes. Changes made in a Google Docs document remain subject to Google's own service behavior and privacy terms.

## Contact

For support or privacy questions, use the Amper GitHub Issues page:

https://github.com/shin-ieru/amper/issues
