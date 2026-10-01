# Push Notification Terminal Lifecycle — Test Plan

## Scope
Ensure a task started after the notification observer is dormant still emits a terminal notification when the first live task-index observation is already terminal.

| Step/Test Case | Type (UI/API/WS) | Expected Result | Agent Verification | User Verification | Status |
|---|---|---|---|---|---|
| Mark session active before sendPrompt | API | Session is tracked as an active notification candidate | Code path verified | ⏳ | ⏳ |
| First observed state is terminal | WS | Terminal transition is emitted even when previous summary is undefined | Code path verified | ⏳ | ⏳ |
| Historical terminal session is not notified | WS | Initial snapshot alone does not emit a notification | Code path verified | ⏳ | ⏳ |
| Active session terminal state is removed from tracking | API | Session cannot emit duplicate first-observation notification | Code path verified | ⏳ | ⏳ |
| Web Push receives terminal event | API | `notification.delivery.started` is logged and delivery begins | Instrumentation added | ⏳ | ⏳ |
| Direct push test button targets this device | UI/API | Test button sends a push directly to the registered device without running a task | Code path verified | ⏳ | ⏳ |
| iPhone receives direct push test | UI | Push notification appears immediately after pressing Push Test | Server confirmed `notification.push_test.succeeded` + `sw_diagnostic stage=notification_shown` | ✅ 2026-10-01 | ✅ 2026-10-01 |
| iPhone receives task completion push | UI | Push notification appears after task completion | Delivery path instrumented (`notification.delivery.started`) | ⏳ | ⏳ |

## Verification
- Docker image rebuilt successfully after the fix.
- `zcode-web` was recreated and is running the new image.
- Container health is `healthy`.
- Push subscription remains registered in `/data/.zcode/push-subscriptions.json`.
- Final mobile E2E remains the required user verification step.