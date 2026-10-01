const MAX_PAYLOAD_BYTES = 3500;
// 与 packages/web/public/icons/ 下生成的 PWA 图标对应；iOS 用 manifest 图标，Android/Chrome 用这里的 icon/badge。
const NOTIFICATION_ICON = "/icons/icon-192.png";

function isSafePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

// 修复依据（2026-10-01 设备端诊断）：PushMessageData.text() 按现行规范是同步返回字符串，
// 旧实现按早期规范写成 .text().then(...)，导致每个 push 都抛
// "event.data.text().then is not a function"，通知从未显示过（所有浏览器均如此）。
// 这里同时兼容旧实现的 Promise 返回，避免任何环境回归。
async function parsePushPayload(event) {
  if (!event.data) return null;
  let text;
  try {
    const value = event.data.text();
    text = value && typeof value.then === "function" ? await value : value;
  } catch {
    return null;
  }
  if (new TextEncoder().encode(text).byteLength > MAX_PAYLOAD_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 诊断回调（2026-10-01 push 排查）：server transport 成功不代表设备端成功，此前缺少设备侧证据链。
// 上报失败必须静默——诊断通道不能反过来破坏 push 处理本身。
function reportDiagnostic(stage, deviceId, detail) {
  try {
    void fetch("/api/push/diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage,
        ...(deviceId ? { deviceId } : {}),
        ...(detail ? { detail: String(detail).slice(0, 240) } : {}),
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // ignore — diagnostics must never break push handling
  }
}

self.addEventListener("install", () => {
  console.info("[ZCode Push] service worker installed");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.info("[ZCode Push] service worker activated");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      console.info("[ZCode Push] push event received");
      let deviceId;
      try {
        const payload = await parsePushPayload(event);
        deviceId = payload && typeof payload.deviceId === "string" ? payload.deviceId : undefined;
        reportDiagnostic("push_received", deviceId);
        console.info("[ZCode Push] payload parsed", {
          hasPayload: !!payload,
          hasTitle: typeof payload?.title === "string",
          hasBody: typeof payload?.body === "string",
        });

        if (!payload || typeof payload.title !== "string" || typeof payload.body !== "string") {
          reportDiagnostic("payload_invalid", deviceId, payload ? "missing title/body" : "payload unparsed");
          console.warn("[ZCode Push] invalid payload");
          return;
        }
        const title = payload.title.trim().slice(0, 120);
        const body = payload.body.trim().slice(0, 240);
        if (!title || !body) {
          reportDiagnostic("payload_invalid", deviceId, "empty title/body");
          console.warn("[ZCode Push] empty notification title/body");
          return;
        }

        const deepLink = isSafePath(payload.deepLink) ? payload.deepLink : "/";
        const tag =
          typeof payload.sessionId === "string" && payload.sessionId
            ? `zcode-${payload.sessionId}`
            : `zcode-${typeof payload.eventId === "string" ? payload.eventId : "push"}`;
        await self.registration.showNotification(title, {
          body,
          icon: NOTIFICATION_ICON,
          badge: NOTIFICATION_ICON,
          // 同一会话的新通知替换旧通知，避免任务频繁更新时通知堆积。
          tag,
          data: {
            eventId: typeof payload.eventId === "string" ? payload.eventId : "",
            deepLink,
          },
        });
        reportDiagnostic("notification_shown", deviceId);
        console.info("[ZCode Push] showNotification succeeded");
      } catch (error) {
        reportDiagnostic("show_failed", deviceId, String(error));
        console.error("[ZCode Push] push handling failed", String(error));
        throw error;
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = isSafePath(event.notification.data?.deepLink)
    ? event.notification.data.deepLink
    : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const origin = self.location.origin;
      const target = new URL(deepLink, origin).href;
      const existing = clients.find((client) => client.url.startsWith(origin));
      if (existing) {
        await existing.focus();
        if ("navigate" in existing) await existing.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    }),
  );
});
