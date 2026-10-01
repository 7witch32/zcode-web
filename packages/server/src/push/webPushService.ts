import { randomUUID } from "node:crypto";
import webpush from "web-push";
import type { NotificationEvent } from "@zcode/shared";
import { onNotificationEvent } from "@zcode/services/notifications";
import {
  PushSubscriptionStore,
  type PushSubscriptionInput,
  type StoredPushSubscription,
} from "./pushSubscriptionStore.js";

const MAX_PUSH_PAYLOAD_BYTES = 3500;
const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_TIMEOUT_MS = 10_000;
// Service worker 上报阶段白名单：与 packages/web/public/sw.js 的 reportDiagnostic 保持一致。
const DIAGNOSTIC_STAGES = new Set(["push_received", "payload_invalid", "notification_shown", "show_failed"]);

type PushSubscriptionRecord = StoredPushSubscription;

export interface WebPushServiceConfig {
  enabled: boolean;
  publicKey?: string;
}

export interface WebPushService {
  config(): WebPushServiceConfig;
  listDevices(): Promise<unknown[]>;
  registerDevice(input: PushSubscriptionInput): Promise<{ deviceId: string }>;
  revokeDevice(deviceId: string): Promise<boolean>;
  testDevice(deviceId?: string): Promise<void>;
  recordDeviceDiagnostic(deviceId: string | undefined, stage: string, detail?: string): Promise<boolean>;
  dispose(): void;
}
function readConfig() {
  const publicKey = process.env["ZCODE_PUSH_VAPID_PUBLIC_KEY"]?.trim();
  const privateKey = process.env["ZCODE_PUSH_VAPID_PRIVATE_KEY"]?.trim();
  const subject = process.env["ZCODE_PUSH_VAPID_SUBJECT"]?.trim();
  const enabled = process.env["ZCODE_PUSH_ENABLED"] === "true" && Boolean(publicKey && privateKey && subject);
  return {
    enabled,
    publicKey,
    privateKey,
    subject,
    ttl: Number(process.env["ZCODE_PUSH_TTL_SECONDS"]) || DEFAULT_TTL_SECONDS,
    timeout: Number(process.env["ZCODE_PUSH_TIMEOUT_MS"]) || DEFAULT_TIMEOUT_MS,
  };
}

function storePath(): string {
  return process.env["ZCODE_PUSH_SUBSCRIPTIONS_PATH"]?.trim() ||
    `${process.cwd()}/.zcode/push-subscriptions.json`;
}

function sanitizeInput(input: PushSubscriptionInput): PushSubscriptionInput {
  if (!input.endpoint.startsWith("https://")) throw new Error("Push endpoint must use HTTPS");
  if (!input.keys?.auth || !input.keys?.p256dh) throw new Error("Push subscription keys are required");
  return {
    ...(input.deviceId?.trim() ? { deviceId: input.deviceId.trim() } : {}),
    ...(input.deviceName?.trim() ? { deviceName: input.deviceName.trim() } : {}),
    ...(input.workspaceIdentity?.trim() ? { workspaceIdentity: input.workspaceIdentity.trim() } : {}),
    endpoint: input.endpoint,
    keys: { auth: input.keys.auth, p256dh: input.keys.p256dh },
  };
}
export function parsePushSubscriptionInput(value: unknown): PushSubscriptionInput {
  if (typeof value !== "object" || value === null) throw new Error("Invalid push subscription");
  const record = value as Record<string, unknown>;
  const keys = record.keys;
  if (
    typeof record.endpoint !== "string" ||
    typeof keys !== "object" ||
    keys === null ||
    typeof (keys as Record<string, unknown>).auth !== "string" ||
    typeof (keys as Record<string, unknown>).p256dh !== "string"
  ) {
    throw new Error("Invalid push subscription");
  }
  return sanitizeInput({
    deviceId: typeof record.deviceId === "string" ? record.deviceId : undefined,
    deviceName: typeof record.deviceName === "string" ? record.deviceName : undefined,
    workspaceIdentity: typeof record.workspaceIdentity === "string" ? record.workspaceIdentity : undefined,
    endpoint: record.endpoint as string,
    keys: {
      auth: (keys as Record<string, string>).auth as string,
      p256dh: (keys as Record<string, string>).p256dh as string,
    },
  });
}

