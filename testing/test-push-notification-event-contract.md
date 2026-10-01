# Push Notification Event Contract — Test Plan

## Scope
Phase 1 shared notification event contract, authoritative event projection, and persistent subscription storage.

| Step/Test Case | Type (UI/API/WS) | Expected Result | Agent Verification | User Verification | Status |
|---|---|---|---|---|---|
| Deterministic event ID for identical identity | API | Same logical input produces same event ID | Automated test passed | ⏳ | ✅ |
| Different transition produces different event ID | API | Different transition identity does not collide | Automated test passed | ⏳ | ✅ |
| Valid event parses successfully | API | Versioned event passes runtime schema validation | Automated test passed | ⏳ | ✅ |
| External deep link is rejected | API | Only application-relative deep links are accepted | Automated test passed | ⏳ | ✅ |
| Oversized notification title is rejected | API | Payload limits are enforced | Automated test passed | ⏳ | ✅ |
| Push subscription store persists/updates/revokes | API | Device records survive writes and can be revoked | Automated test passed | ⏳ | ✅ |
| completedInterrupted maps to task.stopped | API | Authoritative cancellation emits stopped notification semantics | Automated test passed | ⏳ | ✅ |
| Shared package typecheck | API | No TypeScript errors in shared package | Typecheck passed | ⏳ | ✅ |
| Services package typecheck | API | Authoritative event producer remains type-safe | Typecheck passed | ⏳ | ✅ |
| Server package typecheck | API | Web Push HTTP service remains type-safe | Typecheck passed | ⏳ | ✅ |
| Web package typecheck | API | Service worker registration integration remains type-safe | Typecheck passed | ⏳ | ✅ |
| UI package typecheck | UI | Push settings controls remain type-safe | Typecheck passed | ⏳ | ✅ |
| Full repository typecheck | API | All configured TypeScript projects pass | Typecheck passed | ⏳ | ✅ |

## Notes
- iPhone/iPad push delivery is not part of this automated test scope yet.
- User verification remains pending until the complete push pipeline reaches mobile E2E.