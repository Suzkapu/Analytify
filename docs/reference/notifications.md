# Notifications

Notifications are planned for native apps and the website/PWA, including unscheduled events such as friend requests. The PWA notification path must work independently of native iOS distribution.

## Delivery and privacy

- Use an optional online service to record social events and send remote notifications. Local-only use remains available without it.
- Keep an authenticated notification inbox or event record so users can see missed events. Push is a delivery signal, not the only copy of an event. Retention and delivery ownership are not decided yet.
- Register each device or browser subscription only after user consent. Store only the subscription data needed, remove it on sign-out or opt-out where appropriate, and do not include sensitive data in notification payloads.
- Delivery and timing depend on the operating system and push providers.

## Platforms

- **iOS and macOS:** evaluate APNs for native remote notifications and OS APIs for local notifications. Set up signing, push entitlements, credentials, and distribution. Test native integration with Dioxus.
- **Android:** evaluate Firebase Cloud Messaging for native remote notifications and Android APIs for display. A Firebase project, app registration, permissions, and device tokens would be needed. The provider is not selected yet.
- **Windows:** evaluate Windows App SDK notifications and WNS. Azure/Entra app registration is needed; background delivery typically requires package identity. Test both required CPU architectures and the chosen packaging.
- **Linux:** use the desktop notification service for native display. Evaluate a user-controlled background process for remote events when the UI is closed. Delivery cannot be promised while no process is running. Test AppImage and Flatpak permissions and startup behavior.
- **Website/PWA:** support standards-based Web Push with HTTPS, per-device subscriptions, and notification permission. On iOS/iPadOS, the PWA must be added to the Home Screen.

## Open choices

- Which service detects events and sends notifications, and whether it needs the optional backend.
- Which notification libraries and providers to use.
- Notification retention and delivery ownership.
