# Browser storage and cookie policy

Analytify deliberately uses no advertising, analytics, fingerprinting, social-plugin, or A/B-testing storage. The machine-readable source of truth is [`config/browser-storage-inventory.json`](../config/browser-storage-inventory.json).

## Why there is no cookie banner

Austria's Data Protection Authority states that a banner is unnecessary when a site uses no technically non-essential cookies. § 165(3) TKG 2021 permits terminal storage/access without consent only when it is strictly necessary to deliver a service explicitly requested by the user (or solely to transmit a communication).

Analytify's current browser storage is limited to:

- a first-party record of the Terms and Privacy Notice version the user accepted;
- signed-in authentication state needed for requested cloud/collaboration features;
- local app data and feature caches needed to provide requested Spotify features;
- tab-scoped authentication, navigation, recovery, and comparison state;
- the same-origin application cache and service worker; and
- an optional push subscription created only after the user opts in and grants browser permission.

A fresh logged-out visit creates no cookie, authentication record, feature record, stats record, or tracking identifier. Production may create the empty IndexedDB schema and same-origin application cache so the app can start and update reliably.

This is an engineering policy, not a blanket legal conclusion for future features. Adding analytics, advertising, fingerprinting, social plugins, A/B testing, a cross-origin script, or any storage not strictly necessary for a user-requested feature requires legal review and prior consent before release.

## Enforcement

`npm run storage-policy:check` fails when application code uses a browser-storage API from an unapproved file, when a third-party script is introduced, when a new inventory entry is not marked and explained, or when the service worker starts caching network data. A browser regression test confirms that a fresh logged-out visit contains no account, feature, stats, or tracking data.

Review the inventory whenever browser storage, authentication, notifications, caching, or embedded services change. The public Privacy Notice must continue to disclose the purpose, legal basis, and duration of any personal-data processing.

## Primary sources

- [Austrian Data Protection Authority: Datenschutz & Cookies](https://dsb.gv.at/faqs/datenschutz-cookies)
- [RIS: § 165 TKG 2021](https://ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20011678&Paragraf=165)
