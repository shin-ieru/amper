# Amper Privacy Policy

Effective 6 October 2026

Amper is a Chrome extension that formats chemistry notation while you type in Google Docs.

## Information Amper processes

When Amper is enabled on a Google Docs document page, it observes keystrokes in the Docs editor and keeps a short in-memory model of text immediately before the caret. The model is capped at 512 JavaScript string units and is used to recognize chemistry notation as it is typed. When Amper verifies a replacement, it reads back the selected text range through a page-local clipboard event. Amper does not scan or store the full document.

This processing happens locally in the browser and is used only to provide Amper's chemistry-formatting feature. The text is not sent by Amper to the developer or to third-party servers. The extension package has no network client or server endpoint. Google Docs may save or sync the edited document through Google's own service; that is separate from Amper's processing.

## Information stored by Amper

Amper stores extension settings and options, such as enabled features, never-convert entries, custom rules, insertion and verification options, and whether first-run tips were dismissed. This information is stored using Chrome's local extension storage on the device. Amper does not use Chrome's sync storage and does not store document text there.

## Optional diagnostics

An optional Developer / testing setting is off by default. If enabled, Amper writes technical event information such as event types, rule identifiers, counts, lengths, timings, and formatting diagnostics to the browser's local developer console. The extension does not transmit these diagnostics.

## Sharing

Amper does not sell, transmit, or share the document text or keystrokes it processes. It contains no analytics, advertising, or tracking code. Changes made in a Google Docs document remain subject to Google's own service behavior and privacy terms.

## Contact

For support or privacy questions, use the Amper GitHub Issues page:

https://github.com/shin-ieru/amper/issues
