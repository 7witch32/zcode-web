# Push Notification Issue History

## ปัญหาที่พบ

Push Notification บน iPhone ไม่แสดงแจ้งเตือนเมื่อ ZCode ทำงานเสร็จ แม้ระบบฝั่ง server จะมี subscription ของ iPhone และสามารถส่ง Web Push ได้สำเร็จในระดับ transport

อาการที่ต้องการบันทึกไว้คือ:
- งานของ ZCode ทำเสร็จแล้ว แต่ iPhone ไม่ได้รับ/ไม่แสดง notification
- ต้องแยกให้ออกว่าปัญหาอยู่ที่ task lifecycle/event detection, Web Push transport, Service Worker หรือการแสดง notification บน iOS

## สิ่งที่ตรวจพบและแก้ไปแล้ว

### 1. Task terminal transition

เดิม `zcodeTaskIndexSyncer` ตรวจการเปลี่ยนสถานะเป็น terminal ด้วยเงื่อนไขที่ต้องมี `previous !== undefined`

กรณีที่ subscription เริ่มติดตาม session หลัง task มีอยู่แล้ว จะได้:
- `previous === undefined`
- `next.phase` เป็น `completed` / `failed` / `stopped`

จึงพลาดการสร้าง notification

แก้โดยเพิ่ม active-session tracking:
- `activeSessionsByWorkspaceKey`
- `markSessionActive(target)`
- `zcodeTaskServiceAdapter` เรียก `markSessionActive(target)` ก่อน `notifySyncerSession(target)`
- terminal event จะล้าง active-session tracking

ทำให้กรณี `previous === undefined` แต่ session ถูก mark ว่า active แล้ว สามารถตรวจ terminal transition ได้

## 2. ตรวจ Web Push ฝั่ง server

มี direct Push Test endpoint ที่ส่ง notification ไปยัง deviceId ที่ระบุโดยตรง

ทดสอบแล้ว server log แสดง:

```
notification.push_test.started
deviceId: <iPhone device>
targetCount: 1

notification.push_test.succeeded
deviceId: <iPhone device>
```

ผลนี้ยืนยันว่า:
- server route ทำงาน
- หา iPhone subscription ได้
- มี Web Push subscription ที่ enabled
- `webpush.sendNotification()` ทำงานสำเร็จโดยไม่เกิด error
- subscription ถูกบันทึก success

Subscription ที่พบเป็น endpoint ของ Apple Web Push (`web.push.apple.com`) และสถานะ enabled

> ไม่บันทึกค่า auth/p256dh หรือ credential ของ subscription ลงเอกสารนี้

## 3. เพิ่ม Service Worker diagnostics

แก้ `packages/web/public/sw.js` เพื่อเพิ่ม log สำหรับตรวจ lifecycle และ push event ได้แก่:

- service worker installed
- service worker activated
- push event received
- payload parsed
- invalid payload
- empty title/body
- showNotification succeeded
- push handling failed

การ parse payload และ `showNotification()` ถูก await และมี try/catch เพื่อให้เห็น error ที่แท้จริงหากเกิดขึ้น

Build ล่าสุดยืนยันแล้วว่า diagnostics เหล่านี้อยู่ใน `/app/web-dist/sw.js` ภายใน container ที่ deploy อยู่

## 4. Direct Push Test

เพิ่ม/ใช้งาน Push Test จากหน้า Settings เพื่อยิง notification ไปยัง deviceId ของเครื่องนั้นโดยตรง

ผลฝั่ง server ล่าสุด:
- targetCount = 1
- `notification.push_test.succeeded`

แต่ยังไม่มีหลักฐานจากฝั่ง iPhone ว่า Service Worker:
1. ได้รับ `push` event จริงหรือไม่
2. parse payload สำเร็จหรือไม่
3. `showNotification()` สำเร็จหรือเกิด error

## สถานะปัจจุบัน

จุดที่ยืนยันได้แล้ว:

| จุดตรวจสอบ | ผล |
|---|---|
| Task terminal detection | แก้ logic แล้ว |
| iPhone push subscription มีอยู่ | พบ |
| Subscription enabled | ใช่ |
| Server Push Test route | สำเร็จ |
| `webpush.sendNotification()` | สำเร็จ |
| Service Worker diagnostics | build/deploy แล้ว |
| iPhone แสดง notification | **ยังยืนยันไม่ได้** |
| Service Worker ได้รับ push event | **ยังยืนยันไม่ได้** |
| `showNotification()` บน iPhone สำเร็จ | **ยังยืนยันไม่ได้** |

