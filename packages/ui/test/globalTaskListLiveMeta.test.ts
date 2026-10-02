import assert from "node:assert/strict";
import test from "node:test";
import type { WindowHostControllerTaskListItem, ZCodeTaskListItem } from "@zcode/services";
import {
  deriveGlobalLiveStatus,
  mergeLiveMetaIntoItem,
  toGlobalTaskListRow,
} from "../src/v4/globalTaskListLiveMeta.ts";
import { getTaskListRowActivity } from "../src/v4/taskListRowActivity.ts";
import { deriveTaskLeadingIndicator } from "../src/lib/taskListItemPresentation.ts";

type GlobalTaskListItem = WindowHostControllerTaskListItem;

function buildItem(overrides: Partial<GlobalTaskListItem> = {}): GlobalTaskListItem {
  return {
    taskId: "session-1",
    traceId: "trace-1",
    title: "Example",
    workspacePath: "/ws/a",
    workspaceIdentity: "remote-a",
    createdAt: 1,
    updatedAt: 2,
    mode: "build",
    provider: "glm",
    status: "completed",
    liveStatus: "completed",
    sourceAvailability: "online",
    ...overrides,
  } as GlobalTaskListItem;
}

test("rows without live meta are returned untouched", () => {
  const item = buildItem();
  assert.equal(mergeLiveMetaIntoItem(item, undefined), item);
});

test("live running meta overrides the stale DB row and renders the running spinner", () => {
  // DB row still says completed because the terminal patch has not landed yet — the
  // global lane must trust the runtime meta and surface the spinner via the sidecar.
  const dbRow = buildItem({ status: "completed", liveStatus: "completed" });
  const live = buildItem({ status: "running", liveStatus: "running", updatedAt: 10 });
  const merged = mergeLiveMetaIntoItem(dbRow, live);
  assert.equal(merged.status, "running");
  assert.equal(merged.liveStatus, "running");
  assert.equal(merged.updatedAt, 10);
  assert.equal(getTaskListRowActivity(merged)?.phase, "running");
  assert.equal(deriveTaskLeadingIndicator(merged, getTaskListRowActivity(merged)), "loading");
});

test("persisted status=running without live meta never spins (stale-run guard)", () => {
  const dbRow = buildItem({ status: "running", liveStatus: "idle" });
  assert.equal(getTaskListRowActivity(dbRow), null);
  assert.equal(deriveTaskLeadingIndicator(dbRow, getTaskListRowActivity(dbRow)), "none");
});

test("leaving running detaches the sidecar so the spinner does not stick", () => {
  const running = mergeLiveMetaIntoItem(
    buildItem(),
    buildItem({ status: "running", liveStatus: "running", updatedAt: 10 }),
  );
  const done = mergeLiveMetaIntoItem(
    running,
    buildItem({ status: "completed", liveStatus: "completed", updatedAt: 11 }),
  );
  assert.equal(done.status, "completed");
  assert.equal(getTaskListRowActivity(done), null);
  assert.equal(deriveTaskLeadingIndicator(done, getTaskListRowActivity(done)), "none");
});

test("reloading merges the latest live meta instead of reverting live patches", () => {
  // Simulates the load() fix: every reload merges through the live-meta ref, so a fresh
  // DB snapshot must not revert status/pendingInteraction until the runtime says so.
  const live = buildItem({
    status: "running",
    liveStatus: "running",
    updatedAt: 10,
    pendingInteraction: { interactionId: "i-1", kind: "permission" },
  });
  const first = mergeLiveMetaIntoItem(buildItem(), live);
  const reloaded = mergeLiveMetaIntoItem(buildItem(), live);
  assert.equal(reloaded.status, "running");
  assert.deepEqual(reloaded.pendingInteraction, first.pendingInteraction);
  assert.equal(reloaded.pendingInteraction?.interactionId, "i-1");
});

test("merging identical live meta is reference-stable to avoid row churn", () => {
  const live = buildItem({ status: "running", liveStatus: "running", updatedAt: 10 });
  const once = mergeLiveMetaIntoItem(buildItem(), live);
  const twice = mergeLiveMetaIntoItem(once, live);
  assert.equal(twice, once);
});

test("deriveGlobalLiveStatus maps unknown statuses to idle", () => {
  assert.equal(deriveGlobalLiveStatus("running"), "running");
  assert.equal(deriveGlobalLiveStatus("completed"), "completed");
  assert.equal(deriveGlobalLiveStatus("error"), "error");
  assert.equal(deriveGlobalLiveStatus(undefined), "idle");
});

test("raw tasks-index rows are enriched into controller rows before the live merge", () => {
  const dbRow = {
    taskId: "session-2",
    traceId: "trace-2",
    title: "From disk",
    workspacePath: "/ws/b",
    createdAt: 5,
    updatedAt: 6,
    mode: "build",
    provider: "glm",
    status: "running",
  } as ZCodeTaskListItem;
  const enriched = toGlobalTaskListRow(dbRow, undefined);
  assert.equal(enriched.sourceAvailability, "online");
  assert.equal(enriched.liveStatus, "running");
  // Persisted running alone never spins — enrichment must not fake a sidecar.
  assert.equal(getTaskListRowActivity(enriched), null);

  const live = buildItem({ status: "running", liveStatus: "running", updatedAt: 10 });
  const merged = toGlobalTaskListRow(dbRow, live);
  assert.equal(getTaskListRowActivity(merged)?.phase, "running");
  assert.equal(deriveTaskLeadingIndicator(merged, getTaskListRowActivity(merged)), "loading");
});
