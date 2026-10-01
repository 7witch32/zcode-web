import { z } from "zod";

export const NOTIFICATION_EVENT_VERSION = 1 as const;
export const NOTIFICATION_EVENT_MAX_TITLE_LENGTH = 120;
export const NOTIFICATION_EVENT_MAX_BODY_LENGTH = 240;
export const NOTIFICATION_EVENT_MAX_DEEP_LINK_LENGTH = 512;

export const notificationEventTypeSchema = z.enum([
  "task.completed",
  "task.failed",
  "task.stopped",
  "interaction.pending",
  "task.attention_required",
]);

export const notificationEventSeveritySchema = z.enum(["info", "success", "warning", "error"]);

const safeText = (max: number) => z.string().trim().min(1).max(max);
const deepLinkSchema = z
  .string()
  .trim()
  .max(NOTIFICATION_EVENT_MAX_DEEP_LINK_LENGTH)
  .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
    message: "Notification deep links must be application-relative paths",
  })
  .optional();
export const notificationEventSchema = z.object({
  eventId: z.string().trim().min(1).max(2048),
  eventVersion: z.literal(NOTIFICATION_EVENT_VERSION),
  type: notificationEventTypeSchema,
  createdAt: z.string().datetime({ offset: true }),
  workspaceIdentity: z.string().trim().min(1).max(512),
  sessionId: z.string().trim().min(1).max(256),
  title: safeText(NOTIFICATION_EVENT_MAX_TITLE_LENGTH),
  body: safeText(NOTIFICATION_EVENT_MAX_BODY_LENGTH),
  severity: notificationEventSeveritySchema,
  deepLink: deepLinkSchema,
  metadata: z.record(z.string(), z.string().max(512)).optional(),
}).strict();

export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>;
export type NotificationEventSeverity = z.infer<typeof notificationEventSeveritySchema>;
export type NotificationEvent = z.infer<typeof notificationEventSchema>;

export interface NotificationEventIdentity {
  type: NotificationEventType;
  workspaceIdentity: string;
  sessionId: string;
  transitionId: string;
  interactionId?: string;
}
function encodeEventIdentityPart(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Creates a deterministic logical ID. It is intentionally not a random UUID:
 * every delivery channel must be able to derive the same identity from one
 * authoritative transition without sharing channel-local state.
 */
export function createNotificationEventId(identity: NotificationEventIdentity): string {
  const parts = [
    "zcode-notification",
    String(NOTIFICATION_EVENT_VERSION),
    identity.type,
    identity.workspaceIdentity,
    identity.sessionId,
    identity.transitionId,
    identity.interactionId ?? "",
  ];
  return parts.map(encodeEventIdentityPart).join(".");
}

export function parseNotificationEvent(value: unknown): NotificationEvent {
  return notificationEventSchema.parse(value);
}

export function isNotificationEvent(value: unknown): value is NotificationEvent {
  return notificationEventSchema.safeParse(value).success;
}
