import assert from "node:assert/strict";
import test from "node:test";
import { buildTerminalEvent } from "../src/notifications/notificationEventService.ts";
import type { ZCodeTaskIndexTerminalEvent } from "../src/zcode-agent/zcodeTaskIndexSyncer.ts";

const base = {
  target: { workspacePath: "D:/workspace", workspaceIdentity: "workspace-1", sessionId: "session-1" },
  kind: "turn.completed" as const,
  transitionId: "session-1:completedInterrupted:123",
  title: "Example task",
};

test("completedInterrupted becomes task.stopped", () => {
  const event = buildTerminalEvent({ ...base, terminalOutcome: "stopped" });
  assert.equal(event.type, "task.stopped");
  assert.equal(event.severity, "warning");
  assert.equal(event.body, "Task stopped");
});

test("failed terminal becomes task.failed", () => {
  const event = buildTerminalEvent({ ...base, kind: "turn.failed", terminalOutcome: "failed" });
  assert.equal(event.type, "task.failed");
  assert.equal(event.severity, "error");
});