# ZCode Docker — Push Notification Implementation Plan

## 1. Goal

Build a reliable server-side notification system for ZCode Docker that can notify iPhone/iPad even when the Web UI is closed or backgrounded.

The existing Desktop/Web notifications remain supported. Push is an additional delivery channel, not a replacement.

## 2. Design principles

- Backend is the authoritative source for notification events.
- UI must not be responsible for detecting completion before push can happen.
- Notification events are normalized before delivery to any channel.
- Delivery is best-effort and must never block or break an agent task.
- Duplicate delivery must be prevented with stable event IDs and device-level deduplication where practical.
- No provider lock-in in the core event model.
- Device credentials must be treated as secrets and never exposed to the browser unnecessarily.

## 3. Target architecture

```text
Agent / Session runtime
        |
        v
Authoritative task-state transition
        |
        v
Notification Event Layer
        |
        +---- Desktop native notification
        +---- Browser notification
        +---- Push delivery service
                         |
                         v
                  iPhone / iPad PWA
```

## 4. Notification events

Start with a small, explicit event taxonomy:

- `task.completed`
- `task.failed`
- `task.stopped`
- `interaction.pending`
- `task.attention_required` (only when a user action is genuinely required)

Each event should contain a stable event ID, event type, timestamp, session ID, workspace identity, human-readable title/body, and a safe deep-link target when available.

Do not expose raw transcript/tool output by default. Notification payloads should be short and privacy-conscious.

## 5. Phase 0 — Architecture audit

Before implementation, trace the real authoritative state transitions in the current Docker/runtime path and identify the exact point at which each event becomes final.

Audit targets:

- session/task lifecycle
- pending interactions
- sessions-index publication
- conversation snapshot updates
- background-task completion/error paths
- existing notification payload generation
- protocol/gateway boundaries

Deliverable: a short architecture note documenting the selected event boundaries and why they are authoritative.

## 6. Phase 1 — Shared notification event contract

Create a shared, versioned notification event contract in the existing shared package.

Requirements:

- strict runtime validation
- stable event IDs
- event version
- event timestamp
- session/workspace identity
- event-specific status metadata
- safe title/body
- optional deep-link metadata
- no provider-specific fields in the core contract

Add unit tests for parsing, validation, serialization, and backward-compatible evolution.

## 7. Phase 2 — Backend notification service

Introduce a server-side notification service that consumes authoritative lifecycle events.

Responsibilities:

- normalize runtime transitions into notification events
- deduplicate repeated state transitions
- fan out events to registered delivery channels
- isolate delivery failures from task execution
- provide structured logs/metrics
- support replay-safe startup behavior

The service must not depend on an active browser renderer.

## 8. Phase 3 — Push transport

Use standards-based Web Push for the first mobile implementation so iPhone/iPad can use a PWA without requiring a native iOS application.

Implement:

- VAPID key configuration
- subscription registration
- subscription replacement/update
- subscription revocation
- delivery
- expired/invalid subscription cleanup
- bounded retry behavior
- payload size limits
- encryption handled by the Web Push implementation

Provider-specific transport code stays behind a small interface so another relay/provider can be added later.

## 9. Phase 4 — Device pairing and security

Add an authenticated device-registration flow.

Recommended flow:

1. User opens ZCode Web UI on iPhone/iPad.
2. User signs in through the existing authenticated gateway.
3. PWA requests notification permission.
4. Browser creates a Web Push subscription.
5. Subscription is registered against the authenticated account/device.
6. Server returns a device identifier and registration status.
7. User can rename, disable, revoke, or re-register a device.

Security requirements:

- never accept an arbitrary subscription without authentication/authorization
- scope subscriptions to the correct account/workspace boundary
- protect VAPID private key
- avoid storing unnecessary personal data
- revoke devices explicitly
- do not put secrets in notification payloads

## 10. Phase 5 — Mobile notification UX

