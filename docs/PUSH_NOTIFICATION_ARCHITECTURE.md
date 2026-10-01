# ZCode Docker — Push Notification Architecture Audit

## Status

Phase 0 architecture audit completed. This document records the current notification implementation, the authoritative state boundaries found in the repository, and the boundary selected for the production push-notification implementation.

## 1. Executive conclusion

The repository already has a useful server-side observation point: packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts consumes the v4 sessions-index projection and detects terminal phase transitions. It exposes onSessionTerminalEvent, with turn.completed / turn.failed, and a separate prompt-ready event.

This is a better foundation for push notifications than making the React renderer the source of truth. The production implementation should add a notification-event layer beside this existing service boundary rather than teaching useTaskNotifications.ts to perform push delivery.

For pending interaction notifications, the authoritative data is also server/runtime state projected into the v4 session summary. apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/sessions-index-projection.ts derives the lightweight pendingInteraction summary from the session snapshot. The renderer currently observes conversation snapshots and creates display notifications, but push should consume the server-side projection/state transition instead.

## 2. Current notification architecture

```text
ZCode runtime / session state
        |
        v
v4 session projection / sessions-index
        |
        +--> services zcodeTaskIndexSyncer
        |       |
        |       +--> task index / workspace events
        |       +--> terminal event emitter
        |       +--> prompt-ready event emitter
        |
        +--> renderer sessions-index store
                |
                v
        useTaskNotifications.ts
                |
                v
        TaskNotificationPayload
          |             |
          v             v
   Desktop native   Browser Notification
                    + local sound
```

The important architectural limitation is that the current renderer hook is an observer. It cannot guarantee notification delivery when the Web UI is closed, suspended, or not connected.

## 3. Existing renderer notification path

useWorkspaceTerminalTaskNotifications() acquires the shared sessions-index store and compares the current SessionSummary map against the previous renderer-observed map.

Important behavior:
- first live snapshot is used as a baseline;
- historical terminal sessions are therefore not replayed as new notifications;
- later terminal transitions are converted by collectTerminalTaskNotificationPayloads();
- rpcReady prevents querying an unavailable remote proxy;
- the platform adapter receives the final localized TaskNotificationPayload.

usePendingInteractionTaskNotifications() watches ConversationSnapshot.pendingInteractions. Its first snapshot is a baseline, and subsequent new interactionId values generate notifications. A seenRequestIds set prevents repeated pending snapshots from repeatedly notifying the user.

This is correct for a renderer-local notification UX, but it is not suitable as the authoritative producer for mobile push.

## 4. Existing desktop delivery

packages/desktop/src/main/desktopNotifications.ts is already a native delivery channel.

It currently validates TaskNotificationPayload, rejects unsupported platforms, suppresses notifications while an app window is focused, deduplicates recent task notifications, uses requestId for permission/elicitation dedupe, retains Electron Notification objects until click/close, restores/focuses the originating window after a click, and sends the task-notification sound signal back to the renderer.

This behavior should remain intact. The push implementation must not replace or regress it.

## 5. Existing Web delivery

packages/web/src/main.tsx provides the Web platform adapter. The current browser channel is renderer dependent and checks page focus and notification permission before using the browser Notification API.

Browser notification is not Web Push. An open/background-capable renderer can show local notifications, but a closed Web UI cannot be relied upon to observe task completion. A service worker plus server-side push subscription is required for iPhone/iPad background delivery.

## 6. Authoritative terminal state boundary

The strongest existing boundary is packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts.

The file defines ZCodeTaskIndexTerminalEvent and exposes onSessionTerminalEvent. The v4 terminal mapping is explicit:
- completedSuccess -> turn.completed with product outcome completed
- completedInterrupted -> turn.completed at the command-settlement boundary, with product outcome stopped for notification semantics
- error -> turn.failed with product outcome failed

The distinction is intentional: the existing service adapter keeps the historical turn.completed/turn.failed contract, while the notification layer uses terminalOutcome to preserve cancellation/stop meaning.

The function emitTerminalAndReady() emits the terminal event before the prompt-ready event. This ordering is intentional: terminal closure settles the current input, while ready means the agent server can accept the next input.

This event is already consumed by zcodeTaskServiceAdapter.ts to settle runtime commands. That makes it an established service-layer boundary rather than a UI convention.

### Selected boundary for push

The new notification event layer should subscribe to the same authoritative terminal transition boundary, or be invoked directly from the same service-layer transition function if dependency ownership makes that cleaner.

Do not derive push from useWorkspaceTerminalTaskNotifications().## 7. Authoritative pending-interaction boundary

The v4 sessions-index projection contains a lightweight pendingInteraction derived from the session snapshot.

apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/sessions-index-projection.ts projects the interaction information needed by clients, including interaction kind and safe tool-name metadata where available.

The services task-index syncer copies this projection into its task metadata and compares previous and next summaries during ingestion.

This gives us a server-side transition boundary suitable for push:

```text
Session snapshot / runtime interaction state
        |
        v
v4 sessions-index projection
        |
        v
services task-index syncer
        |
        +--> pending interaction transition
        |
        v
notification event layer
```

The notification layer must only emit interaction.pending when the pending interaction becomes newly active. A recovery snapshot must establish state without replaying every historical pending interaction.

## 8. Existing background-task notification mechanism

packages/shared/src/background-task-notifications.ts and apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts implement a different concept: background-task results are represented as runtime/tool metadata and queued into the runtime command system.

This mechanism is not itself a mobile notification transport.

It is still relevant because background task completion can influence the session/task lifecycle. The push system should observe the authoritative task transition rather than parse task-notification messages from transcript content.

That prevents notification semantics from becoming coupled to model-visible synthetic messages.

## 9. Event taxonomy for production push

The implementation plan defines these normalized events:
- task.completed
- task.failed
- task.stopped
- interaction.pending
- task.attention_required

The repository audit confirms that task.completed and task.failed have an established service-layer transition boundary.

task.stopped is now derived only from the authoritative completedInterrupted terminal phase. The repository audit found that the protocol projection maps cancelled terminal results to completedInterrupted; renderer teardown/disappearance is never used as a stop signal.

interaction.pending has a server-side projection boundary and is implemented from a real pending-interaction transition.

task.attention_required should remain a derived product event, not a catch-all alias for every status change. It should only be emitted when a user action is genuinely required.

## 10. Event identity and deduplication

The current desktop channel uses a short time-window dedupe key based on task/status/request identity. That is useful locally but is not sufficient for a distributed push system.

The production notification layer needs a stable logical event identity independent of renderer lifetime.

Recommended identity inputs:
- workspace identity
- session/task identity
- transition identity or monotonic state boundary
- event type
- interaction ID when the event is interaction-specific

The same logical event ID must be shared by Desktop/Web/Push delivery paths. Each channel must not generate its own random identity.

## 11. Restart semantics

The existing sessions-index design distinguishes initial snapshots from live/recovery transitions. The renderer also intentionally treats its first live snapshot as a baseline.

The push service should preserve the same semantic rule: initial/recovery state establishes current truth; only a newly observed authoritative transition creates a new notification event.

A Docker restart must therefore not generate a storm of notifications for every terminal session already present in the task index.

If durable notification event storage is later required for stronger at-least-once delivery guarantees, it should be added explicitly rather than pretending the current in-memory emitters are durable.

## 12. Proposed production architecture

```text
                    ZCode runtime / session state
                              |
                              v
                 v4 authoritative projection
                              |
                              v
                services task-state transition
                              |
                    Notification Event Layer
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
       Desktop channel   Web local channel   Push channel
                                                |
                                                v
                                     Web Push / VAPID
                                                |
                                                v
                                     Service Worker/PWA
                                                |
                                                v
                                        iPhone / iPad
```

The notification event layer should own event normalization, stable IDs, filtering/preferences, and fan-out. Individual transports should only deliver an already validated event.
## 13. Separation of responsibilities

### Runtime/services

Own authoritative lifecycle transitions, notification event creation, event IDs and dedupe semantics, push subscription registration authorization, push delivery scheduling, and delivery diagnostics.

### Renderer

Own local UI notification presentation, permission onboarding, PWA/service-worker registration, device-management UI, and opening a safe deep link after a push click.

The renderer must not be required for task completion detection.

### Service worker

Own receiving Web Push, validating the received envelope, displaying the OS notification, handling notification clicks, and opening/focusing the application route.

It must not receive secrets or arbitrary external navigation targets.

## 14. Security boundary

Push subscription information is credential-like data and must be stored server-side with account/device ownership information.

The VAPID private key must remain server-side and must never be shipped to the browser.

Push payloads must not contain API keys, OAuth/access tokens, session secrets, full conversation transcripts, arbitrary tool output, or unnecessary filesystem paths.

A notification should contain a short safe title/body plus a validated application-relative destination or session reference.

## 15. Current gaps confirmed by audit

1. No server-side normalized push notification event layer exists yet.
2. No Web Push/VAPID transport exists yet.
3. No durable authenticated device/subscription registry exists yet.
4. No service-worker push reception/click path is established as the production mobile channel.
5. Existing renderer notification hooks remain the only place where sessions-index facts are translated into display notification commands for Web/desktop-facing UI.
6. Existing desktop dedupe is local/time-window based and cannot serve as distributed push idempotency.

