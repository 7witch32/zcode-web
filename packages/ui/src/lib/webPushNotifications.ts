const DEVICE_ID_STORAGE_KEY = "zcode-push-device-id";

export interface WebPushConfig {
  enabled: boolean;
  publicKey?: string;
}

export interface WebPushDevice {
  deviceId: string;
  deviceName?: string;
  workspaceIdentity?: string;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  lastDiagnosticAt?: string;
  lastDiagnosticStage?: string;
  lastDiagnosticDetail?: string;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers,
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
function decodeVapidPublicKey(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getWebPushPermission(): NotificationPermission | "unsupported" {
  return isWebPushSupported() ? Notification.permission : "unsupported";
}

export async function getWebPushConfig(): Promise<WebPushConfig> {
  return requestJson<WebPushConfig>("/api/push/config");
}

/** 当前浏览器注册的 push deviceId；设备列表用它区分"本机"与"其他设备"。 */
export function getCurrentWebPushDeviceId(): string | null {
  return typeof localStorage === "undefined" ? null : localStorage.getItem(DEVICE_ID_STORAGE_KEY);
}

export async function listWebPushDevices(): Promise<WebPushDevice[]> {
  const result = await requestJson<{ devices: WebPushDevice[] }>("/api/push/devices");
  return result.devices;
}
function isStandaloneWebApp(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isAppleMobileDevice(): boolean {
  return (
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
  );
}

export async function enableWebPushNotifications(): Promise<{ deviceId: string }> {
  if (!isWebPushSupported()) {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      throw new Error(
        "HTTPS is required for push notifications on iPhone/iPad. Open ZCode using the HTTPS Tailscale address, then add it to the Home Screen.",
      );
    }
    throw new Error(
      "Push notifications are not supported in this browser context. On iPhone/iPad, install ZCode from the HTTPS site to the Home Screen first.",
    );
  }
  if (isAppleMobileDevice() && !isStandaloneWebApp()) {
    throw new Error(
      "On iPhone/iPad, push notifications require the ZCode Home Screen app. In Safari, use Share → Add to Home Screen, open ZCode from the Home Screen icon, then enable Push Notifications again.",
    );
  }

  const config = await getWebPushConfig();
  if (!config.enabled || !config.publicKey) throw new Error("Push notifications are not configured on this server");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  let subscription = existing;
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidPublicKey(config.publicKey) as unknown as BufferSource,
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "Error";
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[push] PushManager.subscribe failed", { name, message });
      if (/unexpected response code/i.test(message)) {
        throw new Error(
          "The browser push service rejected this subscription. On iPhone/iPad, make sure ZCode is opened from the Home Screen app on HTTPS. If it was installed before the server VAPID key changed, remove ZCode from the Home Screen, add it again, and retry.",
        );
      }
      throw new Error(`Unable to create the push subscription (${name}): ${message}`);
    }
  }

  const result = await requestJson<{ deviceId: string }>("/api/push/devices", {
    method: "POST",
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.toJSON().keys?.p256dh,
        auth: subscription.toJSON().keys?.auth,
      },
    }),
  });
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, result.deviceId);
  return result;
}

export async function revokeWebPushDevice(deviceId: string): Promise<void> {
  await requestJson(`/api/push/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
  if (localStorage.getItem(DEVICE_ID_STORAGE_KEY) === deviceId) {
    localStorage.removeItem(DEVICE_ID_STORAGE_KEY);
  }
}

export async function disableWebPushNotifications(): Promise<void> {
  const deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (deviceId) {
    await requestJson(`/api/push/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
  }
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
  localStorage.removeItem(DEVICE_ID_STORAGE_KEY);
}

export async function testWebPushNotification(deviceId?: string): Promise<void> {
  const targetDeviceId = deviceId ?? localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!targetDeviceId) {
    throw new Error("This device is not registered for push notifications. Enable push notifications first.");
  }

  await requestJson("/api/push/test", {
    method: "POST",
    body: JSON.stringify({ deviceId: targetDeviceId }),
  });
}
