# ZCode Docker — Push Notification Troubleshooting

## Push settings show unsupported
Check HTTPS, Service Worker, PushManager, and Notification support. On iPhone/iPad, verify that ZCode was added to the Home Screen and launched from that icon.

## Enable push fails with server configuration error
Verify ZCODE_PUSH_ENABLED=true and all three VAPID variables are set. Verify server authentication is enabled. Restart after changing environment variables.

## Permission prompt does not appear on iPhone/iPad
The permission request must happen from a direct user gesture. Use the Enable push button in Settings. On iOS/iPadOS, verify that ZCode is running as a Home Screen web app rather than an ordinary Safari tab.

If permission was previously denied, change notification permission for the ZCode Home Screen web app in system Settings and retry.

## Test push fails
Check the device list. If no device is registered, enable push again. If a device exists but delivery fails, inspect the server status code, verify VAPID keys, verify outbound access to the browser push service, and re-register if the subscription expired.

## Task notifications work in Web UI but not on the phone
The renderer notification path and Web Push are separate channels. A renderer notification proves only that sessions-index observation works.

Check that:
1. the phone has a registered push device;
2. Test push works;
3. the task produces an authoritative server-side terminal or pending-interaction transition;
4. the Docker process remains running until the task completes;
5. notification permission is enabled for the Home Screen web app.

## Notifications repeat after restart
The producer uses transition-based event identities and sessions-index baseline semantics. Restart should not replay historical terminal sessions. Inspect eventId values if duplicates appear.

## iPhone/iPad receives no notification while locked
Check Home Screen web app notification permission and Focus settings. The operating system may suppress or summarize notifications according to user settings.

## References
Apple: Sending web push notifications in web apps and browsers — https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
WebKit: Web Push for Web Apps on iOS and iPadOS — https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
## Current troubleshooting notes

### Push test request accepted by the server but no notification appears

This means the UI request reached the backend and the test send did not report a transport exception. It does not independently prove that iOS displayed the notification.

Check, in order:
1. The iPhone/iPad has the ZCode Home Screen app installed from the current HTTPS URL.
2. Notifications are allowed for ZCode in iOS Settings.
3. The Home Screen app was launched at least once after installation.
4. The device has network access and is not in a state that suppresses notifications.
5. The server logs show the test delivery and no provider error.
6. The service worker is registered and is the current version — see the stale service worker section below.
7. Press Test push again and check the device's last report in Settings → Push notifications, or the `notification.sw_diagnostic` server log.

### Stale service worker on the device (root cause found 2026-10-01)

The server used to serve `/sw.js` with `Cache-Control: public, max-age=31536000, immutable`. On iOS the Home Screen app may answer service worker update checks from the HTTP cache for up to a year, so the device keeps running an old `sw.js` that silently ignores pushes even after a new one is deployed. Three layers now prevent this:

1. the static handler serves `sw.js` and `*.webmanifest` with `Cache-Control: no-cache`;
2. the web app registers the worker with `updateViaCache: "none"`;
3. the worker reports every push back to the server (see below).

Recovery for a device that already cached the old worker: remove the Home Screen app, open the site again over HTTPS, add it to the Home Screen once more, then re-enable push.

### Verifying device-side delivery (service worker diagnostic reports)

The service worker reports each push lifecycle step back to the server via `POST /api/push/diagnostic` with a `stage` of:

- `push_received` — the device's service worker received the push event;
- `payload_invalid` — the push arrived but the payload could not be parsed/validated;
- `notification_shown` — `showNotification()` resolved successfully;
- `show_failed` — `showNotification()` threw an error.

Reports are stored per device and surfaced in Settings → Push notifications ("last report") and in server logs as `notification.sw_diagnostic`. If a test send succeeds on the server but no report arrives, the device never ran the current service worker — treat it as a stale worker / iOS delivery problem, not a server problem.

### Received unexpected response code while subscribing

On iPhone/iPad, first confirm that ZCode is running as the Home Screen web app over HTTPS. If the server VAPID public key changed after the app was installed, remove the old Home Screen app and add it again before retrying. The browser subscription is bound to the VAPID application server key used during subscription creation.

### Test succeeds but background task notification does not appear

Run a real task through each expected terminal transition: completed, failed, and stopped. Then test an interaction that genuinely requires user input. The push layer only emits normalized events at authoritative state transitions; ordinary streaming/tool activity is not a push event.