## 16. Implementation decision

Phase 1 should build on the existing services boundary instead of introducing a second task-state observer.

Preferred sequence:
1. Define the shared normalized notification event contract.
2. Add a backend notification service to the services layer.
3. Subscribe it to the existing terminal transition event and server-side pending-interaction transition.
4. Add an explicit stop/cancel authoritative transition audit before emitting task.stopped.
5. Keep current renderer notifications working as a local presentation channel.
6. Add Web Push/VAPID and authenticated device registration.
7. Add service-worker reception/click handling.
8. Add multi-device/revocation/retry/expired-subscription cleanup.
9. Add end-to-end tests with the Web UI closed.

## 17. Phase 0 exit criteria

Phase 0 is considered complete when:
- terminal completion/failure has a documented authoritative service boundary;
- pending interaction has a documented server-side state boundary;
- stopped/cancelled has an identified authoritative transition or an explicit implementation gap;
- renderer hooks are documented as observers, not sources of truth;
- background-task synthetic messages are documented as non-authoritative for push;
- restart/baseline semantics are documented;
- the push architecture has a clear insertion point without duplicating task-state observation.

### Audit result

All Phase 0 event-boundary criteria are now satisfied: terminal completion/failure, cancellation/stop, and pending interaction each have a documented server/runtime boundary. The implementation intentionally keeps the command-settlement contract unchanged while adding product-level terminalOutcome semantics for notifications.

## 18. File-level source map

| Concern | Current source | Role |
|---|---|---|
| Renderer terminal notifications | packages/ui/src/hooks/useTaskNotifications.ts | Local observer/presentation orchestration |
| Renderer notification preferences | packages/ui/src/lib/taskNotificationPreferences.ts | Local persisted preferences |
| Renderer notification sound | packages/ui/src/lib/taskNotificationSound.ts | Local audio presentation |
| Desktop native delivery | packages/desktop/src/main/desktopNotifications.ts | Electron OS notification channel |
| Web platform adapter | packages/web/src/main.tsx | Browser platform integration |
| v4 session projection | apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/sessions-index-projection.ts | Runtime/session state projection |
| Server task index ingestion | packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts | Authoritative service-side transition observation |
| Runtime command settlement | packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts | Consumes terminal/ready service events |
| Background task result metadata | packages/shared/src/background-task-notifications.ts | Internal runtime/tool metadata, not push |
| Background task runtime queue | apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts | Internal runtime command/ledger mechanism |
## 19. Important implementation constraint

Do not add Web Push directly to useTaskNotifications.ts as the production solution.

That would create a system where push reliability depends on the browser maintaining a renderer subscription to sessions-index. It would fail the primary requirement: notifying an iPhone/iPad when the Web UI is closed.

Instead, the existing hook should eventually consume the same normalized event semantics for local presentation where appropriate, while the server-side notification service owns the push channel.

## 20. Next implementation step

Proceed to Phase 1 of PUSH_NOTIFICATION_IMPLEMENTATION_PLAN.md:
- locate the existing shared schema conventions;
- define the versioned normalized notification event contract;
- add runtime validation and serialization tests;
- define stable event-ID construction;
- wire the first backend event producer from the already identified terminal transition boundary;
- continue the targeted audit for an authoritative stopped/cancelled transition before adding task.stopped.

## 21. Current implementation status (2026-10-01)

The Phase 1-5 implementation described by this audit is now present in the repository. The earlier "Current gaps" section is retained as the original Phase 0 audit record; it is superseded by the implementation below.

Implemented components:
- packages/shared/src/notification-events.ts: versioned normalized event contract and deterministic event IDs.
- packages/services/src/notifications/notificationEventService.ts: backend event normalization/fan-out and best-effort delivery orchestration.
- packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts: authoritative terminal transition producer.
- packages/server/src/push/: VAPID/Web Push transport, subscription persistence, registration/list/revoke/test APIs, retry and expired-subscription cleanup.
- packages/ui/src/lib/webPushNotifications.ts: browser/PWA registration and subscription management.
- packages/web/public/sw.js: service-worker push reception and notification presentation.
- packages/web/public/manifest.webmanifest: installable PWA metadata.

Supported normalized events are 	ask.completed, 	ask.failed, 	ask.stopped, interaction.pending, and 	ask.attention_required.

Push remains optional and best-effort. A push failure must not fail or alter the underlying agent task. Desktop/browser local notifications remain separate presentation channels.

For iPhone/iPad, push registration requires HTTPS and the Home Screen web app. The VAPID public key used by the server must remain unchanged for existing subscriptions; after intentionally rotating the VAPID key, existing subscriptions must be re-created.