export interface PushDiagnosticInput {
  deviceId?: string;
  stage: string;
  detail?: string;
}
// deviceId 允许缺省：payload 解析失败时 SW 无法定位设备，但仍要留下服务器侧证据。
export function parsePushDiagnosticInput(value: unknown): PushDiagnosticInput {
  if (typeof value !== "object" || value === null) throw new Error("Invalid push diagnostic");
  const record = value as Record<string, unknown>;
  if (record.deviceId !== undefined && (typeof record.deviceId !== "string" || !record.deviceId.trim())) {
    throw new Error("Invalid push diagnostic");
  }
  if (typeof record.stage !== "string" || !DIAGNOSTIC_STAGES.has(record.stage)) {
    throw new Error("Invalid push diagnostic stage");
  }
  return {
    ...(typeof record.deviceId === "string" && record.deviceId.trim()
      ? { deviceId: record.deviceId.trim() }
      : {}),
    stage: record.stage,
    ...(typeof record.detail === "string" && record.detail.trim()
      ? { detail: record.detail.trim().slice(0, 240) }
      : {}),
  };
}

function publicDevice(device: PushSubscriptionRecord): unknown {
  return {
    deviceId: device.deviceId,
    ...(device.deviceName ? { deviceName: device.deviceName } : {}),
    ...(device.workspaceIdentity ? { workspaceIdentity: device.workspaceIdentity } : {}),
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
    enabled: true,
    ...(device.lastSuccessAt ? { lastSuccessAt: device.lastSuccessAt } : {}),
    ...(device.lastFailureAt ? { lastFailureAt: device.lastFailureAt } : {}),
    ...(device.lastFailureReason ? { lastFailureReason: device.lastFailureReason } : {}),
    ...(device.lastDiagnosticAt ? { lastDiagnosticAt: device.lastDiagnosticAt } : {}),
    ...(device.lastDiagnosticStage ? { lastDiagnosticStage: device.lastDiagnosticStage } : {}),
    ...(device.lastDiagnosticDetail ? { lastDiagnosticDetail: device.lastDiagnosticDetail } : {}),
  };
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  const value = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isFinite(value) ? value : undefined;
}

function getErrorBody(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("body" in error)) return undefined;
  const body = (error as { body?: unknown }).body;
  return typeof body === "string" && body.trim() ? body.trim().slice(0, 500) : undefined;
}

