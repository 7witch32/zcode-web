# ZCode Docker — Push Notification How-to Test

เอกสารนี้ใช้สำหรับทดสอบ Push Notification ตั้งแต่ automated test ไปจนถึงการทดสอบจริงบน iPhone/iPad โดยเน้นกรณี Web UI ปิดอยู่และ Docker backend ยังทำงานอยู่

## 1. Automated baseline
รันจาก repository root:

    corepack pnpm typecheck
    corepack pnpm exec tsx packages/shared/test/notification-events.test.ts
    corepack pnpm exec tsx packages/server/test/push-subscription-store.test.ts
    corepack pnpm exec tsx packages/services/test/notification-event-service.test.ts
    & 'C:\Program Files\Git\cmd\git.exe' diff --check

Expected: typecheck, event tests, subscription test, stopped mapping test และ diff check ต้องผ่านทั้งหมด

## 2. เตรียม VAPID สำหรับ local/Docker
สร้าง key pair ครั้งเดียว:

    corepack pnpm --filter @zcode/server exec web-push generateVAPIDKeys --json

ตั้งค่า:

    ZCODE_PUSH_ENABLED=true
    ZCODE_PUSH_VAPID_PUBLIC_KEY=<public-key>
    ZCODE_PUSH_VAPID_PRIVATE_KEY=<private-key>
    ZCODE_PUSH_VAPID_SUBJECT=mailto:admin@example.invalid

ห้าม commit private key ลง Git และสำหรับ Docker ให้เก็บ subscription storage บน persistent volume

## 3. ตรวจ Push API
GET /api/push/config

Expected: HTTP 200, push enabled, มี public VAPID key และไม่มี private key

GET /api/push/devices

Expected: HTTP 200 และ response มีเฉพาะ device metadata ไม่มี subscription auth/p256dh

## 4. ทดสอบบน iPhone
1. เปิด ZCode Web UI ใน Safari และ login
2. Share → Add to Home Screen
3. เปิด ZCode จาก Home Screen icon
4. Settings → General → Push notifications
5. กด Enable push และ Allow
6. ตรวจว่า device ปรากฏใน device list
7. กด Test push

Expected: iPhone ได้ notification จริง และ server delivery สำเร็จ

## 5. ทดสอบ Web UI เปิดอยู่
สร้าง long-running task แล้วทดสอบ:
- completed
- failed
- stopped

Expected: existing Web/Desktop notification ยังทำงาน และ push notification ถูกส่งเพิ่มโดยไม่ทำให้ task fail

## 6. Test สำคัญ — ปิด Web UI
1. Register iPhone และทำ Test push ให้ผ่าน
2. ปิด Web UI/session บน iPhone
3. จากเครื่องอื่นเริ่ม long-running task
4. ปล่อยให้ task complete
5. ห้ามเปิด Web UI กลับขึ้นมา
6. รอ notification

Expected flow: task transition → backend notification event → Web Push → iPhone notification

ถ้าเปิด Web UI แล้วเห็น notification แต่ตอนปิด Web UI ไม่มี แสดงว่าปัญหาอยู่ใน Push pipeline ไม่ใช่ renderer notification

## 7. ทดสอบ iPhone Lock Screen
1. ทำ Test push ให้ผ่าน
2. Lock iPhone
3. เริ่ม task จากเครื่องอื่น
4. รอ task จบโดยไม่ unlock

Expected: notification สามารถปรากฏบน Lock Screen ตาม iOS notification/Focus settings

## 8. ทดสอบ iPad
ทำชุดเดียวกับ iPhone: Add to Home Screen → Enable push → Test push → ปิด Web UI → สร้าง task → ตรวจ notification → ทดสอบ Lock Screen

Expected: iPhone และ iPad เป็น device records แยกกัน และ task เดียวกันส่งไปได้ทั้งสอง device

