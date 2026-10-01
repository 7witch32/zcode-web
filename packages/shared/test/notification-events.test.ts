import assert from "node:assert/strict";
import test from "node:test";
import {
  createNotificationEventId,
  isNotificationEvent,
  notificationEventSchema,
  parseNotificationEvent,
} from "../src/notification-events.ts";

const baseIdentity = {
  type: "task.completed" as const,
  workspaceIdentity: "workspace-a",
  sessionId: "session-1",
  transitionId: "session-1:completedSuccess:123",
};

test("notification event IDs are deterministic", () => {
  assert.equal(createNotificationEventId(baseIdentity), createNotificationEventId(baseIdentity));
  assert.notEqual(
    createNotificationEventId(baseIdentity),
    createNotificationEventId({ ...baseIdentity, transitionId: "different" }),
  );
});
test("notification event schema accepts a valid event", () => {
  const event = {
    eventId: createNotificationEventId(baseIdentity),
    eventVersion: 1 as const,
    type: "task.completed" as const,
    createdAt: "2026-10-01T10:00:00.000Z",
    workspaceIdentity: "workspace-a",
    sessionId: "session-1",
    title: "Build project",
    body: "Task completed",
    severity: "success" as const,
    deepLink: "/session/session-1",
  };

  assert.deepEqual(parseNotificationEvent(event), event);
  assert.equal(isNotificationEvent(event), true);
  assert.equal(notificationEventSchema.safeParse(event).success, true);
});

test("notification event schema rejects external deep links", () => {
  const event = {
    eventId: "event-1",
    eventVersion: 1,
    type: "task.completed",
    createdAt: "2026-10-01T10:00:00.000Z",
    workspaceIdentity: "workspace-a",
    sessionId: "session-1",
    title: "Build project",
    body: "Task completed",
    severity: "success",
    deepLink: "https://example.com/session/session-1",
  };

  assert.equal(notificationEventSchema.safeParse(event).success, false);
});
test("notification event schema rejects oversized copy", () => {
  const event = {
    eventId: "event-1",
    eventVersion: 1,
    type: "task.completed",
    createdAt: "2026-10-01T10:00:00.000Z",
    workspaceIdentity: "workspace-a",
    sessionId: "session-1",
    title: "x".repeat(121),
    body: "Task completed",
    severity: "success",
  };

  assert.equal(notificationEventSchema.safeParse(event).success, false);
});
