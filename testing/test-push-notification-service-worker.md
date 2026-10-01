# Push Notification Service Worker Diagnostics

| Step/Test Case | Type (UI/API/WS) | Expected Result | Agent Verification | User Verification | Status |
|---|---|---|---|---|---|
| Service worker logs install/activate lifecycle | UI | Diagnostic logs identify SW installation and activation | Added to `packages/web/public/sw.js` | ⏳ | ✅ 2026-10-01 — device ran the current SW (diagnostics reported back) |
| Direct push reaches service worker | API/WS | SW logs `push event received` and payload metadata without secrets | Added push-event diagnostics + `push_received` report to `POST /api/push/diagnostic` | ⏳ | ✅ 2026-10-01 — `notification.sw_diagnostic stage=push_received` recorded on the server |
| Push payload is parsed safely | API/WS | Logs show payload presence/title/body flags; invalid payload is rejected | Added parse diagnostics; parse fixed to the synchronous `PushMessageData.text()` spec (legacy Promise tolerated) | ⏳ | ✅ 2026-10-01 — first device round exposed `text().then is not a function`, fixed, then `notification_shown` reported |
| Notification display succeeds or reports the exact failure | UI | `showNotification succeeded` or `push handling failed` is logged | Added awaited `showNotification()` with catch + `notification_shown`/`show_failed` reports | ⏳ | ✅ 2026-10-01 — `stage=notification_shown` recorded |
| iPhone receives direct Push Test | UI | Notification appears on the iPhone | Server confirmed `notification.push_test.succeeded`; user saw the notification after the parse fix | ✅ 2026-10-01 | ✅ 2026-10-01 — user confirmed notification displays on iPhone |