Implement the iPhone/iPad PWA notification experience.

Requirements:

- notification permission onboarding
- clear enabled/disabled state
- test-notification action
- notification click opens the relevant session/workspace
- graceful handling when the session no longer exists
- multiple-device support
- no duplicate UI notification when the app is already focused, where appropriate

The existing in-app notification preferences should remain coherent with the new push preference.

## 11. Phase 6 — Reliability and edge cases

Test the cases that matter for a long-running remote agent:

- browser open and focused
- browser open but backgrounded
- browser closed
- iPhone locked
- iPad locked
- Tailscale/network temporarily unavailable
- server restart during an active task
- task completes while no client is connected
- duplicate lifecycle events
- rapid completion/failure transitions
- expired push subscription
- multiple registered devices
- user revokes notification permission
- push delivery failure
- malformed event payload

Push delivery must never make task execution fail.

## 12. Phase 7 — Observability and maintenance

Add structured diagnostics for:

- event created
- event suppressed/deduplicated
- delivery attempted
- delivery succeeded
- delivery failed
- subscription expired/revoked

Provide a safe diagnostic command or admin endpoint for testing push configuration without exposing subscription secrets.

## 13. Testing strategy

Every phase gets automated tests where practical.

Required end-to-end test matrix:

| Scenario | Expected result |
|---|---|
| Task completes with Web UI open | Existing Web notification still works |
| Task completes with Web UI closed | Push notification arrives |
| Task fails with Web UI closed | Failure push arrives |
| Interaction becomes pending | Attention push arrives |
| Duplicate event emitted | User receives one logical notification |
| Device revoked | No further push is delivered |
| Expired subscription | Subscription is removed/disabled safely |
| Two devices registered | Both receive the event |
| Server restart | No task corruption; notification behavior remains deterministic |
| Push service unavailable | Agent task continues normally |

## 14. Rollout order

Implement in this order:

1. Architecture audit
2. Shared event contract
3. Backend notification service
4. Preserve/adapt existing Desktop/Web channels
5. Web Push transport
6. Device pairing/security
7. iPhone/iPad PWA UX
8. End-to-end reliability tests
9. Documentation and operational diagnostics

Do not start by adding browser push code to the current React hook. That would preserve the current architectural limitation where a closed renderer cannot observe task completion.

## 15. Definition of done

The feature is complete when:

- ZCode Docker can create authoritative notification events without a connected browser.
- Existing Desktop/Web notifications continue to work.
- An authenticated iPhone/iPad PWA can register a push subscription.
- A completed/failed/pending task can generate a push while the Web UI is closed.
- Device registration and revocation are secure and testable.
- Duplicate notifications are controlled.
- Push failures cannot break agent execution.
- Restart/network/expired-subscription cases are covered by tests.
- Documentation explains setup, security, troubleshooting, and recovery.


# Complete Implementation Addendum

Treat this as a production-quality feature, not a browser-push prototype.

## Architecture requirements

- Backend/runtime is the authoritative producer of notification events.
- React renderer is never required for task completion detection.
- Notification delivery is asynchronous and isolated from agent execution.
- Every logical event has a stable event ID for idempotency.
- Core event contract remains provider-independent.
- Existing Desktop/Web notification behavior remains functional.
- Push is optional; installations without VAPID configuration continue to work.
- A notification-channel failure never fails an agent task.

## Authoritative event audit

Before coding push, trace the actual runtime paths for task/session creation, running state, successful completion, failure, stopped/cancelled state, pending interaction creation/resolution, sessions-index publication, conversation snapshot publication, background-task completion/error, and gateway/RPC boundaries.

Create docs/PUSH_NOTIFICATION_ARCHITECTURE.md documenting the authoritative producer for every event and why it is authoritative.

## Shared event contract

Create a versioned shared notification event contract containing event ID, event version, event type, timestamp, workspace identity, session ID, safe title/body, severity, optional validated deep-link information, and limited non-sensitive metadata.