## แนวทางที่ลองแล้ว

1. ตรวจ flow ของ task completion และ terminal phase
2. แก้กรณี `previous === undefined` ด้วย explicit active-session tracking
3. ตรวจ push subscription ที่เก็บใน server
4. ยิง Direct Push Test ไปยัง deviceId ของ iPhone โดยตรง
5. เพิ่ม server-side push delivery logging
6. เพิ่ม Service Worker-side diagnostic logging
7. build และ deploy image ใหม่
8. ตรวจไฟล์ Service Worker ภายใน container หลัง deploy ว่า diagnostics ถูก build เข้า image จริง

## สิ่งที่ยังค้างสำหรับการกลับมาวิเคราะห์

หากกลับมาแก้ปัญหานี้อีกครั้ง จุดสำคัญที่สุดคือหาหลักฐานจาก **Service Worker บน iPhone** หลังจากกด Push Test

ต้องแยกกรณีให้ได้ว่า:

```
Server send สำเร็จ
        |
        v
iPhone ได้รับ push event ?
   |              |
  ไม่             ใช่
   |              |
ตรวจ iOS/Safari    v
Push delivery     parse payload ?
                  |        |
                 ไม่       ใช่
                  |        |
             payload/     v
             SW issue   showNotification ?
                           |        |
                          ไม่       ใช่
                           |        |
                     SW/iOS error  notification UI / iOS behavior
```

ตอนนี้จึง **ยังไม่ควรสรุปว่า server เป็นสาเหตุ** เพราะหลักฐานล่าสุดชี้ว่า server สามารถส่ง Web Push สำเร็จถึง Apple Web Push endpoint ได้แล้ว

และยัง **ไม่ควรสรุปว่า Service Worker เป็นสาเหตุ** เพราะยังไม่มี log จาก runtime ของ Service Worker บน iPhone มายืนยัน

## หมายเหตุ

การทดลองรอบนี้ตั้งใจหยุดไว้ก่อน ไม่ได้เพิ่ม diagnostic callback จาก Service Worker กลับมายัง server และไม่ได้แก้ระบบ push เพิ่มเติมหลังจากยืนยันว่า Direct Push Test ฝั่ง server สำเร็จ

## รอบวันที่ 2026-10-01 (รอบที่สอง): พบ root cause และแก้ไขแล้ว

การสำรวจโค้ดรอบใหม่พบสาเหตุที่อธิบายอาการ "server ส่งสำเร็จทั้งหมด แต่ iPhone เงียบสนิทและไม่มี log จาก SW เลย"

### Root cause หลัก: iPhone รัน Service Worker เวอร์ชันเก่าค้างอยู่

- `packages/server/src/http.ts` ให้ `Cache-Control: no-cache` เฉพาะ `index.html` ส่วน `/sw.js` ถูก serve ด้วย `public, max-age=31536000, immutable` — การเช็ค SW update ของ iOS Home Screen app ตอบจาก HTTP cache ได้นานถึง 1 ปี
- ผลคือ deploy `sw.js` ใหม่ (พร้อม diagnostics) กี่รอบ iPhone ก็ยังรันตัวเก่า ไม่มี push handler ใหม่ ไม่มี log ใด ๆ ออกมา
- หลักฐานสนับสนุน: `packages/web/dist/sw.js` (build artifact ที่ถูก deploy ล่าสุด) เป็นเวอร์ชันเก่าที่ยังไม่มี diagnostics

### ปัจจัยเสริมที่กระทบคุณสมบัติ push ของ iOS

1. `manifest.webmanifest` มีไอคอนเดียวขนาด 32x32 (`favicon.ico`) — Apple กำหนดว่า Web Push บน iOS 16.4+ ต้องมีไอคอน 192x192 ขึ้นไปใน manifest
2. `.webmanifest` ไม่มี MIME entry ใน static handler จึงถูก serve เป็น `application/octet-stream` — Safari อาจ reject manifest ตอน Add to Home Screen
3. ไม่มี `apple-touch-icon` — ไอคอน Home Screen ต้องกลับไปใช้ screenshot ของหน้าเว็บ
4. SW registration ไม่ได้ตั้ง `updateViaCache: "none"`

### สิ่งที่แก้ไขในรอบนี้