## 9. Multi-device + revoke
Register iPhone = Device A และ iPad = Device B
ตรวจ GET /api/push/devices ต้องเห็นทั้งสอง device
สร้าง task → ทั้ง A และ B ต้องได้รับ notification
Revoke A → A ต้องไม่รับ task ใหม่ แต่ B ยังต้องรับได้

## 10. Duplicate event
ทำให้ event เดิมถูกประมวลผลซ้ำหรือจำลอง duplicate delivery

Expected: logical transition เดิมใช้ eventId เดิม และไม่ควรสร้าง notification ซ้ำ

เก็บ eventId, sessionId, transitionId, timestamp และ deviceId หากพบ duplicate

## 11. Task stopped
1. เริ่ม task ที่สามารถ stop/cancel ได้
2. สั่ง stop/cancel
3. รอ terminal transition
4. ตรวจ notification

Expected:
- runtime terminal phase = completedInterrupted
- notification event = task.stopped
- severity = warning
- ไม่ถูกตีความเป็น task.completed

ห้ามใช้ renderer disappearance หรือการปิด browser เป็นหลักฐานว่า task stopped

## 12. Task failed
สร้าง task ที่ fail จริง

Expected: event = task.failed, severity = error, push ถูกส่ง และ agent execution ไม่ fail เพิ่มเพราะ push delivery

## 13. Pending Interaction
สร้าง task ที่ต้องการ user interaction

Expected: backend สร้าง interaction.pending และส่ง push โดยไม่ replay pending notification จาก snapshot เดิม
ตอบ interaction แล้ว reconnect/restart ต้องไม่ replay pending event เดิม

## 14. Docker Restart
ก่อน restart: register device และทำ Test push ให้ผ่าน
Restart container/server
ตรวจ GET /api/push/devices

Expected: device ยังอยู่และ task ใหม่ยังส่ง push ได้
หลัง restart ต้องไม่ replay notification ของ task ที่เสร็จก่อน restart

## 15. Push service failure
ทำให้ outbound push service ใช้งานไม่ได้ชั่วคราว
เริ่ม task และปล่อยให้จบ

Expected:
- task ยังคงทำงาน
- task complete/fail ตาม runtime จริง
- push failure ถูก log
- agent execution ไม่ rollback/fail เพราะ notification failure

## 16. Expired subscription
จำลอง push service response 404/410 หรือใช้ subscription ที่ invalid

Expected:
- subscription ถูกลบ/revoke
- diagnostic event notification.subscription.expired ถูกบันทึก
- endpoint ที่เสียไม่ถูก retry ซ้ำไปเรื่อย ๆ
- Enable push ใหม่สร้าง subscription ใหม่ได้

## 17. Permission ถูกปิด
ปิด notification permission ของ ZCode Home Screen Web App แล้วลอง Enable push

Expected: UI แสดงสถานะเหมาะสม ไม่สร้าง subscription ปลอม และเมื่อเปิด permission กลับสามารถ register ใหม่ได้

## 18. Tailscale/network interruption
ขณะที่ task ทำงาน ให้ตัด network ของ iPhone ชั่วคราว แล้วต่อกลับหลัง task จบ
แยกทดสอบกรณี push service รับ event ได้กับกรณี server ไม่มี outbound connectivity

Expected: agent task ไม่ได้รับผลกระทบจาก push/network failure และ delivery diagnostics ถูกบันทึก

## 19. Security test
ตรวจ GET /api/push/config และ GET /api/push/devices

ห้ามพบ VAPID private key, subscription auth key, p256dh, API key, OAuth token หรือ session secret

Notification payload ห้ามมี full prompt, source code, tool output, access token, API key, filesystem secrets หรือ full conversation

ควรเป็นข้อมูลสั้น ๆ เช่น ZCode / Task completed หรือ ZCode / Task failed