Initial event types:
- task.completed
- task.failed
- task.stopped
- interaction.pending
- task.attention_required

Add runtime validation, serialization tests, invalid-event tests, version handling, and size-limit tests.

## Backend notification service

Create a server-side notification service that accepts authoritative events, deduplicates logical transitions, evaluates preferences, fans out to independent delivery channels, records structured diagnostics, survives client disconnects, and never blocks the agent execution path.

Use a channel abstraction so Desktop/Web and Web Push do not become coupled.

## Web Push

Use standards-based Web Push with VAPID. Server configuration must cover push enabled/disabled, VAPID subject, public key, private key, delivery timeout, retry policy, and payload size limit.

Keep transport-specific code behind an internal interface. Classify successful delivery, transient failure, invalid/expired subscription, authorization/configuration failure, payload-too-large, timeout, and unknown failure. Automatically disable/remove invalid subscriptions.

## PWA and service worker

The mobile Web UI uses a service worker for push reception. It receives and validates payloads, displays notifications, preserves only safe metadata, handles notification clicks, opens/focuses the correct route, and rejects arbitrary external navigation.

Deep links must be validated against the expected application origin and route format.

## Device registration and security

Use an authenticated registration flow: user opens Web UI on iPhone/iPad, authenticates through the existing gateway, grants notification permission, browser creates PushSubscription, authenticated API registers/updates it, and server returns only a non-secret device identifier/status.

Support multiple devices from the first production version. Device management must support register, update, rename, enable/disable, revoke, re-register, and test notification.

Store only required subscription/account metadata. Never expose stored subscription credentials through ordinary API responses. Protect registration and test endpoints with authentication, authorization, and rate limits.

## Privacy

Push payloads must be concise and privacy-conscious. Never include API keys, access tokens, session secrets, full transcripts, or unnecessary tool output. Prefer short title/body and a safe deep-link reference.

## Preferences

Keep existing notification preferences working. Add push-specific controls without silently changing existing settings. Support master notifications, push notifications, sound, task completion, task failure, task stopped, and interaction-required notifications.

## Reliability

Define deterministic behavior for server restart, active task across restart, task completion with no connected browser, push outage, expired subscription, offline iPhone/iPad, network/Tailscale interruption, duplicate runtime events, and reconnect replay.

Do not replay all historical completed tasks after restart. Only new authoritative transitions should normally generate notifications.

## Observability

Add structured diagnostics for event creation, deduplication, channel selection, delivery start/success/failure, and subscription creation/update/revocation/expiration.

Never log VAPID private keys, access tokens, subscription secrets, or full sensitive payloads. Provide a safe test-notification/diagnostic path.

## Testing

Unit tests: event validation, IDs, serialization, deduplication, preferences, deep-link validation, payload limits, channel isolation.

Integration tests: backend event to notification service, registration, delivery, revoke, expired-subscription cleanup, multi-device fan-out, restart behavior.

E2E scenarios:

| Scenario | Expected result |
|---|---|
| Task completes with Web UI open | Existing notification works |
| Task completes with Web UI closed | Push arrives |
| Task fails with Web UI closed | Failure push arrives |
| Interaction becomes pending | Attention push arrives |
| iPhone locked | Push is delivered when platform permits |
| iPad locked | Push is delivered when platform permits |
| Two devices registered | Both receive the event |
| One device revoked | Other device still receives it |
| Duplicate event | One logical notification |
| Expired subscription | Subscription is cleaned up |
| Server restart | No notification storm |
| Push service failure | Agent task continues |
| Permission revoked | Registration recovers gracefully |
| Malformed event | Safely rejected |
| Oversized payload | Safely limited/rejected |

## Documentation

