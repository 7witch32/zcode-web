import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  WindowHostControllerTaskListItem,
  ZCodeTaskListKind,
  ZCodeTaskListWorkspaceScope,
} from "@zcode/services";
import { logger } from "@/logger.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import type { WorkspaceTabState } from "@/store/tabStore.js";
import { selectWorkspaceZCodeState, useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { attachTaskListRowActivity } from "@/v4/taskListRowActivity.js";
import { mergeLiveMetaIntoItem, toGlobalTaskListRow } from "@/v4/globalTaskListLiveMeta.js";
import { stabilizeTaskListItems } from "@/v4/taskListItemStabilization.js";
import { getWindowControllerTaskListRegistry } from "@/v4/windowControllerTaskListRegistry.js";
import type { WindowControllerTaskListVersion } from "@/v4/windowControllerTaskListRegistry.js";

type GlobalTaskListItem = WindowHostControllerTaskListItem;

const subscribeToNothing = () => () => {};
const zeroRevision = () => 0;

function buildWorkspaceScopes(workspaceTabs: WorkspaceTabState[]): ZCodeTaskListWorkspaceScope[] {
  const scopes = new Map<string, ZCodeTaskListWorkspaceScope>();
  for (const tab of workspaceTabs) {
    const scope = {
      workspacePath: tab.workspacePath,
      ...(tab.workspaceIdentity ? { workspaceIdentity: tab.workspaceIdentity } : {}),
    };
    scopes.set(
      JSON.stringify([tab.workspaceIdentity?.trim() || tab.workspacePath, tab.workspacePath]),
      scope,
    );
  }
  return Array.from(scopes.values());
}

export function useGlobalTaskList(params: {
  kind: ZCodeTaskListKind;
  workspaceTabs: WorkspaceTabState[];
  includeAllWorkspaces?: boolean;
  enabled?: boolean;
  sortBy: "created" | "updated";
  searchQuery: string;
  expanded: boolean;
  collapsedLimit: number;
}) {
  const enabled = params.enabled !== false;
  const baseServices = useBaseWorkspaceServices();
  // The window-controller live lane only exists on the desktop host. The web client
  // always builds the service proxy, so without this gate every page load subscribes
  // to an unregistered channel and the server logs "Unknown channel: window-controller".
  // useOptionalPlatform (not usePlatform) keeps provider-less hosts (share previews) safe.
  const platformKind = useOptionalPlatform()?.platformKind;
  const controller = platformKind === "web" ? null : baseServices.windowControllerService;
  const controllerRegistry = useMemo(
    () => (controller ? getWindowControllerTaskListRegistry(controller) : null),
    [controller],
  );
  const controllerRevision = useSyncExternalStore(
    controllerRegistry?.subscribe ?? subscribeToNothing,
    controllerRegistry?.getRevision ?? zeroRevision,
    controllerRegistry?.getRevision ?? zeroRevision,
  );
  const workspaceSignature = JSON.stringify(
    params.workspaceTabs
      .map(
        (tab) => [tab.workspaceIdentity?.trim() || tab.workspacePath, tab.workspacePath] as const,
      )
      .sort(
        ([leftKey, leftPath], [rightKey, rightPath]) =>
          leftKey.localeCompare(rightKey) || leftPath.localeCompare(rightPath),
      ),
  );
  const workspaceSourceGenerationSignature = JSON.stringify(
    params.workspaceTabs
      .map(
        (tab) =>
          [
            tab.workspaceIdentity?.trim() || tab.workspacePath,
            tab.workspacePath,
            tab.remoteSessionId?.trim() || null,
          ] as const,
      )
      .sort(
        ([leftKey, leftPath, leftSession], [rightKey, rightPath, rightSession]) =>
          leftKey.localeCompare(rightKey) ||
          leftPath.localeCompare(rightPath) ||
          (leftSession ?? "").localeCompare(rightSession ?? ""),
      ),
  );
  const workspaceScopes = useMemo(
    () => buildWorkspaceScopes(params.workspaceTabs),
    // workspaceSignature 是标准化后的 scope 值签名，避免父组件重建 tabs 数组时重复查询。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceSignature],
  );
  const taskListVersionSignature = useZCodeSessionStore((state) =>
    JSON.stringify(
      params.workspaceTabs
        .map((tab) => {
          const workspace = selectWorkspaceZCodeState(
            state,
            tab.workspacePath,
            tab.workspaceIdentity,
          );
          return [
            tab.workspaceIdentity?.trim() || tab.workspacePath,
            workspace.taskListVersion,
          ] as const;
        })
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
  const [items, setItems] = useState<GlobalTaskListItem[]>([]);
  const [liveMetaByTaskKey, setLiveMetaByTaskKey] = useState<Map<string, GlobalTaskListItem>>(
    () => new Map(),
  );
  const itemsRef = useRef<GlobalTaskListItem[]>(items);
  // Render-synced mirror for load(): the load callback intentionally omits
  // liveMetaByTaskKey from its deps so controller/taskList version bumps do not trigger a
  // fresh query on every live event, but every reload must still merge the LATEST live
  // meta — reading the state inside load would capture a stale closure and silently
  // revert live patches (status/pendingInteraction) until the next event for that task.
  const liveMetaRef = useRef(liveMetaByTaskKey);
  liveMetaRef.current = liveMetaByTaskKey;
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(
    enabled && (params.includeAllWorkspaces || workspaceScopes.length > 0),
  );
  const requestSerialRef = useRef(0);
  const manualRefreshSerialRef = useRef(0);

  const query = useMemo(
    () => ({
      kind: params.kind,
      workspaceScopes,
      ...(params.includeAllWorkspaces ? { includeAllWorkspaces: true } : {}),
      sortBy: params.sortBy,
      search: params.searchQuery.trim() || undefined,
      limit: params.expanded ? undefined : params.collapsedLimit,
    }),
    [
      params.collapsedLimit,
      params.expanded,
      params.kind,
      params.searchQuery,
      params.sortBy,
      workspaceScopes,
      params.includeAllWorkspaces,
    ],
  );
  const queryKey = useMemo(() => JSON.stringify(query), [query]);

  useEffect(() => {
    if (!enabled || !params.includeAllWorkspaces) {
      setLiveMetaByTaskKey(new Map());
      return;
    }
    // Reconcile on every (re)subscription: the syncer replays a fresh snapshot right after
    // this registration returns, so entries from a previous (possibly dead) ingest must
    // not outlive it with merge priority over the DB rows.
    setLiveMetaByTaskKey(new Map());
    const service = baseServices.zcodeTaskService;
    const disposable = service.onDynamicWorkspaceEvent("*")((event) => {
      if (event.type !== "workspace_task_list_changed") {
        return;
      }
      const taskId = event.taskId ?? event.taskMeta?.taskId;
      if (!taskId) return;
      const workspaceKey =
        event.workspaceIdentity?.trim() ||
        event.workspacePath ||
        event.taskMeta?.workspaceIdentity?.trim() ||
        event.taskMeta?.workspacePath ||
        "";
      const key = `${workspaceKey}::${taskId}`;
      if (event.reason === "task_deleted") {
        setLiveMetaByTaskKey((current) => {
          if (!current.has(key)) return current;
          const next = new Map(current);
          next.delete(key);
          return next;
        });
        return;
      }
      const taskMeta = event.taskMeta;
      if (!taskMeta) return;
      setLiveMetaByTaskKey((current) => {
        const previous = current.get(key);
        const next = new Map(current);
        next.set(key, {
          ...previous,
          ...taskMeta,
          pendingInteraction:
            event.reason === "task_status_changed"
              ? taskMeta.pendingInteraction
              : previous?.pendingInteraction,
        } as GlobalTaskListItem);
        return next;
      });
    });
    return () => disposable.dispose();
  }, [baseServices.zcodeTaskService, enabled, params.includeAllWorkspaces]);

  useEffect(() => {
    if (!enabled || !params.includeAllWorkspaces || liveMetaByTaskKey.size === 0) {
      return;
    }
    setItems((current) => {
      const next = current.map((item) => {
        const workspaceKey = item.workspaceIdentity?.trim() || item.workspacePath;
        return mergeLiveMetaIntoItem(
          item,
          liveMetaByTaskKey.get(`${workspaceKey}::${item.taskId}`),
        );
      });
      if (next.every((item, index) => item === current[index])) {
        return current;
      }
      itemsRef.current = next;
      return next;
    });
  }, [enabled, liveMetaByTaskKey, params.includeAllWorkspaces]);

  const load = useCallback(
    async (version: WindowControllerTaskListVersion) => {
      const requestSerial = ++requestSerialRef.current;
      if (!enabled) {
        setItems([]);
        itemsRef.current = [];
        setTotal(0);
        setHasMore(false);
        setLoading(false);
        return;
      }
      if (workspaceScopes.length === 0 && !params.includeAllWorkspaces) {
        setItems([]);
        itemsRef.current = [];
        setTotal(0);
        setHasMore(false);
        setLoading(false);
        return;
      }
      if (!params.includeAllWorkspaces && !controllerRegistry) {
        // 原子切换后 base attachment 必须提供 Controller；缺失代表 Host/Renderer 版本不一致。
        logger.error("[useGlobalTaskList] window Host Controller channel unavailable");
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        let result: {
          items: GlobalTaskListItem[];
          total: number;
          hasMore: boolean;
        };
        if (params.includeAllWorkspaces) {
          const response = await baseServices.zcodeTaskService.listTaskList(query);
          result = {
            ...response,
            // Read live meta through the ref (not the state): the dep array above
            // deliberately excludes it, so the ref is what keeps reloads from merging a
            // stale live-meta snapshot over fresher DB rows.
            items: response.items.map((item) => {
              const workspaceKey = item.workspaceIdentity?.trim() || item.workspacePath;
              return toGlobalTaskListRow(
                item,
                liveMetaRef.current.get(`${workspaceKey}::${item.taskId}`),
              );
            }),
          };
        } else {
          if (!controllerRegistry) {
            throw new Error("window Host Controller channel unavailable");
          }
          result = await controllerRegistry.list(queryKey, version, query);
        }
        if (requestSerialRef.current !== requestSerial) {
          return;
        }
        // Controller 的每个 activity 帧（运行中任务的 tool 调用等）都会让本 hook 重查，
        // 而 attachTaskListRowActivity 与 tasks-index join 每次都产生全新对象。下游（grouped 视图）
        // 只能按引用判等，于是整棵列表树换代重渲染并重测量虚拟器。这里与 sessions-index lane 同款
        // 逐条引用稳定化：内容等价复用旧对象，整表等价复用旧数组。
        const nextItems = stabilizeTaskListItems(
          itemsRef.current,
          result.items.map((item) =>
            item.activity ? attachTaskListRowActivity(item, item.activity) : item,
          ),
        );
        itemsRef.current = nextItems;
        setItems(nextItems);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (error) {
        if (requestSerialRef.current === requestSerial) {
          // Controller 查询失败时保留最后可信列表，避免单 source 异常清空其他 workspace。
          logger.error(`[useGlobalTaskList] Controller 加载 ${params.kind} 列表失败`, error);
        }
      } finally {
        if (requestSerialRef.current === requestSerial) {
          setLoading(false);
        }
      }
    },
    [
      controllerRegistry,
      enabled,
      params.kind,
      query,
      queryKey,
      workspaceScopes,
      params.includeAllWorkspaces,
    ],
  );

  const refresh = useCallback(async () => {
    manualRefreshSerialRef.current += 1;
    await load({
      controllerRevision,
      taskListVersionSignature,
      workspaceSourceGenerationSignature,
      manualRefreshSerial: manualRefreshSerialRef.current,
    });
  }, [controllerRevision, load, taskListVersionSignature, workspaceSourceGenerationSignature]);

  useEffect(() => {
    if (!enabled) {
      void load({
        controllerRevision,
        taskListVersionSignature,
        workspaceSourceGenerationSignature,
      });
      return;
    }
    // 远程 workspace 从断开占位恢复为在线 session 时 identity/path 不变，
    // taskListVersion 也可能尚未变化，旧缓存因此永久保留连接前的空结果。remoteSessionId
    // 只作为 source 代际触发重查，不改变 workspaceIdentity 与 Controller 查询契约。
    void load({
      controllerRevision,
      taskListVersionSignature,
      workspaceSourceGenerationSignature,
    });
  }, [
    controllerRevision,
    enabled,
    load,
    taskListVersionSignature,
    workspaceSourceGenerationSignature,
  ]);

  const hasRemoteScope = params.workspaceTabs.some((tab) => Boolean(tab.workspaceIdentity));
  return {
    items,
    total,
    hasMore,
    loading,
    syncingRemoteWorkspaces: loading && hasRemoteScope,
    refresh,
  };
}
