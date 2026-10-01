# ZCode Docker — Push Notification Setup

## Overview
ZCode Docker uses standards-based Web Push with VAPID. The server owns the VAPID private key and registered device subscriptions.

## Requirements
- HTTPS in production (localhost is suitable for local development).
- Server authentication enabled; push registration is rejected without it.
- iPhone/iPad users add ZCode to the Home Screen and launch the Home Screen web app before enabling notifications.
- Allow outbound access to the browser push service when network policy restricts outbound traffic.

## 1. Generate VAPID keys
Run once on the server environment:
corepack pnpm --filter @zcode/server exec web-push generateVAPIDKeys --json

Store the generated pair securely. Never commit the private key.

## 2. Configure the server
Required:
- ZCODE_PUSH_ENABLED=true
- ZCODE_PUSH_VAPID_PUBLIC_KEY=<VAPID public key>
- ZCODE_PUSH_VAPID_PRIVATE_KEY=<VAPID private key>
- ZCODE_PUSH_VAPID_SUBJECT=mailto:admin@example.invalid

Optional:
- ZCODE_PUSH_TTL_SECONDS=300
- ZCODE_PUSH_TIMEOUT_MS=10000
- ZCODE_PUSH_SUBSCRIPTIONS_PATH=<persistent path>

The default subscription file is .zcode/push-subscriptions.json under the server working directory. In Docker, mount the containing directory to persistent storage.

## 3. Enable push on iPhone/iPad
1. Open the authenticated ZCode Web UI in Safari.
2. Add ZCode to the Home Screen.
3. Launch ZCode from the Home Screen icon.
4. Open Settings → General.
5. In Push notifications, tap Enable push.
6. Accept the system notification permission prompt.
7. Tap Test push.

The permission request is intentionally tied to the Enable push button rather than application startup.

## 4. Multiple devices
Each browser installation registers an independent device record. Registering the same endpoint updates the existing device record. Revoking a device removes its stored subscription and unsubscribes the browser-side PushSubscription.

## 5. Docker persistence
Do not store push subscriptions only inside the container filesystem. Set ZCODE_PUSH_SUBSCRIPTIONS_PATH to a mounted persistent location.

## 6. Push-disabled operation
If push is disabled or VAPID configuration is incomplete, ZCode continues to operate normally and existing Desktop/Web notification channels remain available.

## 7. Operational test
Use Settings → General → Push notifications → Test push. The test path does not depend on an agent task.
## 5. Current production configuration

For the Docker deployment, configure these server-side variables:

- ZCODE_PUSH_ENABLED=true
- ZCODE_PUSH_VAPID_PUBLIC_KEY=<public key>
- ZCODE_PUSH_VAPID_PRIVATE_KEY=<private key>
- ZCODE_PUSH_VAPID_SUBJECT=<HTTPS server URL or mailto: subject>
- ZCODE_PUSH_SUBSCRIPTIONS_PATH=/data/.zcode/push-subscriptions.json

The private key and server authentication token are secrets and must never be committed or exposed to the browser.

## 6. iPhone/iPad setup

1. Open the ZCode HTTPS URL in Safari.
2. Use **Share -> Add to Home Screen**.
3. Launch ZCode from the Home Screen icon.
4. Authenticate with the server token when requested.
5. Open Settings and enable Push Notifications.
6. Allow notifications when iOS asks.

If push subscription creation reports an unexpected response code, remove the existing Home Screen installation, add it again from the current HTTPS URL, and retry. This is particularly important after a VAPID key rotation.

## 7. Persistence

The authentication cookie is persistent for one year on HTTPS. Push subscriptions are stored in the configured server-side JSON path and survive normal container restarts when /data is persisted.

## 8. Test button semantics

The Settings **Test Push** action confirms that the server accepted the test-send request. It is not, by itself, proof that iOS displayed the notification. For end-to-end verification, test with the Home Screen app closed/backgrounded and check Notification Center.