Create/update:
- docs/PUSH_NOTIFICATION_ARCHITECTURE.md
- docs/PUSH_NOTIFICATION_SETUP.md
- docs/PUSH_NOTIFICATION_SECURITY.md
- docs/PUSH_NOTIFICATION_TROUBLESHOOTING.md
- README with a short overview and links

Document VAPID setup, device registration, revocation, testing, failure recovery, security, and operational diagnostics.

## Rollout order

1. Architecture audit
2. Shared event contract
3. Backend notification service
4. Existing Desktop/Web channel integration
5. Web Push transport
6. Service worker
7. Authenticated device pairing
8. Security hardening
9. Preferences
10. Reliability testing
11. iPhone/iPad E2E testing
12. Documentation
13. Cleanup and final build

A deployment with push disabled must remain fully functional.

## Final cleanup and Definition of Done

Remove temporary/debug code, consolidate duplicate notification helpers, update architecture documentation and README, update AGENTS guidance if conventions change, run formatter/linter/typecheck, run unit/integration tests, run production build, inspect final diff, and verify no secrets are committed.

The feature is complete only when the backend can create authoritative events without a renderer, existing Desktop/Web notifications still work, iPhone/iPad can securely register Web Push, push works with Web UI closed, multiple devices and revocation work, duplicates are controlled, expired subscriptions are cleaned up, push failures cannot break tasks, restart behavior is deterministic, automated tests pass, and setup/security/troubleshooting documentation is complete.


# Implementation Progress — 2026-10-01

## Completed in the first implementation pass

- Phase 0 architecture audit documented in docs/PUSH_NOTIFICATION_ARCHITECTURE.md.
- Shared versioned notification event contract added at packages/shared/src/notification-events.ts.
- Deterministic logical event IDs added and covered by automated tests.
- Authoritative terminal transitions now carry a stable transition identity and safe session title.
- Server-side pending-interaction transition is now exposed by the task-index syncer without replaying initial/recovery state.
- Backend notification event service now converts terminal and pending-interaction transitions into normalized events.
- Web Push server transport added using VAPID and standards-based Web Push.
- Persistent device subscription store added with atomic writes and cleanup of expired 404/410 endpoints.
- Authenticated device registration/list/revoke/test HTTP endpoints added.
- Web Push service worker, PWA manifest, registration, and settings controls added to the Web UI.
- iPhone/iPad Home Screen onboarding guidance added.
- Setup, security, and troubleshooting documentation added.
- Shared/services/server/web/ui TypeScript checks pass for the current implementation slices.

## Remaining production work

- Add server-side notification preference model and event-type filtering.
- Add regression coverage around the authoritative completedInterrupted -> task.stopped notification mapping; do not infer stop from renderer disappearance.
- Add safe session deep-link routing once the Web UI route contract is confirmed.
- Add device rename/workspace-target management UI if required by the final multi-device UX.
- Add automated integration tests for HTTP registration, persistence, event fan-out, expiry cleanup, and push-disabled mode.
- Add full iPhone/iPad E2E verification with the Web UI closed/locked.
- Run production build, lint, final diff review, and secret scan before commit/push.

## Current completion status

The planned production implementation is now in the repository. The remaining work is validation/acceptance rather than building a second push architecture.

Completed:
- Shared versioned notification event contract.
- Authoritative task terminal transition integration.
- Pending interaction notification integration.
- Server-side Web Push/VAPID transport.
- Authenticated persistent device subscriptions with revoke/test operations.
- Service worker/PWA support for iPhone/iPad.
- Push settings UI and actionable errors.
- Persistent HTTPS server authentication cookie.
- Delivery diagnostics and expired-subscription cleanup.
- Automated typecheck and focused notification/subscription tests.

Current acceptance focus:
1. Verify the iPhone/iPad receives a standalone Test Push.
2. Verify real completed/failed/stopped/interaction events while the Web UI is backgrounded or closed.
3. Verify no duplicate/replayed notifications after reload or Docker restart.
4. Review server diagnostics if a provider rejects a delivery.