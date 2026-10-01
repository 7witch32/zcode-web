import { createNotificationEventId, type NotificationEvent } from "@zcode/shared";
import type { Event, IDisposable } from "@zcode/rpc";
import type {
  ZCodeTaskIndexInteractionEvent,
  ZCodeTaskIndexTerminalEvent,
  ZCodeTaskIndexSyncer,
} from "#src/zcode-agent/zcodeTaskIndexSyncer.js";
import { publishNotificationEvent, notificationEvents } from "./notificationEventBus.js";

export interface NotificationEventService {
  onEvent: Event<NotificationEvent>;
  dispose(): void;
}

function buildInteractionEvent(event: ZCodeTaskIndexInteractionEvent): NotificationEvent {
  const workspaceIdentity = event.target.workspaceIdentity?.trim() || event.target.workspacePath;
  return {
    eventId: createNotificationEventId({
      type: "interaction.pending",
      workspaceIdentity,
      sessionId: event.target.sessionId,
      transitionId: event.transitionId,
      interactionId: event.interactionId,
    }),
    eventVersion: 1,
    type: "interaction.pending",
    createdAt: new Date().toISOString(),
    workspaceIdentity,
    sessionId: event.target.sessionId,
    title: event.title,
    body: event.kind === "permission" ? "Approval required" : "Your response is required",
    severity: "warning",
  };
}

export function buildTerminalEvent(event: ZCodeTaskIndexTerminalEvent): NotificationEvent {
  const type =
    event.terminalOutcome === "failed"
      ? "task.failed"
      : event.terminalOutcome === "stopped"
        ? "task.stopped"
        : "task.completed";
  const severity =
    event.terminalOutcome === "failed"
      ? "error"
      : event.terminalOutcome === "stopped"
        ? "warning"
        : "success";
  const body =
    event.terminalOutcome === "failed"
      ? "Task failed"
      : event.terminalOutcome === "stopped"
        ? "Task stopped"
        : "Task completed";
  const workspaceIdentity = event.target.workspaceIdentity?.trim() || event.target.workspacePath;
  const eventId = createNotificationEventId({
    type,
    workspaceIdentity,
    sessionId: event.target.sessionId,
    transitionId: event.transitionId,
  });
  return {
    eventId,
    eventVersion: 1,
    type,
    createdAt: new Date().toISOString(),
    workspaceIdentity,
    sessionId: event.target.sessionId,
    title: event.title,
    body,
    severity,
  };
}

export function createNotificationEventService(
  syncer: ZCodeTaskIndexSyncer,
): NotificationEventService {
  const publishSafely = (event: NotificationEvent): void => {
    try {
      publishNotificationEvent(event);
    } catch {
      // Notification creation is best-effort and must never affect task settlement.
    }
  };
  const terminalDisposable: IDisposable = syncer.onSessionTerminalEvent((event) => {
    publishSafely(buildTerminalEvent(event));
  });
  const interactionDisposable: IDisposable = syncer.onSessionInteractionEvent((event) => {
    publishSafely(buildInteractionEvent(event));
  });

  return {
    onEvent: notificationEvents,
    dispose() {
      terminalDisposable.dispose();
      interactionDisposable.dispose();
    },
  };
}