| แก้ที่ | รายละเอียด |
|---|---|
| `packages/server/src/http.ts` | serve `/sw.js` และ `*.webmanifest` ด้วย `Cache-Control: no-cache` เสมอ + เพิ่ม MIME `application/manifest+json` |
| `packages/web/src/main.tsx` | register SW ด้วย `updateViaCache: "none"` |
| `packages/web/public/manifest.webmanifest` | เพิ่มไอคอน 192x192 / 512x512 (สร้างจาก `public/logo/icons/1024x1024.png` composite บนพื้น `#161616`) |
| `packages/web/index.html` | เพิ่ม `<link rel="apple-touch-icon">` |
| `packages/web/public/sw.js` | เพิ่ม `icon`/`tag` ใน `showNotification` + รายงานผลกลับ server ผ่าน `POST /api/push/diagnostic` ทุกขั้น (`push_received` / `payload_invalid` / `notification_shown` / `show_failed`) |
| `packages/server/src/push/*` | เพิ่ม `deviceId` ใน push payload, endpoint `POST /api/push/diagnostic`, บันทึก `lastDiagnostic*` ต่อ device และส่งออกทาง `GET /api/push/devices` |
| Settings UI | แสดง "last report" ต่อ device ทำให้กด Test push แล้วเห็นบนจอทันทีว่า iPhone ได้รับ push จริงหรือไม่ |

### วิธีตรวจยืนยันหลัง deploy

1. `docker compose build && docker compose up -d`
2. บน iPhone: **ลบ Home Screen app เดิม** → เปิด URL ผ่าน HTTPS → Add to Home Screen ใหม่ → เปิด push ใน Settings → กด Test push
3. ตรวจ: Settings → Push notifications ต้องขึ้น last report เป็น `notification_shown` (หรือดู log `notification.sw_diagnostic` ฝั่ง server) — ถ้าไม่มีรายงานเลยแปลว่า push ไม่ถึง SW ของเครื่อง ให้ไล่เช็ค iOS Settings > Notifications ของ web app, Focus mode และการติดตั้ง Home Screen app

> ไม่บันทึกค่า auth/p256dh หรือ credential ของ subscription ลงเอกสารนี้

## รอบวันที่ 2026-10-01 (รอบที่สาม): root cause ตัวจริง — PushMessageData.text() เป็น synchronous

หลัง deploy ระบบ diagnostic รอบที่สอง iPhone ทดสอบจริงแล้วระบบครั้งแรกเลยได้หลักฐานจากอุปกรณ์:

```
notification.sw_diagnostic  stage="show_failed"
detail="TypeError: event.data.text().then is not a function"
```

แปลว่า push **ถึง Service Worker บน iPhone จริง** (diagnostics ทำงาน, กลไก SW update ก็ทำงานถูกต้อง) แต่ handler พังตอน parse payload เพราะโค้ดเดิมเขียนตามสเปก Push API รุ่นเก่าที่ `PushMessageData.text()` เคยคืน Promise — ตามสเปกปัจจุบัน (WebKit/Chromium ปัจจุบัน) มัน**คืน string แบบ synchronous** `.then` จึงไม่ใช่ function และ push handler throw ทุกครั้ง ทำให้ notification ไม่เคยแสดงเลยตั้งแต่ต้น **บนทุก browser** ไม่ใช่เฉพาะ iOS

สรุป root cause รวมของทั้งปัญหาคือ 2 ชั้นซ้อนกัน:
1. `sw.js` parse payload ผิดสเปก → push ที่ถึงเครื่องพังทุกครั้ง (แก้แล้ว: รองรับทั้ง sync และ legacy Promise)
2. sw.js ถูก cache แบบ immutable 1 ปี + ไม่มีวงจรหลักฐานจากอุปกรณ์ → แก้/deploy กี่รอบก็ไม่มีทางรู้ว่าอุปกรณ์เจอปัญหาอะไร (แก้แล้วในรอบที่สอง)

### ปิดงาน 2026-10-01

ผู้ใช้ยืนยันบน iPhone จริงหลัง deploy รอบที่สาม: **notification แสดงสำเร็จ** และ server บันทึก
`notification.sw_diagnostic stage=notification_shown` จากเครื่องจริง — ตาราง "ยังยืนยันไม่ได้"
ในรอบแรกถือว่ายืนยันครบในบริบท Test push แล้ว ส่วน push จาก task จริง (completed/failed/stopped/
interaction) ยังตาม matrix ใน PUSH_NOTIFICATION_HOW_TO_TEST.md

> ไม่บันทึกค่า auth/p256dh หรือ credential ของ subscription ลงเอกสารนี้
