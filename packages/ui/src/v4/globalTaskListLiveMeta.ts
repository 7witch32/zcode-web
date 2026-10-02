import type { WindowHostControllerTaskListItem, ZCodeTaskListItem } from "@zcode/services";
import {
  attachTaskListRowActivity,
  detachTaskListRowActivity,
  getTaskListRowActivity,
} from "@/v4/taskListRowActivity.js";

type GlobalTaskListItem = WindowHostControllerTaskListItem;

/**
 * Map a merged task status onto the v4 controller liveStatus contract. The global lane
 * has no "waiting" evidence of its own — the pendingInteraction badge renders separately
 * from task.pendingInteraction — so everything that is not running/completed/error is
 * reported as "idle".
 */
export function deriveGlobalLiveStatus(
  status: GlobalTaskListItem["status"],
): GlobalTaskListItem["liveStatus"] {
  if (status === "completed") {
    return "completed";
  }
  if (status === "error") {
    return "error";
  }
  if (status === "running") {
    return "running";
  }
  return "idle";
}

/**
 * Merge one row with its runtime-authoritative live meta (the workspace_task_list_changed
 * "*" events replayed/patched into useGlobalTaskList).
 *
 * Live meta comes from the syncer's in-memory summaries, not from tasks-index DB rows, so
 * it must win over the DB snapshot on every merge path (fresh loads and in-place patches
 * share this helper to keep a single write path).
 *
 * "running" only ever surfaces as a row activity sidecar while the live meta itself says
 * running — persisted DB status=running is never proof enough (stale-run guard, see
 * deriveTaskLeadingIndicator). The sidecar is detached as soon as the runtime leaves
 * running so the spinner cannot stick to a finished row, and it is what makes the sidebar
 * render the running spinner for sessions in projects that were never opened (their rows
 * can never carry a controller activity sidecar).
 */
export function mergeLiveMetaIntoItem(
  item: GlobalTaskListItem,
  liveMeta: GlobalTaskListItem | undefined,
): GlobalTaskListItem {
  if (!liveMeta) {
    return item;
  }
  const status = liveMeta.status ?? item.status;
  const updatedAt = liveMeta.updatedAt ?? item.updatedAt;
  const pendingInteraction = liveMeta.pendingInteraction;
  const liveStatus = deriveGlobalLiveStatus(status);
  const wantsRunningSidecar = liveMeta.status === "running";
  const hasRunningSidecar = getTaskListRowActivity(item) !== null;
  if (
    item.status === status &&
    item.pendingInteraction === pendingInteraction &&
    item.updatedAt === updatedAt &&
    item.liveStatus === liveStatus &&
    hasRunningSidecar === wantsRunningSidecar
  ) {
    return item;
  }
  const merged: GlobalTaskListItem = {
    ...detachTaskListRowActivity(item),
    status,
    pendingInteraction,
    updatedAt,
    sourceAvailability: "online",
    liveStatus,
  };
  if (!wantsRunningSidecar) {
    return merged;
  }
  return attachTaskListRowActivity(merged, {
    phase: "running",
    lastActivityAt: updatedAt,
    hasBackgroundWork: false,
  });
}

/**
 * Enrich a raw tasks-index row (`listTaskList` result) into the controller row shape the
 * global lane renders, then apply the live meta. tasks-index rows carry neither
 * `liveStatus` nor `sourceAvailability`; the old inline map always filled them, so this
 * keeps the enrichment in one place instead of letting partially-typed rows into state.
 */
export function toGlobalTaskListRow(
  item: ZCodeTaskListItem,
  liveMeta: GlobalTaskListItem | undefined,
): GlobalTaskListItem {
  return mergeLiveMetaIntoItem(
    {
      ...item,
      sourceAvailability: "online",
      liveStatus: deriveGlobalLiveStatus(item.status),
    },
    liveMeta,
  );
}