function describePushError(error: unknown, fallback: string): string {
  const statusCode = getStatusCode(error);
  const body = getErrorBody(error);
  if (statusCode !== undefined) {
    return body ? `HTTP ${statusCode}: ${body}` : `HTTP ${statusCode}`;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

async function sendWithRetry(
  subscription: StoredPushSubscription,
  payload: string,
  options: webpush.RequestOptions,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await webpush.sendNotification(subscription, payload, options);
      return;
    } catch (error) {
      const statusCode = getStatusCode(error);
      const retryable = statusCode === 429 || (statusCode !== undefined && statusCode >= 500);
      if (!retryable || attempt > 0) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

// deviceId 进 payload（2026-10-01 push 排查）：Service Worker 收到 push 后需回调
// /api/push/diagnostic 汇报设备侧生命周期，没有 deviceId 无法定位设备。
function eventPayload(event: NotificationEvent, deviceId?: string): string {
  const payload = JSON.stringify({
    eventId: event.eventId,
    eventVersion: event.eventVersion,
    type: event.type,
    title: event.title,
    body: event.body,
    severity: event.severity,
    sessionId: event.sessionId,
    ...(deviceId ? { deviceId } : {}),
    ...(event.deepLink ? { deepLink: event.deepLink } : {}),
  });
  if (Buffer.byteLength(payload, "utf8") > MAX_PUSH_PAYLOAD_BYTES) {
    throw new Error("Push payload exceeds the configured safety limit");
  }
  return payload;
}
export function createWebPushService(): WebPushService {
  const store = new PushSubscriptionStore(storePath());
  const config = readConfig();
  const subscription = onNotificationEvent((event: NotificationEvent) => {
    if (!config.enabled) return;
    console.info(
      JSON.stringify({
        event: "notification.delivery.started",
        notificationEventId: event.eventId,
        type: event.type,
        workspaceIdentity: event.workspaceIdentity,
        sessionId: event.sessionId,
      }),
    );
    void deliverEvent(event).catch((error) => {
      console.warn(
        JSON.stringify({
          event: "notification.delivery.unhandled_failure",
          notificationEventId: event.eventId,
          error: describePushError(error, "delivery_failed"),
        }),
      );
    });
  });

  async function deliverEvent(event: NotificationEvent): Promise<void> {
    if (!config.enabled || !config.publicKey || !config.privateKey || !config.subject) return;
    const devices = await store.list();
    const vapidDetails = {
      subject: config.subject,
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    };
    await Promise.allSettled(
      devices
        .filter((device) => !device.workspaceIdentity || device.workspaceIdentity === event.workspaceIdentity)
        .map(async (device) => {
          try {
            // payload 需按设备生成以携带 deviceId（SW 诊断回调依赖它定位设备）。
            const payload = eventPayload(event, device.deviceId);
            await sendWithRetry(device, payload, {
              TTL: config.ttl,
              urgency: event.severity === "error" || event.severity === "warning" ? "high" : "normal",
              timeout: config.timeout,
              vapidDetails,
            });
            await store.markSuccess(device.deviceId);
          } catch (error) {
            const statusCode = getStatusCode(error);
            if (statusCode === 404 || statusCode === 410) {
              await store.revoke(device.deviceId);
              console.warn(
                JSON.stringify({
                  event: "notification.subscription.expired",
                  deviceId: device.deviceId,
                  statusCode,
                }),
              );
              return;
            }
            await store.markFailure(device.deviceId, describePushError(error, "delivery_failed"));
            console.warn(
              JSON.stringify({
                event: "notification.delivery.failed",
                notificationEventId: event.eventId,
                deviceId: device.deviceId,
                statusCode,
              }),
            );
          }
        }),
    );
  }
  return {
    config: () => ({ enabled: config.enabled, ...(config.publicKey ? { publicKey: config.publicKey } : {}) }),
    async listDevices() {
      return (await store.list()).map((device) => publicDevice(device as PushSubscriptionRecord));
    },
    async registerDevice(input) {
      if (!config.enabled) throw new Error("Push notifications are not configured on this server");
      const saved = await store.upsert(sanitizeInput(input));
      return { deviceId: saved.deviceId };
    },
    async revokeDevice(deviceId) {
      return store.revoke(deviceId);
    },
    async testDevice(deviceId) {
      if (!config.enabled || !config.publicKey || !config.privateKey || !config.subject) {
        throw new Error("Push notifications are not configured on this server");
      }
      const vapidDetails = {
        subject: config.subject,
        publicKey: config.publicKey,
        privateKey: config.privateKey,
      };
      const event: NotificationEvent = {
        eventId: `test-${randomUUID()}`,
        eventVersion: 1,
        type: "task.attention_required",
        createdAt: new Date().toISOString(),
        workspaceIdentity: "test",
        sessionId: "push-test",
        title: "ZCode push test",
        body: "Push notifications are working.",
        severity: "info",
      };
      const devices = await store.list();
      const targets = deviceId ? devices.filter((device) => device.deviceId === deviceId) : devices;
      console.info(JSON.stringify({
        event: "notification.push_test.started",
        deviceId: deviceId ?? null,
        targetCount: targets.length,
      }));
      if (targets.length === 0) throw new Error("No registered push device found");
      for (const device of targets) {
        try {
          const payload = eventPayload(event, device.deviceId);
          await sendWithRetry(device, payload, {
            TTL: 60,
            urgency: "high",
            timeout: config.timeout,
            vapidDetails,
          });
          await store.markSuccess(device.deviceId);
          console.info(JSON.stringify({
            event: "notification.push_test.succeeded",
            deviceId: device.deviceId,
          }));
        } catch (error) {
          const statusCode = getStatusCode(error);
          if (statusCode === 404 || statusCode === 410) await store.revoke(device.deviceId);
          else await store.markFailure(device.deviceId, describePushError(error, "test_failed"));
          throw error;
        }
      }
    },
    async recordDeviceDiagnostic(deviceId: string | undefined, stage: string, detail?: string) {
      const known = deviceId ? await store.markDiagnostic(deviceId, stage, detail) : false;
      console.info(
        JSON.stringify({
          event: "notification.sw_diagnostic",
          deviceId: deviceId ?? null,
          stage,
          known,
          ...(detail?.trim() ? { detail: detail.trim().slice(0, 240) } : {}),
        }),
      );
      return known;
    },
    dispose() {
      subscription.dispose();
    },
  };
}