## 20. Final production acceptance
| Test | Expected |
|---|---|
| Automated typecheck | PASS |
| Event unit tests | PASS |
| Subscription store tests | PASS |
| iPhone Test push | PASS |
| iPad Test push | PASS |
| Web UI closed | PASS |
| iPhone locked | PASS* |
| iPad locked | PASS* |
| Task completed | PASS |
| Task failed | PASS |
| Task stopped | PASS |
| Pending interaction | PASS |
| Multi-device | PASS |
| Device revoke | PASS |
| Duplicate event | No duplicate |
| Docker restart | Subscription survives |
| Historical replay | No replay |
| Push outage | Agent continues |
| Expired subscription | Auto cleanup |
| Permission recovery | PASS |
| Security payload inspection | PASS |
| Production build | PASS |
| git diff --check | PASS |

* Lock Screen display is subject to iOS/iPadOS notification and Focus settings.

## Definition of Done
- Test push ผ่านบน iPhone และ iPad
- task จบขณะ Web UI ปิดแล้ว notification มาถึง
- task failed/stopped/pending interaction ทำงาน
- Docker restart แล้ว device registration ไม่หาย
- revoke device ทำงาน
- duplicate event ไม่สร้าง notification ซ้ำ
- expired subscription ถูก cleanup
- push outage ไม่กระทบ agent execution
- ไม่มี secret ใน notification/API response
- automated tests และ production build ผ่าน
- ไม่มี debug code หรือ secret ใน Git diff
## 3. Manual end-to-end test matrix

> อัปเดต 2026-10-01: แถว 1-4 ผ่านการยืนยันจริงบน iPhone แล้ว (ติดตั้ง Home Screen, เปิด push,
> Test push ถูกยอมรับ, notification แสดงจริง — หลังแก้ root cause `PushMessageData.text()`
> ตาม PUSH_NOTIFICATION_ISSUE_HISTORY.md รอบที่สาม; ยืนยันจาก `sw_diagnostic stage=notification_shown`)

| Step/Test Case | Type (UI/API/WS) | Expected Result | Agent Verification | User Verification |
|---|---|---|---|---|
| Install ZCode from HTTPS with Add to Home Screen | UI | Home Screen app launches | ✅ 2026-10-01 | ✅ 2026-10-01 |
| Enable Push Notifications | UI | Device subscription is registered | ✅ 2026-10-01 (device list + sw_diagnostic) | ✅ 2026-10-01 |
| Test Push | API/UI | UI reports server accepted the request | ✅ 2026-10-01 (`notification.push_test.succeeded`) | ✅ 2026-10-01 |
| Lock/leave iPhone with ZCode not foregrounded, then Test Push | UI | OS notification appears | OS notification observed on device | ✅ 2026-10-01 (notification แสดง; lock-screen case ยังไม่ได้ทดสอบแยก) |
| Run a task to successful completion while ZCode is backgrounded | UI/API | task.completed notification appears | ⏳ | ⏳ |
| Run a task that fails | UI/API | task.failed notification appears | ⏳ | ⏳ |
| Stop a running task | UI/API | task.stopped notification appears | ⏳ | ⏳ |
| Trigger a real pending interaction | UI/API | interaction.pending notification appears | ⏳ | ⏳ |
| Reload/restart Docker and repeat | API/UI | No replay storm from historical terminal sessions | ⏳ | ⏳ |
| Revoke a device and retry | API/UI | Revoked device no longer receives push | Disable/Enable push ทำงานบน device จริง (subscription ใหม่ถูกสร้าง) | ✅ 2026-10-01 |

### iPhone/iPad acceptance criteria

- HTTPS URL is used.
- ZCode is installed and launched from the Home Screen.
- Notification permission is granted.
- The server-side subscription exists for the device.
- A test notification is visible in Notification Center while ZCode is not foregrounded.
- At least one real 	ask.completed or 	ask.failed event is observed end-to-end.

### Important distinction

"Push test request accepted by the server" is a server-side acceptance signal, not an end-to-end delivery assertion. The definitive manual check is the notification appearing on the target device.