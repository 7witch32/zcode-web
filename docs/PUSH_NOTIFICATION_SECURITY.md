# ZCode Docker — Push Notification Security

## Security model
Push delivery is an additional notification channel. Agent execution never waits for push delivery and never fails because a push request fails.

The server is the authoritative producer of notification events. The renderer is not trusted as the source of task completion state.

## Secrets
Protect:
- ZCODE_PUSH_VAPID_PRIVATE_KEY
- stored PushSubscription endpoint and encryption keys
- the server authentication token

Never expose the VAPID private key to browser JavaScript.

Do not put API keys, OAuth tokens, session secrets, full transcripts, or raw tool output into push payloads.

## Authentication
Push device endpoints are under the server HTTP authentication layer. Push registration is disabled when server authentication is not configured.

The device list endpoint returns only non-secret metadata. Subscription endpoint URLs and encryption keys are never returned by the device-management API.

## Payload safety
The server caps push payloads below the common Web Push payload-size boundary and sends only event identity, event type, short title/body, severity, and optional application-relative deep-link data.

The service worker validates the payload again before displaying it. External URLs and protocol-relative URLs are rejected as notification destinations.

## Subscription lifecycle
HTTP 404/410 delivery responses remove the invalid subscription. Other failures are recorded without affecting the agent task.

Device revocation removes the server-side record and unsubscribes the browser PushSubscription.

## File storage
Subscription records use atomic replacement and attempt mode 0600 on platforms with POSIX permissions. For stronger at-rest protection in a multi-user deployment, move the store to an encrypted database or protected secret store.

## Network security
Production Web Push requires a secure origin. Keep the ZCode gateway behind HTTPS and avoid exposing push registration to an untrusted network.

If outbound network policy is restrictive, permit the browser push services required by registered devices.

## Privacy
Notification text is deliberately short. A notification may appear on a locked phone, so it must not reveal sensitive prompts, credentials, source code, or tool results.
## 7. Current security controls

The implementation keeps VAPID private material server-side, authenticates device registration through the existing server authentication boundary, persists subscriptions on the backend, and supports device revocation. Push payloads are intentionally lightweight and must not contain secrets, full transcripts, API keys, access tokens, or arbitrary tool output.

The browser receives only the VAPID public key needed by PushManager.subscribe(). The service worker displays validated application notifications and should not treat notification payloads as arbitrary navigation instructions.

Delivery is best-effort: notification transport errors are isolated from agent execution. Expired/invalid subscriptions are removed when the push service reports them as no longer valid, and transient provider failures are retried according to the server transport policy.

When rotating VAPID credentials, treat the rotation as a subscription migration: deploy the new key pair, remove/re-register affected browser subscriptions, and verify delivery on every target device.