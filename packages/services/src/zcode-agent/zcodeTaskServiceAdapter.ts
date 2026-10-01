/* oxlint-disable eslint(max-lines) -- è¿ç§»æœŸéœ€è¦åœ¨ä¸€ä¸ªé—¨é¢é‡Œé›†ä¸­ç»´æŠ¤æ—§ task projection åˆ° ZCode session çš„åè®®é€‚é…ã€‚ */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Emitter,
  Event,
  emitNetworkTelemetryObservation,
  type NetworkObservation,
} from "@zcode/rpc";
import {
  coalesceConsecutiveZCodeAssistants,
  createSessionTraceId,
  decodeCustomModelValue,
  deriveZCodeTaskStatusFromSessionSnapshot,
  extractPlanStepsFromToolInput,
  extractPlanStepsFromToolOutput,
  generateTraceId,
  getZCodeGoalActiveIterationCount,
  getZCodeGoalIterationByAssistantMessageId,
  getZCodeUserVisibleMessages,
  isMainAgentToolProjectionSource,
  normalizeZCodeApiRetryStatus,
  attachZCodeBackgroundTaskNotificationToRaw,
  collectZCodeBackgroundTaskNotificationsByToolUseId,
  mergeZCodeBackgroundTaskControlItems,
  parseZCodeBackgroundTaskControlItems,
  parseZCodeBackgroundTaskNotificationText,
  parseModelPickerValue as parseSharedModelSelection,
  resolveWorkspaceKey,
  resolveZCodeVisibleSessionTitle,
  textFromZCodeMessageParts,
  ZCODE_AGENT_PROVIDER,
  zcodeBackgroundTaskNotificationToolUpdateStatus,
  appendZCodeStreamingToolInputDelta,
  buildZCodeStreamingToolInputPreview,
  createZCodeToolProjectionMemory,
  finalizeZCodeToolProjectionInput,
  forgetZCodeToolProjectionMetadata,
  isZCodeModelRetryRecoveryProgressPayload,
  markZCodeStreamingToolInputPreviewMaterialized,
  resolveZCodeToolProjectionMetadata,
  zcodeApiRetryFromModelNetworkStatusPayload,
  zcodeApiRetryFromStreamRecoveryPayload,
  zcodeTaskNetworkDebugStatusFromPayload,
  shouldMaterializeZCodeStreamingToolInputPreview,
  type ZCodeApiRetryStatus,
  type ZCodeAssistantMessageFeedback,
  type ZCodeBackgroundTaskNotificationInfo,
  type ZCodeBackgroundTaskControlItem,
  type ZCodeBackgroundTurnAttribution,
  type ZCodeAutomationBotDeliveryTarget,
  type ZCodeCancelTaskCommandResult,
  type ZCodeConfigOption,
  type ZCodeEnqueueTaskCommandResult,
  type ZCodeError,
  type ZCodeGoalVerificationTimelineMeta,
  type ZCodeImportSessionsResult,
  type ZCodeImportableSessionCandidate,
  type ZCodeUsage,
  type ZCodePersistedMessage,
  type ZCodePersistedMessagePart,
  type ZCodePersistedToolCall,
  type ZCodePromptAttachment,
  type ZCodeProvider,
  type ZCodeSessionFile,
  type ZCodeTaskGoal,
  type ZCodeTaskGoalStats,
  type ZCodeTaskMode,
  type ZCodePlanStep,
  type ZCodeSlashCommand,
  type ZCodeStreamEvent,
  type ZCodeTaskCreateResult,
  type ZCodeTaskMeta,
  type ZCodeTaskClientMode,
  type ZCodeTaskRuntimeCommand,
  type ZCodeTaskSnapshot,
  type ZCodeTaskSnapshotBody,
  type ZCodeTaskSnapshotRefContent,
  type ZCodeTaskSnapshotToolCallsSlice,
  type ZCodeTaskTokenUsageResult,
  type ZCodeTodoGroup,
  type ZCodeTurnSteerCommandKind,
  type ZCodeTurnSteerSource,
  type ZCodeWorkspaceEvent,
  type ZCodeWorkspaceTaskListChanged,
  type InputId,
  type TraceId,
  zcodeContextUsageBreakdownSchema,
  zcodeSessionSettingsStateSchema,
  type ZCodeDeliveryKind,
  type ZCodeMessagePart,
  type ZCodeMessageWithParts,
  type ModelSelection,
  type ZCodePermissionOption,
  type ZCodePermissionRequestParams,
  type ZCodePermissionRequest,
  type ZCodeSessionEvent,
  type ZCodeSessionMode,
  type ZCodeSessionSettingsState,
  type ZCodeSessionStateSnapshot,
  type ZCodeStateUpdatedNotification,
  type ZCodeContextCompactionTimelineMeta,
  type ZCodeTimelineMeta,
  type ZCodeTimelineStatus,
  type ZCodeTimelineTrigger,
  type ZCodeToolProjectionMemory,
  type ZCodeUserInputRequestParams,
  type ZCodeUserInputResponse,
  type ZCodeAgentMcpServer,
} from "@zcode/shared";
import type {
  ZCodeTaskListQuery,
  ZCodeTaskListResult,
  ZCodeWorkspaceEventSubscriptionParams,
  IZCodeTaskService,
  ZCodeArchivedTaskDeletionResult,
  ZCodeTaskReadyOutcome,
  ZCodeTaskTerminalOutcome,
} from "../session/zcodeTaskService.js";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import {
  AUTOMATION_MUTATION_TOOL_NAMES,
  OFF_PEAK_MUTATION_TOOL_NAMES,
} from "#src/zcode-agent/automationToolPolicy.js";
import type { ISettingService } from "#src/setting/setting.js";
import type {
  SessionMessageDeliveryResult,
  SessionMessageSendRequested,
} from "#src/session/sessionMailbox.js";
import { TaskIndexRepo } from "#src/session/taskIndexRepo.js";
import type {
  IZCodeAgentService,
  ZCodeAgentServiceEvent,
  ZCodeAgentWorkspaceTarget,
} from "./zcodeAgent.js";
import type {
  ZCodeTaskIndexReadyEvent,
  ZCodeTaskIndexSyncer,
  ZCodeTaskIndexTerminalEvent,
} from "./zcodeTaskIndexSyncer.js";
import { readModelTrajectory } from "./modelTrajectory.js";
import { errorAttributionSchema, type CommandPayloadMap } from "@zcode/shared/zcode-protocol-v4";
import {
  assertV4CommandAckOk,
  createHostCommandEnvelope,
  sendHostCasCommandV4,
} from "./zcodeV4HostCommand.js";
import { claudeNativeSessionImportRepo } from "#src/session/claude-native/claudeNativeSessionImportRepo.js";
import { importClaudeNativeSessions } from "#src/session/claude-native/claudeNativeSessionImportService.js";
import { buildImportedClaudeTaskId } from "#src/session/claude-native/buildImportedClaudeTaskFile.js";
import {
  readLegacyImportedClaudeHistory,
  repairImportedClaudeSessionSnapshot,
} from "#src/session/claude-native/importedClaudeHistoryRepair.js";
import {
  MODEL_CONFIG_ID,
  MODE_CONFIG_ID,
  THOUGHT_LEVEL_CONFIG_ID,
  formatTaskMetaModelSelectionFromSnapshot,
  formatModelPickerValue,
  getZCodeAgentAvailableModes,
  normalizeAvailableZCodeMode,
  settingsToConfigOptions,
} from "./zcodeConfigOptions.js";
import type { CuaProductMcpServerResolver } from "#src/cua-permission-broker/index.js";
import { registerMemoryDiagnosticsProvider } from "#src/memoryDiagnostics.js";

interface TaskOverlay {
  archived?: boolean;
  deleted?: boolean;
  pinned?: boolean;
  title?: string;
  unreadAt?: number;
}

interface CreateZCodeTaskServiceAdapterOptions {
  zcodeAgentService: IZCodeAgentService;
  taskIndexRepo?: TaskIndexRepo;
  // syncer çŽ°åœ¨æŒæœ‰ workspace emitter å’Œ broadcast å…¥å£ï¼Œadapter å¿…é¡»å…±ç”¨åŒä¸€å®žä¾‹ï¼Œ
  // å¦åˆ™ desktop-continuous è·¯å¾„å’Œ task adapter è·¯å¾„çš„äº‹ä»¶è®¢é˜…ä¼šåˆ†è£‚æˆä¸¤ä»½ï¼ŒUI æ”¶ä¸å…¨ã€‚
  taskIndexSyncer: ZCodeTaskIndexSyncer;
  settingService?: Pick<ISettingService, "get">;
  cuaProductMcpServerResolver?: CuaProductMcpServerResolver;
}

interface TaskTarget {
  taskId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  cronAutomationId?: string;
  remoteSessionId?: string;
}

interface TaskTargetWithMcpServers extends TaskTarget {
  model?: string;
  thoughtLevel?: string;
  mcpServers?: ZCodeAgentMcpServer[];
  toolDenylist?: string[];
}

type WorkspaceEventInput = string | ZCodeWorkspaceEventSubscriptionParams;
type ZCodeSendPromptRuntimeCommand = Extract<ZCodeTaskRuntimeCommand, { type: "send_prompt" }>;
type ZCodeTerminalStreamEvent =
  | Extract<ZCodeStreamEvent, { type: "task_complete" }>
  | Extract<ZCodeStreamEvent, { type: "task_error" }>;

const GLM_PROVIDER: ZCodeProvider = ZCODE_AGENT_PROVIDER;
const EMPTY_SLASH_COMMANDS: ZCodeSlashCommand[] = [];
const logger = createServiceLogger("zcode-task-service");
const ASK_USER_QUESTION_TOOL_NAME = "AskUserQuestion";
const EXIT_PLAN_MODE_TOOL_NAME = "ExitPlanMode";
const EXIT_PLAN_MODE_APPROVAL_QUESTION = "Review this implementation plan.";
const EXIT_PLAN_MODE_APPROVAL_APPROVE = "approve";

function sameModelSelection(
  left: ModelSelection | undefined,
  right: ModelSelection | undefined,
): boolean {
  return (
    left?.providerId === right?.providerId &&
    left?.modelId === right?.modelId &&
    left?.options?.reasoningLevel === right?.options?.reasoningLevel
  );
}
const MAX_LIVE_TOOL_PROJECTION_TASKS = 128;
const MAX_LIVE_TOOL_PROJECTION_TOOLS_PER_TASK = 2000;

interface LiveToolProjection {
  order: number;
  parentToolUseId: string | null;
  tool: ZCodePersistedToolCall;
  toolId: string;
}

function padDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatZCodeAgentLogDate(now: Date): string {
  return [now.getFullYear(), padDatePart(now.getMonth() + 1), padDatePart(now.getDate())].join("-");
}

function resolveZCodeAgentCurrentLogFilePath(now = new Date()): string {
  const configuredLogDir = process.env.ZCODE_LOG_DIR?.trim();
  const logDir = configuredLogDir || join(homedir(), ".zcode", "cli", "log");
  return join(logDir, `zcode-${formatZCodeAgentLogDate(now)}.jsonl`);
}

export function createZCodeTaskServiceAdapter(
  options: CreateZCodeTaskServiceAdapterOptions,
): IZCodeTaskService {
  const errorEmitter = new Emitter<ZCodeError>();
  const taskEmitters = new Map<string, Emitter<ZCodeStreamEvent>>();
  const globalTaskEmitters = new Map<string, Emitter<ZCodeStreamEvent>>();
  const overlays = new Map<string, TaskOverlay>();
  const taskTargets = new Map<string, TaskTarget>();
  const runtimeCommands = new Map<string, ZCodeTaskRuntimeCommand[]>();
  const runtimeCommandDrains = new Map<string, Promise<void>>();
  const apiRetryByTaskKey = new Map<string, ZCodeApiRetryStatus | null>();
  const backgroundTaskControlsByTaskKey = new Map<string, ZCodeBackgroundTaskControlItem[]>();
  const streamedTurnKeys = new Set<string>();
  const activePromptInputIds = new Map<string, InputId>();
  const toolProjectionMemoryByTaskKey = new Map<string, ZCodeToolProjectionMemory>();
  const liveToolProjectionsByTaskKey = new Map<string, Map<string, LiveToolProjection>>();
  let liveToolProjectionOrder = 0;
  // å†…å­˜è¯Šæ–­è®¡æ•°å™¨ï¼šåªè¯»å„ per-task è¡¨çš„ sizeã€‚
  const memoryDiagnostics = registerMemoryDiagnosticsProvider("task", () => ({
    runtimeCommands: runtimeCommands.size,
    toolMemoryTasks: toolProjectionMemoryByTaskKey.size,
    taskEmitters: taskEmitters.size,
    overlays: overlays.size,
  }));
  const taskIndexRepo = options.taskIndexRepo ?? new TaskIndexRepo();
  const taskIndexSyncer = options.taskIndexSyncer;

  // ä¹‹å‰ adapter è‡ªå¸¦ notifySyncerSession æ—¶æŠŠ syncer è§†ä¸ºå¯é€‰ï¼›çŽ°åœ¨ syncer æ˜¯æž„é€ å¿…å¡«é¡¹ï¼Œ
  // ç®€åŒ–ä¸ºç›´æŽ¥è°ƒç”¨ï¼Œé¿å…æ¯ä¸ª callsite éƒ½åšç©ºåˆ¤æ–­ã€‚
  function notifySyncerSession(target: TaskTarget): void {
    taskIndexSyncer.ensureSessionSubscription({
      workspacePath: target.workspacePath,
      workspaceIdentity: target.workspaceIdentity,
      sessionId: target.taskId,
    });
  }

  function unsupported(name: string): never {
    throw Object.assign(
      new Error(`ZCode task service adapter does not support IZCodeTaskService.${name} yet.`),
      {
        code: "ZCODE_AGENT_UNSUPPORTED_LEGACY_TASK_METHOD",
      },
    );
  }

  function resolvePromptToolDenylist(params: {
    automationId?: string;
    offPeakTaskId?: string;
    toolDenylist?: string[];
  }): string[] | undefined {
    const toolDenylist = new Set(params.toolDenylist);
    // æŒä¹…åŒ–çš„ cronAutomationId ä¸èƒ½å½“æˆå½“å‰ turn çš„æ‰§è¡Œèº«ä»½ï¼Œå¦åˆ™å®šæ—¶ä»»åŠ¡
    // è·‘è¿‡ä¸€æ¬¡åŽï¼Œç”¨æˆ·åœ¨åŒä¸€ä¼šè¯ä¸»åŠ¨ä¿®æ”¹è°ƒåº¦ä¹Ÿæ°¸ä¹…çœ‹ä¸åˆ° CronUpdateã€‚æƒé™å¿…é¡»åªçœ‹æœ¬è½®
    // automationIdï¼›cronAutomationId ä»…ä¿ç•™ä»»åŠ¡å½’å±žå’Œ UI å±•ç¤ºè¯­ä¹‰ã€‚
    if (params.automationId) {
      for (const toolName of AUTOMATION_MUTATION_TOOL_NAMES) {
        toolDenylist.add(toolName);
      }
    }
    // é—²æ—¶æ´¾å‘è½®çºµæ·±éšè— OffPeakCreateï¼›ä¸ä¸Ž automation åˆ†æ”¯åˆå¹¶ï¼ˆcron è½®æ”¾è¡Œï¼‰ã€‚
    if (params.offPeakTaskId) {
      for (const toolName of OFF_PEAK_MUTATION_TOOL_NAMES) {
        toolDenylist.add(toolName);
      }
    }
    return toolDenylist.size > 0 ? [...toolDenylist] : undefined;
  }

  function turnAttributionOf(
    params: ZCodeBackgroundTurnAttribution,
  ): ZCodeBackgroundTurnAttribution {
    if (params.automationId) return { automationId: params.automationId };
    if (params.offPeakTaskId) {
      return {
        offPeakTaskId: params.offPeakTaskId,
        ...(params.offPeakRunType ? { offPeakRunType: params.offPeakRunType } : {}),
      };
    }
    return {};
  }

  async function resolveProductMcpServers(
    servers: ZCodeAgentMcpServer[] | undefined,
  ): Promise<ZCodeAgentMcpServer[] | undefined> {
    const configuredServers = (servers?.length ?? 0) > 0 ? servers : undefined;
    if (!configuredServers || !options.cuaProductMcpServerResolver) {
      return configuredServers;
    }
    return options.cuaProductMcpServerResolver.resolveMcpServers(configuredServers);
  }

  function workspaceKey(params: { workspacePath: string; workspaceIdentity?: string }): string {
    return resolveWorkspaceKey(params);
  }

  function taskKey(params: { workspacePath: string; workspaceIdentity?: string; taskId: string }) {
    return `${workspaceKey(params)}\u0000${params.taskId}`;
  }

  function createTaskOwnerCommandError(
    message: string,
    code: "NO_ACTIVE_TASK_OWNER" | "STALE_TASK_OWNER_COMMAND",
  ): Error & { code: "NO_ACTIVE_TASK_OWNER" | "STALE_TASK_OWNER_COMMAND" } {
    return Object.assign(new Error(message), { code });
  }

  function assertCurrentOwnerRun(params: TaskTarget, ownerRunId: TraceId | undefined): void {
    if (!ownerRunId) {
      return;
    }
    const key = taskKey(params);
    const activeRunId = activePromptInputIds.get(key);
    if (!activeRunId) {
      // æ‰‹æœºç«¯ owner command åˆ°è¾¾ host æ—¶ï¼Œtask å¯èƒ½å·²ç»ç»ˆæ€æ”¶å£ã€‚
      // æ²¡æœ‰ active run æ—¶ä¸èƒ½å†æŠŠæ—§ command å†™å…¥ host é˜Ÿåˆ—ï¼Œå¦åˆ™ä¼šåœ¨æ¡Œé¢ shared host ä¸Šè¯¯å‘æ—§è¾“å…¥ã€‚
      throw createTaskOwnerCommandError("No active task owner.", "NO_ACTIVE_TASK_OWNER");
    }
    if (activeRunId !== ownerRunId) {
      // ownerRunId æ˜¯è¿œæŽ§è¯·æ±‚çš„ stale é˜²æŠ¤è¾¹ç•Œã€‚
      // æ—§ run çš„ enqueue/promote ä¸èƒ½ä¿®æ”¹å½“å‰ task command queueã€‚
      throw createTaskOwnerCommandError("Stale task owner command.", "STALE_TASK_OWNER_COMMAND");
    }
  }

  async function sendPromptToAgent(
    target: TaskTarget,
    params: {
      traceId: TraceId;
      queryId?: string;
      messageId?: string;
      content: string;
      attachments?: ZCodePromptAttachment[];
      toolDenylist?: string[];
      botDeliveryTarget?: ZCodeAutomationBotDeliveryTarget;
      clientId?: string;
      clientMode?: ZCodeTaskClientMode;
      logReason?: string;
      modelSelection?: CommandPayloadMap["sendText"]["modelSelection"];
      modelExecution?: CommandPayloadMap["sendText"]["modelExecution"];
    } & ZCodeBackgroundTurnAttribution,
  ): Promise<void> {
    const startedAt = Date.now();
    notifySyncerSession(target);
    // live tool projection åªç”¨äºŽå½“å‰è¿è¡Œçš„ç»ˆæ€æ”¶å£ã€‚
    // æ–°è¾“å…¥å¼€å§‹æ—¶å¿…é¡»æ¸…æŽ‰ä¸Šä¸€è½® live-only å­å·¥å…·ï¼Œé¿å…åŽç»­ snapshot æŠŠæ—§å·¥å…·è¡¥åˆ°æ–°å›žå¤å°¾éƒ¨ã€‚
    clearLiveToolProjection(target);
    clearStreamingToolInputCache(target);
    // ZCode task wrapper çš„å­—æ®µä»å« traceIdï¼Œä½†è¿™é‡Œè¯­ä¹‰å·²ç»æ˜¯å•æ¬¡è¾“å…¥ inputIdã€‚
    // å…ˆè®°å½• inputIdï¼ŒåŽç»­ ZCode session äº‹ä»¶å›žæŠ• ZCode Agent æ—¶æ‰èƒ½è®© UI ç»ˆæ€æŒ‰è¾“å…¥è½®æ¬¡æ”¶å£ã€‚
    activePromptInputIds.set(taskKey(target), params.traceId);
    logger.info(params.traceId, "ZCode task facade sendPrompt å¼€å§‹", {
      attachmentCount: params.attachments?.length ?? 0,
      queryId: params.queryId ?? null,
      reason: params.logReason ?? "direct",
      taskId: target.taskId,
      textLength: params.content.length,
      workspaceIdentity: target.workspaceIdentity ?? null,
      workspaceKey: resolveWorkspaceKey(target),
      workspacePath: target.workspacePath,
    });
    try {
      const promptToolDenylist = resolvePromptToolDenylist(params);
      if (params.attachments?.length) {
        // é—ç•™ï¼ˆé™„ä»¶å‘½ä»¤é¢ï¼‰ï¼šv4 sendText çš„ attachments æ˜¯ attachmentRef å¼•ç”¨æ¨¡åž‹ï¼Œ
        // ä¸Šä¼ /å¯„å­˜å‘½ä»¤é¢å°šæœªå»ºæ¨¡ï¼ˆCLI ä¾§ fork-edit-retry.ts åŒæ¬¾è£å†³â€œé™„ä»¶å‘½ä»¤é¢åŽç»­â€ï¼‰ã€‚
        // å¸¦é™„ä»¶è¾“å…¥ä¿ç•™æ—§ session/sendï¼Œé¿å…æ‰‹æœº replayable å›¾ç‰‡/æ–‡ä»¶è¾“å…¥å›žå½’ï¼›
        // è¿‡æ¸¡å½’å®¿ = v4 é™„ä»¶å‘½ä»¤é¢ï¼ˆå±Šæ—¶ç”± v4 sendText æ‰¿æŽ¥ï¼‰ã€‚
        await options.zcodeAgentService.sendPrompt({
          workspacePath: target.workspacePath,
          workspaceIdentity: target.workspaceIdentity,
          ...(target.remoteSessionId ? { remoteSessionId: target.remoteSessionId } : {}),
          sessionId: target.taskId,
          inputId: params.traceId,
          queryId: params.queryId,
          messageId: params.messageId,
          content: params.content,
          attachments: params.attachments.map((attachment) => ({
            ...attachment,
          })),
          // é™„ä»¶å›žé€€åªæ”¹å˜è½½è·ä¼ è¾“ï¼Œä¸å¾—ä¸¢æŽ‰æœ¬æ¬¡å·²è§£æžçš„æ¨¡åž‹æˆ–æ‰§è¡ŒèŒƒå›´ã€‚
          modelSelection: params.modelSelection,
          modelExecution: params.modelExecution,
          ...turnAttributionOf(params),
          toolDenylist: promptToolDenylist,
          botDeliveryTarget: params.botDeliveryTarget,
          ...(params.clientMode ? { clientMode: params.clientMode } : {}),
        });
      } else {
        // send ä¸»è·¯å¾„æ”¶æ•› v4 sendTextã€‚å¹‚ç­‰é”® inputIdâ†’commandId å¯¹é½ï¼š
        // CLI ä¾§ä»¥ commandId ä¸º inputId èµ· turnï¼Œç»ˆæ€äº‹ä»¶ inputId æ‰èƒ½ä¸Ž host command
        // queue çš„ traceId å¯¹è´¦ï¼ˆcompleteRuntimeCommandByInputId è¯­ä¹‰ä¸å˜ï¼‰ã€‚
        // heldQueueDisposition=keepQueueAndSendï¼šæ—§ session/send æ²¡æœ‰ held choice é—¸é—¨ï¼Œ
        // replayable æ— äººæœºäº¤äº’è·¯å¾„æŒ‰â€œç«‹å³å‘é€ã€ä¸åŠ¨é˜Ÿåˆ—â€ç­‰ä»·è€è¯­ä¹‰ã€‚
        const ack = await options.zcodeAgentService.sendConversationCommandV4({
          workspacePath: target.workspacePath,
          workspaceIdentity: target.workspaceIdentity,
          ...(target.remoteSessionId ? { remoteSessionId: target.remoteSessionId } : {}),
          ...(params.clientMode ? { clientMode: params.clientMode } : {}),
          envelope: createHostCommandEnvelope({
            type: "sendText",
            payload: {
              text: params.content,
              heldQueueDisposition: "keepQueueAndSend",
              ...(params.modelSelection ? { modelSelection: params.modelSelection } : {}),
              ...(params.modelExecution ? { modelExecution: params.modelExecution } : {}),
              ...turnAttributionOf(params),
              ...(params.botDeliveryTarget ? { botDeliveryTarget: params.botDeliveryTarget } : {}),
              ...(promptToolDenylist ? { toolDisallowlist: promptToolDenylist } : {}),
            },
            sessionId: target.taskId,
            commandId: params.traceId,
            clientId: params.clientId,
          }),
        });
        assertV4CommandAckOk("sendText", ack, `session=${target.taskId}`);
      }
      logger.info(params.traceId, "ZCode task facade sendPrompt ACK", {
        durationMs: Date.now() - startedAt,
        queryId: params.queryId ?? null,
        reason: params.logReason ?? "direct",
        taskId: target.taskId,
        workspaceIdentity: target.workspaceIdentity ?? null,
        workspaceKey: resolveWorkspaceKey(target),
        workspacePath: target.workspacePath,
      });
    } catch (error) {
      activePromptInputIds.delete(taskKey(target));
      logger.warn(params.traceId, "ZCode task facade sendPrompt å¤±è´¥", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        queryId: params.queryId ?? null,
        reason: params.logReason ?? "direct",
        taskId: target.taskId,
        workspaceIdentity: target.workspaceIdentity ?? null,
        workspaceKey: resolveWorkspaceKey(target),
        workspacePath: target.workspacePath,
      });
      throw error;
    }
  }

  function setRuntimeCommands(params: TaskTarget, commands: ZCodeTaskRuntimeCommand[]): void {
    const key = taskKey(params);
    if (commands.length === 0) {
      runtimeCommands.delete(key);
      return;
    }
    runtimeCommands.set(key, commands);
  }

  function markRuntimeCommandRunning(
    params: TaskTarget,
    command: ZCodeSendPromptRuntimeCommand,
  ): ZCodeSendPromptRuntimeCommand {
    const key = taskKey(params);
    const runningCommand: ZCodeSendPromptRuntimeCommand = {
      ...command,
      status: "running",
      updatedAt: Date.now(),
    };
    runtimeCommands.set(
      key,
      (runtimeCommands.get(key) ?? []).map((item) =>
        item.commandId === command.commandId ? runningCommand : item,
      ),
    );
    return runningCommand;
  }

  function markRuntimeCommandFailed(
    params: TaskTarget,
    command: ZCodeSendPromptRuntimeCommand,
    error: unknown,
  ): void {
    const key = taskKey(params);
    const failedCommand: ZCodeSendPromptRuntimeCommand = {
      ...command,
      status: "failed",
      updatedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    };
    runtimeCommands.set(
      key,
      (runtimeCommands.get(key) ?? []).map((item) =>
        item.commandId === command.commandId ? failedCommand : item,
      ),
    );
  }

  function removeRuntimeCommand(params: TaskTarget, commandId: string): void {
    setRuntimeCommands(
      params,
      (runtimeCommands.get(taskKey(params)) ?? []).filter(
        (command) => command.commandId !== commandId,
      ),
    );
  }

  function emitRuntimeCommandSnapshotUpdated(params: TaskTarget, traceId?: TraceId): void {
    emitTaskEvent(params, {
      type: "task_snapshot_updated",
      workspacePath: params.workspacePath,
      workspaceIdentity: params.workspaceIdentity,
      workspaceKey: workspaceKey(params),
      taskId: params.taskId,
      traceId: traceId ?? generateTraceId(params.taskId),
      reason: "task_status_changed",
    });
  }

  function completeRuntimeCommandByInputId(
    params: TaskTarget,
    terminalInputId: string | undefined,
    terminalType: string,
  ): void {
    if (!terminalInputId) {
      return;
    }
    const command = (runtimeCommands.get(taskKey(params)) ?? []).find(
      (candidate) =>
        candidate.type === "send_prompt" &&
        candidate.status === "running" &&
        candidate.traceId === terminalInputId,
    );
    if (!command) {
      return;
    }
    // æ‰‹æœº host command åœ¨ sendPrompt ACK åŽä»è¦ä¿æŒ runningï¼Œ
    // å¦åˆ™æ‰‹æœºåˆ·æ–°æ‹¿ä¸åˆ°â€œå·²å¼€å§‹å‘é€â€çš„ pendingCommandsã€‚åªæœ‰çœŸå®žç»ˆæ€åˆ°è¾¾åŽæ‰èƒ½ä»Ž host é˜Ÿåˆ—ç§»é™¤ã€‚
    removeRuntimeCommand(params, command.commandId);
    logger.info(command.traceId, "ZCode task command ç»ˆæ€æ”¶å£", {
      commandId: command.commandId,
      terminalType,
      taskId: params.taskId,
      workspaceIdentity: params.workspaceIdentity ?? null,
      workspaceKey: resolveWorkspaceKey(params),
      workspacePath: params.workspacePath,
    });
  }

  function completeRuntimeCommandForTerminalEvent(
    params: TaskTarget,
    event: ZCodeTerminalStreamEvent,
  ): void {
    completeRuntimeCommandByInputId(params, event.inputId ?? event.traceId, event.type);
  }

  async function drainRuntimeCommands(params: TaskTarget, reason: string): Promise<void> {
    const key = taskKey(params);
    if (activePromptInputIds.has(key)) {
      return;
    }
    const commands = runtimeCommands.get(key) ?? [];
    if (commands.some((command) => command.status === "running")) {
      return;
    }
    const command = commands.find(
      (candidate): candidate is ZCodeSendPromptRuntimeCommand =>
        candidate.type === "send_prompt" && candidate.status === "accepted",
    );
    if (!command) {
      return;
    }

    const runningCommand = markRuntimeCommandRunning(params, command);
    logger.info(runningCommand.traceId, "ZCode task command drain å¼€å§‹", {
      commandId: runningCommand.commandId,
      queryId: runningCommand.queryId ?? null,
      reason,
      taskId: params.taskId,
      workspaceIdentity: params.workspaceIdentity ?? null,
      workspaceKey: resolveWorkspaceKey(params),
      workspacePath: params.workspacePath,
    });
    try {
      await sendPromptToAgent(params, {
        traceId: runningCommand.traceId,
        queryId: runningCommand.queryId,
        messageId: runningCommand.commandId,
        content: runningCommand.content,
        attachments: runningCommand.attachments,
        ...turnAttributionOf(
          runningCommand.automationId ? { automationId: runningCommand.automationId } : {},
        ),
        // v4 sendText ä¿¡å°ä¿ç•™æ‰‹æœºæäº¤ç«¯ clientIdï¼ˆpendingCommands å±•ç¤ºä¸Žå¹‚ç­‰è¡¨æŒ‰æäº¤ç«¯åŒºåˆ†ï¼‰ã€‚
        clientId: runningCommand.clientId,
        logReason: "host-command-drain",
      });
    } catch (error) {
      markRuntimeCommandFailed(params, runningCommand, error);
      logger.warn(runningCommand.traceId, "ZCode task command drain å¤±è´¥", {
        commandId: runningCommand.commandId,
        error: error instanceof Error ? error.message : String(error),
        reason,
        taskId: params.taskId,
        workspaceIdentity: params.workspaceIdentity ?? null,
        workspaceKey: resolveWorkspaceKey(params),
        workspacePath: params.workspacePath,
      });
    }
  }

  async function drainRuntimeCommandsSafely(params: TaskTarget, reason: string): Promise<void> {
    try {
      await drainRuntimeCommands(params, reason);
    } catch (error) {
      logger.warn(undefined, "ZCode task command drain è°ƒåº¦å¤±è´¥", {
        error: error instanceof Error ? error.message : String(error),
        reason,
        taskId: params.taskId,
        workspaceIdentity: params.workspaceIdentity ?? null,
        workspaceKey: resolveWorkspaceKey(params),
        workspacePath: params.workspacePath,
      });
    }
  }

  function scheduleRuntimeCommandDrain(params: TaskTarget, reason: string): void {
    const key = taskKey(params);
    const existingDrain = runtimeCommandDrains.get(key);
    if (existingDrain) {
      const nextDrainPromise = existingDrain
        .finally(() => drainRuntimeCommandsSafely(params, reason))
        .finally(() => {
          if (runtimeCommandDrains.get(key) === nextDrainPromise) {
            runtimeCommandDrains.delete(key);
          }
        });
      runtimeCommandDrains.set(key, nextDrainPromise);
      return;
    }
    const drainPromise = (async () => {
      await drainRuntimeCommandsSafely(params, reason);
    })().finally(() => {
      if (runtimeCommandDrains.get(key) === drainPromise) {
        runtimeCommandDrains.delete(key);
      }
    });
    runtimeCommandDrains.set(key, drainPromise);
  }

  function getLiveToolProjectionMap(params: TaskTarget): Map<string, LiveToolProjection> {
    const key = taskKey(params);
    let projection = liveToolProjectionsByTaskKey.get(key);
    if (!projection) {
      projection = new Map<string, LiveToolProjection>();
      liveToolProjectionsByTaskKey.set(key, projection);
      while (liveToolProjectionsByTaskKey.size > MAX_LIVE_TOOL_PROJECTION_TASKS) {
        const oldestKey = liveToolProjectionsByTaskKey.keys().next().value;
        if (typeof oldestKey !== "string") break;
        liveToolProjectionsByTaskKey.delete(oldestKey);
      }
    }
    return projection;
  }

  function trimLiveToolProjectionMap(projection: Map<string, LiveToolProjection>): void {
    while (projection.size > MAX_LIVE_TOOL_PROJECTION_TOOLS_PER_TASK) {
      let oldestKey: string | undefined;
      let oldestOrder = Number.POSITIVE_INFINITY;
      for (const [toolId, item] of projection) {
        if (item.order < oldestOrder) {
          oldestOrder = item.order;
          oldestKey = toolId;
        }
      }
      if (!oldestKey) return;
      projection.delete(oldestKey);
    }
  }

  function clearLiveToolProjection(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    taskId: string;
  }): void {
    liveToolProjectionsByTaskKey.delete(taskKey(params));
  }

  function normalizeLiveToolRaw(
    raw: unknown,
    toolId: string,
    parentToolUseId: string | null | undefined,
  ): unknown {
    const rawRecord = asRecord(raw);
    const rawBase =
      Object.keys(rawRecord).length > 0 ? rawRecord : raw === undefined ? {} : { raw };
    const parentFromRaw =
      stringValue(rawRecord.parentToolUseId) ??
      stringValue(rawRecord.parentToolCallId) ??
      parentToolUseId ??
      null;
    return {
      ...rawBase,
      toolCallId: stringValue(rawRecord.toolCallId) ?? toolId,
      ...(parentFromRaw
        ? {
            parentToolCallId: stringValue(rawRecord.parentToolCallId) ?? parentFromRaw,
          }
        : {}),
    };
  }

  function persistedStatusFromToolUpdate(
    status: Extract<ZCodeStreamEvent, { type: "tool_call_update" }>["status"],
  ): ZCodePersistedToolCall["status"] | undefined {
    return status === "completed" ||
      status === "failed" ||
      status === "denied" ||
      status === "stopped"
      ? status
      : undefined;
  }

  function rememberLiveToolProjection(params: TaskTarget, event: ZCodeStreamEvent): void {
    if (event.type !== "tool_call" && event.type !== "tool_call_update") {
      return;
    }

    const projection = getLiveToolProjectionMap(params);
    const existing = projection.get(event.toolId);
    const parentToolUseId = event.parentToolUseId ?? existing?.parentToolUseId ?? null;
    const raw = normalizeLiveToolRaw(event.raw, event.toolId, parentToolUseId);
    const nextTool: ZCodePersistedToolCall =
      event.type === "tool_call"
        ? {
            ...existing?.tool,
            toolName: event.toolName ?? existing?.tool.toolName,
            title: event.title ?? existing?.tool.title ?? event.toolName,
            kind: event.kind ?? existing?.tool.kind ?? event.toolName,
            input: event.input,
            raw,
          }
        : {
            ...existing?.tool,
            toolName: event.toolName ?? existing?.tool.toolName,
            title: event.title ?? existing?.tool.title ?? event.toolName ?? event.kind,
            kind: event.kind ?? existing?.tool.kind ?? event.toolName ?? existing?.tool.toolName,
            input: event.input !== undefined ? event.input : existing?.tool.input,
            output: event.content !== undefined ? event.content : existing?.tool.output,
            error: event.error ?? existing?.tool.error,
            raw,
            status: persistedStatusFromToolUpdate(event.status) ?? existing?.tool.status,
          };
    projection.set(event.toolId, {
      order: existing?.order ?? ++liveToolProjectionOrder,
      parentToolUseId,
      tool: nextTool,
      toolId: event.toolId,
    });
    trimLiveToolProjectionMap(projection);
  }

  function persistedToolId(tool: ZCodePersistedToolCall): string | undefined {
    return stringValue(asRecord(tool.raw).toolCallId);
  }

  function mergeToolRaw(snapshotRaw: unknown, liveRaw: unknown): unknown {
    const snapshotRecord = asRecord(snapshotRaw);
    const liveRecord = asRecord(liveRaw);
    if (Object.keys(snapshotRecord).length === 0) {
      return liveRaw;
    }
    if (Object.keys(liveRecord).length === 0) {
      return snapshotRaw;
    }
    return {
      ...liveRecord,
      ...snapshotRecord,
      parentToolCallId:
        stringValue(snapshotRecord.parentToolCallId) ?? stringValue(liveRecord.parentToolCallId),
      toolCallId: stringValue(snapshotRecord.toolCallId) ?? stringValue(liveRecord.toolCallId),
    };
  }

  function mergePersistedToolCall(
    snapshotTool: ZCodePersistedToolCall | undefined,
    liveTool: ZCodePersistedToolCall,
  ): ZCodePersistedToolCall {
    if (!snapshotTool) {
      return liveTool;
    }
    return {
      ...liveTool,
      ...snapshotTool,
      // ç»ˆæ€ snapshot æ¥è‡ªçˆ¶ session message partsï¼Œå¯èƒ½æ²¡æœ‰ live mirror çš„
      // subagent parentToolCallId/raw/outputã€‚è¿™é‡ŒæŠŠ snapshot ä½œä¸ºç»ˆæ€äº‹å®žæºï¼ŒåŒæ—¶ä¿ç•™
      // live åè®®äº‹ä»¶å·²ç»æä¾›çš„çˆ¶å­å½’å±žå’Œå¤§å­—æ®µï¼Œé¿å… task_complete åŽå·¥å…·æ ‘è¢«è¦†ç›–ä¸¢å¤±ã€‚
      input: snapshotTool.input ?? liveTool.input,
      output: snapshotTool.output ?? liveTool.output,
      raw: mergeToolRaw(snapshotTool.raw, liveTool.raw),
      error: snapshotTool.error ?? liveTool.error,
      status: snapshotTool.status ?? liveTool.status,
      snapshotRefs: snapshotTool.snapshotRefs ?? liveTool.snapshotRefs,
    };
  }

  function findToolLocation(
    messages: readonly ZCodePersistedMessage[],
    toolId: string,
  ): { messageIndex: number; toolIndex: number } | null {
    for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
      const message = messages[messageIndex];
      if (!message?.tools) continue;
      const toolIndex = message.tools.findIndex((tool) => persistedToolId(tool) === toolId);
      if (toolIndex >= 0) {
        return { messageIndex, toolIndex };
      }
    }
    return null;
  }

  function latestAssistantMessageIndex(messages: readonly ZCodePersistedMessage[]): number {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "assistant") {
        return index;
      }
    }
    return -1;
  }

  function upsertPersistedToolPart(
    parts: readonly ZCodePersistedMessagePart[] | undefined,
    toolIndex: number,
  ): ZCodePersistedMessagePart[] {
    if (parts?.some((part) => part.type === "tool-call" && part.toolIndex === toolIndex)) {
      return [...parts];
    }
    return [...(parts ?? []), { type: "tool-call", toolIndex }];
  }

  function updateSnapshotMessageTool(
    message: ZCodePersistedMessage,
    toolIndex: number,
    tool: ZCodePersistedToolCall,
  ): ZCodePersistedMessage {
    const tools = [...(message.tools ?? [])];
    tools[toolIndex] = mergePersistedToolCall(tools[toolIndex], tool);
    return {
      ...message,
      tools,
      parts:
        message.role === "assistant"
          ? upsertPersistedToolPart(message.parts, toolIndex)
          : message.parts,
    };
  }

  function appendSnapshotMessageTool(
    message: ZCodePersistedMessage,
    tool: ZCodePersistedToolCall,
  ): ZCodePersistedMessage {
    const tools = [...(message.tools ?? []), tool];
    const toolIndex = tools.length - 1;
    return {
      ...message,
      tools,
      parts:
        message.role === "assistant"
          ? upsertPersistedToolPart(message.parts, toolIndex)
          : message.parts,
    };
  }

  function mergeLiveToolProjectionIntoSnapshotMessages(
    meta: ZCodeTaskMeta,
    messages: ZCodePersistedMessage[],
  ): ZCodePersistedMessage[] {
    const projection = liveToolProjectionsByTaskKey.get(taskKey(meta));
    if (!projection || projection.size === 0 || messages.length === 0) {
      return messages;
    }

    let nextMessages = messages;
    let changed = false;
    let mergedToolCount = 0;
    const liveTools = [...projection.values()].sort((a, b) => a.order - b.order);
    for (const liveTool of liveTools) {
      const existingLocation = findToolLocation(nextMessages, liveTool.toolId);
      if (existingLocation) {
        nextMessages = nextMessages.map((message, index) =>
          index === existingLocation.messageIndex
            ? updateSnapshotMessageTool(message, existingLocation.toolIndex, liveTool.tool)
            : message,
        );
        changed = true;
        mergedToolCount += 1;
        continue;
      }

      const parentLocation = liveTool.parentToolUseId
        ? findToolLocation(nextMessages, liveTool.parentToolUseId)
        : null;
      const targetMessageIndex =
        parentLocation?.messageIndex ?? latestAssistantMessageIndex(nextMessages);
      if (targetMessageIndex < 0) {
        continue;
      }

      nextMessages = nextMessages.map((message, index) =>
        index === targetMessageIndex ? appendSnapshotMessageTool(message, liveTool.tool) : message,
      );
      changed = true;
      mergedToolCount += 1;
    }

    if (changed) {
      logger.debug(undefined, "ZCode snapshot åˆå¹¶ live tool projection", {
        event: "zcode_task.snapshot.live_tool_projection.merged",
        liveToolCount: liveTools.length,
        mergedToolCount,
        taskId: meta.taskId,
        workspaceIdentity: meta.workspaceIdentity,
        workspacePath: meta.workspacePath,
      });
    }
    return changed ? nextMessages : messages;
  }

  function rememberTaskTarget(params: TaskTarget): void {
    const existing = taskTargets.get(params.taskId);
    taskTargets.set(params.taskId, {
      ...params,
      // cronAutomationId æ˜¯ä¼šè¯çš„ sticky å½’å±žæ ‡è®°ï¼Œä¾› UI å±•ç¤ºå’Œä»»åŠ¡å…³è”ä½¿ç”¨ï¼Œä¸å‚ä¸Žå½“å‰
      // turn çš„å·¥å…·æƒé™ã€‚resume/onDynamicTaskEvent ç­‰å…¥å£ä¸å¸¦å€¼æ—¶ä»éœ€ä¿ç•™æƒå¨å½’å±žï¼›æ˜Žç¡®è®¾ç½®
      // æˆ–æ¸…é™¤åªèƒ½èµ° rememberIndexedTaskMetaã€‚
      cronAutomationId: params.cronAutomationId ?? existing?.cronAutomationId,
    });
  }

  function getTaskTarget(taskId: string): TaskTarget {
    const target = taskTargets.get(taskId);
    if (!target) {
      throw Object.assign(new Error(`ZCode session target is not loaded: ${taskId}`), {
        code: "ZCODE_SESSION_TARGET_NOT_FOUND",
      });
    }
    return target;
  }

  function getOverlay(params: {
    workspacePath: string;
    workspaceIdentity?: string;
    taskId: string;
  }) {
    return overlays.get(taskKey(params)) ?? {};
  }

  function getToolProjectionMemory(params: TaskTarget): ZCodeToolProjectionMemory {
    const key = taskKey(params);
    let memory = toolProjectionMemoryByTaskKey.get(key);
    if (!memory) {
      memory = createZCodeToolProjectionMemory();
      toolProjectionMemoryByTaskKey.set(key, memory);
    }
    return memory;
  }

  function clearStreamingToolInputCache(params: TaskTarget): void {
    toolProjectionMemoryByTaskKey.get(taskKey(params))?.streamingToolInputById?.clear();
  }

  function setOverlay(
    params: {
      workspacePath: string;
      workspaceIdentity?: string;
      taskId: string;
    },
    patch: Partial<TaskOverlay>,
  ) {
    const key = taskKey(params);
    overlays.set(key, { ...overlays.get(key), ...patch });
  }

  // workspace emitter å·²ä¸Šæåˆ° syncerï¼Œadapter é€šè¿‡ syncer èŽ·å–å…±äº« emitterï¼Œ
  // ä¿è¯ task adapter è·¯å¾„å’Œ desktop-continuous è·¯å¾„èµ°åŒä¸€ä»½è®¢é˜…ï¼ŒUI ä¸ä¼šæ¼äº‹ä»¶ã€‚
  function getWorkspaceEmitter(workspace: WorkspaceEventInput): Emitter<ZCodeWorkspaceEvent> {
    return taskIndexSyncer.getWorkspaceEmitter(workspace);
  }

  function getTaskEmitter(params: TaskTarget): Emitter<ZCodeStreamEvent> {
    const key = taskKey(params);
    let emitter = taskEmitters.get(key);
    if (!emitter) {
      emitter = new Emitter<ZCodeStreamEvent>();
      taskEmitters.set(key, emitter);
    }
    return emitter;
  }

  function getGlobalTaskEmitter(taskId: string): Emitter<ZCodeStreamEvent> {
    let emitter = globalTaskEmitters.get(taskId);
    if (!emitter) {
      emitter = new Emitter<ZCodeStreamEvent>();
      globalTaskEmitters.set(taskId, emitter);
    }
    return emitter;
  }

  function emitTaskEvent(params: TaskTarget, event: ZCodeStreamEvent): void {
    getTaskEmitter(params).fire(event);
    getGlobalTaskEmitter(params.taskId).fire(event);
  }

  // å§”æ‰˜åˆ° syncerï¼Œè®© archive/rename/pin/delete ç­‰ task å…ƒæ•°æ®å˜æ›´å’Œ
  // desktop-continuous è·¯å¾„ï¼ˆturn.completed ç­‰ï¼‰èµ°åŒä¸€æ¡å¹¿æ’­é€šé“ã€‚
  // è®¾è®¡ä¿®æ­£ï¼šreason å¿…å¡«ï¼Œå‘å°„ç‚¹å¿…é¡»å£°æ˜Žå˜æ›´ç±»åˆ«ã€‚
  function emitWorkspaceTaskListChanged(
    params: {
      workspacePath: string;
      workspaceIdentity?: string;
      taskId?: string;
    },
    taskMeta: ZCodeTaskMeta | undefined,
    reason: ZCodeWorkspaceTaskListChanged["reason"],
  ) {
    taskIndexSyncer.emitWorkspaceTaskListChanged(params, taskMeta, reason);
  }

  function emitWorkspaceConfig(
    params: ZCodeAgentWorkspaceTarget,
    settings: ZCodeSessionSettingsState,
  ) {
    getWorkspaceEmitter(params).fire({
      type: "workspace_config_options_update",
      workspacePath: params.workspacePath,
      workspaceIdentity: params.workspaceIdentity,
      configOptions: settingsToConfigOptions(settings),
    });
  }

  async function readTaskAutoArchiveConfig(): Promise<{
    olderThanDays: number;
  } | null> {
    if (!options.settingService) {
      return null;
    }
    try {
      const settings = await options.settingService.get();
      if (!settings.taskAutoArchiveEnabled) {
        return null;
      }
      return {
        olderThanDays: settings.taskAutoArchiveOlderThanDays ?? 7,
      };
    } catch (error) {
      logger.warn(
        undefined,
        "è¯»å– task è‡ªåŠ¨å½’æ¡£è®¾ç½®å¤±è´¥ï¼Œè·³è¿‡æœ¬è½®è‡ªåŠ¨å½’æ¡£",
        error,
      );
      return null;
    }
  }

  async function runWorkspaceTaskAutoArchive(
    scopes: Array<{ workspacePath: string; workspaceIdentity?: string }>,
  ): Promise<void> {
    if (scopes.length === 0) {
      return;
    }
    const config = await readTaskAutoArchiveConfig();
    if (!config) {
      return;
    }
    const seenWorkspaceKeys = new Set<string>();
    let archivedCount = 0;
    for (const scope of scopes) {
      const key = resolveWorkspaceKey(scope);
      if (seenWorkspaceKeys.has(key)) {
        continue;
      }
      seenWorkspaceKeys.add(key);
      // è‡ªåŠ¨å½’æ¡£æŒ‰å·¥ä½œåŒºã€è¿‡æœŸæ—¶é—´å’Œå®ŒæˆçŠ¶æ€å¤„ç†æ‰€æœ‰å­˜é‡ä»»åŠ¡ï¼ŒåŒ…æ‹¬åˆ—è¡¨éšè—çš„åŽ†å²è®°å½•ã€‚
      const archivedTasks = await taskIndexRepo.archiveStaleTasks({
        workspacePath: scope.workspacePath,
        workspaceIdentity: scope.workspaceIdentity,
        olderThanDays: config.olderThanDays,
      });
      archivedCount += archivedTasks.length;
      for (const task of archivedTasks) {
        setOverlay(task, { archived: true });
        rememberIndexedTaskMeta(task);
        // å½’å±žå˜æ›´ï¼ˆè‡ªåŠ¨å½’æ¡£ï¼‰ï¼šæ²¿ç”¨ task_meta_changed èµ° membership é‡æ‹‰æ”¶æ•›ï¼›
        // å…ˆä¿æŒçŽ°çŠ¶è¡Œä¸ºã€‚
        emitWorkspaceTaskListChanged(task, task, "task_meta_changed");
      }
    }
    if (archivedCount > 0) {
      logger.info(
        undefined,
        `æŒ‰è®¾ç½®è‡ªåŠ¨å½’æ¡£æ—§ task æ•°é‡=${archivedCount} olderThanDays=${config.olderThanDays}`,
      );
    }
  }

  async function resumeSnapshot(
    params: TaskTargetWithMcpServers,
  ): Promise<ZCodeSessionStateSnapshot> {
    rememberTaskTarget(params);
    const thoughtLevel = params.thoughtLevel?.trim();
    const mcpServers = await resolveProductMcpServers(params.mcpServers);
    return options.zcodeAgentService.resumeSession({
      workspacePath: params.workspacePath,
      workspaceIdentity: params.workspaceIdentity,
      sessionId: params.taskId,
      // replayable æ‰‹æœºç«¯æ¢å¤ä»ç» task adapterï¼Œä½† stale model guard åœ¨
      // session resume å†…æ‰§è¡Œï¼›è¿™é‡Œå¸¦ä¸Šå½“å‰ UI æ¨¡åž‹ï¼Œé¿å…åªä¿æŠ¤ desktop continuous ä¸»é“¾è·¯ã€‚
      model: params.model ? parseModelPickerValue(params.model) : undefined,
      ...(thoughtLevel ? { thoughtLevel } : {}),
      ...(mcpServers ? { mcpServers } : {}),
      ...(params.toolDenylist ? { toolDenylist: params.toolDenylist } : {}),
    });
  }

  /**
   * ä¼šè¯çº§é…ç½®å†™ï¼ˆæ¨¡åž‹/æ€è€ƒæ·±åº¦/æ¨¡å¼ï¼‰çš„ v4 CAS å‘½ä»¤æäº¤ã€‚
   * host æ— æœ¬åœ° v4 æŠ•å½±ï¼Œrevision ç”¨ stale ACK çš„ revisionAtDecision æ”¶æ•›ï¼ˆsendHostCasCommandV4ï¼‰ã€‚
   * æ³¨æ„ä¸Ž compact/goal æ ‡æ³¨åŒä¸€å‘ä½ï¼šæ—§åè®® stateRevision ä¸Ž v4 conversation revision
   * æ˜¯ä¸¤å¥—è®¡æ•°å™¨ï¼Œè¿™é‡Œå…¨ç¨‹åªç”¨ v4 ACK å›žæŠ¥çš„ revisionï¼Œç»ä¸æ··å…¥æ—§ expectedRevisionã€‚
   */
  async function sendConfigCasCommandV4<T extends "switchModelConfig" | "switchCollaborationMode">(
    target: TaskTarget,
    type: T,
    payload: CommandPayloadMap[T],
    contextMessage: string,
  ): Promise<void> {
    await sendHostCasCommandV4({
      send: (envelope) =>
        options.zcodeAgentService.sendConversationCommandV4({
          workspacePath: target.workspacePath,
          workspaceIdentity: target.workspaceIdentity,
          envelope,
        }),
      type,
      payload,
      sessionId: target.taskId,
      contextMessage,
    });
  }

  /**
   * session/setMode â†’ v4 switchCollaborationModeã€‚
   * auto ä¾‹å¤–ä¿çœŸï¼šv4 å‘½ä»¤å€¼åŸŸåˆ»æ„æŽ’é™¤ autoï¼ˆã€Œauto éžç”¨æˆ·å¯åˆ‡ï¼Œä¸è¿› UI å‘½ä»¤é¢ã€ï¼Œ
   * command.ts è£å†³ï¼‰ï¼Œè€Œæ—§åè®® ZCodeSessionMode å« auto ä¸”æ—§ op æŽ¥å—å®ƒâ€”â€”ä¸º UI è¡Œä¸º
   * é›¶å˜åŒ–ï¼Œauto ç»§ç»­èµ°æ—§ opï¼Œå…¶ä½™å€¼ä¸€å¾‹ v4 åŽŸç”Ÿã€‚è¿‡æ¸¡å½’å®¿ = auto è¯­ä¹‰åœ¨ v4 ä¾§è£å†³åŽæ”¶å£ã€‚
   */
  async function switchCollaborationModeViaProtocol(
    target: TaskTarget,
    mode: ZCodeSessionMode,
  ): Promise<void> {
    if (mode === "auto") {
      await options.zcodeAgentService.setMode({
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        sessionId: target.taskId,
        mode,
      });
      return;
    }
    await sendConfigCasCommandV4(
      target,
      "switchCollaborationMode",
      { mode },
      `session=${target.taskId} mode=${mode}`,
    );
  }

  async function repairEmptyImportedClaudeSnapshot(
    params: TaskTargetWithMcpServers,
    snapshot: ZCodeSessionStateSnapshot,
  ): Promise<ZCodeSessionStateSnapshot> {
    const repaired = await repairImportedClaudeSessionSnapshot({
      snapshot,
      target: params,
      createSession: (input) => options.zcodeAgentService.createSession(input),
      onRepair: (history) => {
        logger.warn(
          undefined,
          `Claude å¯¼å…¥ protocol session åŽ†å²å¼‚å¸¸ï¼ŒæŒ‰ ${history.source} å›žå¡« taskId=${params.taskId}`,
        );
      },
    });
    if (!repaired) {
      return snapshot;
    }
    const meta = await syncTaskIndexSnapshot(repaired);
    await syncTaskIndexMeta({ ...meta, migrationSource: "claudeCode" });
    return repaired;
  }

  function isSessionMissingError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return /\bSession (not found|is not active):/i.test(message);
  }

  async function resumeTaskSnapshot(
    params: TaskTargetWithMcpServers,
  ): Promise<ZCodeSessionStateSnapshot> {
    let snapshot: ZCodeSessionStateSnapshot;
    try {
      snapshot = await resumeSnapshot(params);
    } catch (error) {
      if (!isSessionMissingError(error)) throw error;
      // æ—©æœŸåŽŸç”ŸåŽ†å²å¯¼å…¥åªä¿å­˜äº†å¸¦ migrationSource çš„å¿«ç…§ï¼Œä»éœ€å‡çº§æˆçœŸå®ž ZCode sessionã€‚
      // å¤ç”¨å¯¼å…¥æ¨¡å—çš„ä¸¥æ ¼æ¥æºæ ¡éªŒï¼Œé¿å…æ¸…ç† ACP æ—¶è¯¯åˆ è¿™æ¡ç‹¬ç«‹çš„æ•°æ®è¿ç§»è·¯å¾„ã€‚
      const history = await readLegacyImportedClaudeHistory(params);
      if (!history) throw error;
      const mcpServers = await resolveProductMcpServers(params.mcpServers);
      const restored = await options.zcodeAgentService.createSession({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        sessionId: params.taskId,
        sessionTraceId: history.traceId ?? createSessionTraceId(),
        persistence: "immediate",
        model: params.model ? parseModelPickerValue(params.model) : undefined,
        ...(mcpServers ? { mcpServers } : {}),
        ...(params.toolDenylist ? { toolDenylist: params.toolDenylist } : {}),
        importedHistory: {
          source: "claudeCode",
          title: history.title,
          createdAt: history.createdAt,
          updatedAt: history.updatedAt,
          messages: history.messages,
        },
      });
      const meta = await syncTaskIndexSnapshot(restored);
      await syncTaskIndexMeta({ ...meta, migrationSource: "claudeCode" });
      return restored;
    }
    return repairEmptyImportedClaudeSnapshot(params, snapshot);
  }

  function snapshotToMeta(snapshot: ZCodeSessionStateSnapshot): ZCodeTaskMeta {
    const target = {
      taskId: snapshot.session.sessionId,
      workspacePath: snapshot.session.workspace.workspacePath,
      workspaceIdentity: snapshot.session.workspace.workspaceIdentity,
    };
    rememberTaskTarget(target);
    return applyOverlayToMeta(
      {
        taskId: snapshot.session.sessionId,
        traceId: snapshot.session.traceId ?? generateTraceId(snapshot.session.sessionId),
        title: deriveTitleFromSnapshot(snapshot),
        workspacePath: snapshot.session.workspace.workspacePath,
        workspaceIdentity: snapshot.session.workspace.workspaceIdentity,
        createdAt: snapshot.session.createdAt,
        updatedAt: snapshot.session.updatedAt,
        mode: fromZCodeMode(snapshot.session.mode),
        model: formatTaskMetaModelSelectionFromSnapshot(snapshot),
        thoughtLevel: snapshot.settings.thoughtLevel.current,
        provider: GLM_PROVIDER,
        status: deriveZCodeTaskStatusFromSessionSnapshot(snapshot),
        lastError: snapshot.projection.lastError
          ? {
              code: snapshot.projection.lastError.code ?? snapshot.projection.lastError.type,
              ...(snapshot.projection.lastError.detail
                ? { detail: snapshot.projection.lastError.detail }
                : {}),
              // service snapshot æ˜¯ mobile replayable/cold task meta çš„æ¥æºï¼Œä¸èƒ½
              // è®©å®ƒä¸Ž UI ç›´æŽ¥æŠ•å½±çš„ lastError äº§ç”Ÿå½’å› æ¼‚ç§»ã€‚
              ...(snapshot.projection.lastError.attribution
                ? { attribution: snapshot.projection.lastError.attribution }
                : {}),
              message: snapshot.projection.lastError.message,
            }
          : undefined,
        target: snapshot.projection.target
          ? fromZCodeGoal(snapshot.projection.target)
          : snapshot.projection.target,
      },
      getOverlay(target),
    );
  }

  function rememberIndexedTaskMeta(meta: ZCodeTaskMeta): ZCodeTaskMeta {
    const existing = taskTargets.get(meta.taskId);
    // æƒå¨å½’å±žåˆ·æ–°ï¼šindex meta æ˜¯å”¯ä¸€å¯ä»¥è®¾ç½®/æ¸…é™¤ cronAutomationId çš„æ¥æºï¼Œç›´æŽ¥ä»¥ meta ä¸ºå‡†
    // å†™å…¥ï¼ˆç»•è¿‡ rememberTaskTarget çš„ merge-preserveï¼‰ï¼Œä»¥ä¾¿è§£ç»‘/åˆ é™¤ automation åŽèƒ½çœŸæ­£æ¸…ç©ºã€‚
    taskTargets.set(meta.taskId, {
      ...existing,
      taskId: meta.taskId,
      workspacePath: meta.workspacePath,
      workspaceIdentity: meta.workspaceIdentity,
      cronAutomationId: meta.cronAutomationId,
    });
    return meta;
  }

  async function resolveTaskIndexResumeHints(
    params: TaskTarget,
    reason: "replayable_snapshot" | "resume_task",
  ): Promise<{ model?: string; thoughtLevel?: string }> {
    const meta = await taskIndexRepo.getTaskMeta(params).catch((error) => {
      logger.warn(
        undefined,
        "è¯»å– task index resume hint å¤±è´¥ï¼Œç»§ç»­ä¸å¸¦åŽ†å²é…ç½®æ¢å¤",
        {
          error: error instanceof Error ? error.message : String(error),
          reason,
          taskId: params.taskId,
          workspaceIdentity: params.workspaceIdentity ?? null,
          workspacePath: params.workspacePath,
        },
      );
      return null;
    });
    const model = meta?.model?.trim();
    const thoughtLevel = meta?.thoughtLevel?.trim();
    if (model || thoughtLevel) {
      // task-local thoughtLevel å’Œ model ä¸€æ ·å±žäºŽåŽ†å² session æ¢å¤ hintã€‚
      // ä¸å›žå¡« thoughtLevel æ—¶ï¼ŒåŒ workspace çš„ draft é»˜è®¤å€¼ä¼šåœ¨ session/resume åŽè¦†ç›– active taskã€‚
      logger.info(undefined, "ä»Ž task index å›žå¡« ZCode session resume é…ç½®", {
        model: model || null,
        thoughtLevel: thoughtLevel || null,
        reason,
        taskId: params.taskId,
        workspaceIdentity: params.workspaceIdentity ?? null,
        workspacePath: params.workspacePath,
      });
    }
    return {
      ...(model ? { model } : {}),
      ...(thoughtLevel ? { thoughtLevel } : {}),
    };
  }

  async function syncTaskIndexMeta(meta: ZCodeTaskMeta): Promise<ZCodeTaskMeta> {
    const indexedMeta = await taskIndexRepo.syncTaskMeta({ meta });
    return rememberIndexedTaskMeta(indexedMeta);
  }

  async function syncTaskIndexSnapshot(
    snapshot: ZCodeSessionStateSnapshot,
  ): Promise<ZCodeTaskMeta> {
    const meta = snapshotToMeta(snapshot);
    // æ—§æ±¡æŸ“æ ‡ç­¾é¡µçš„æ˜¾å¼æ¢å¤ä¸èƒ½æŠŠåªè¯» child å†æ¬¡å†™è¿›ä¸»ä»»åŠ¡ç´¢å¼•ã€‚
    if (snapshot.session.sessionKind === "subagent_child") return meta;
    return syncTaskIndexMeta(meta);
  }

  async function updateIndexedTaskState(
    params: TaskTarget,
    patch: {
      pinned?: boolean;
      archived?: boolean;
      deleted?: boolean;
      title?: string;
      titleOverridden?: boolean;
      updatedAt?: number;
      unreadAt?: number;
    },
  ): Promise<ZCodeTaskMeta> {
    try {
      return await taskIndexRepo.updateTaskState({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        taskId: params.taskId,
        patch,
      });
    } catch (error) {
      // æ—§ ZCode session å¯èƒ½è¿˜æ²¡æœ‰è½»é‡ task index è¡Œã€‚
      // çŠ¶æ€åŠ¨ä½œåªåœ¨ç‚¹å¼€å…·ä½“ task åŽå‘ç”Ÿï¼Œæ­¤å¤„å…è®¸æŒ‰éœ€è¯»å–å½“å‰ task seed indexï¼Œ
      // ä½†ä¾§è¾¹æ å…¨é‡åˆ—è¡¨æŸ¥è¯¢ä»åªè¯» sqliteï¼Œä¸ä¼šå¯åŠ¨æ‰€æœ‰ workspace agentã€‚
      logger.warn(undefined, "task index ç¼ºå¤±ï¼ŒæŒ‰éœ€ä»Ž agent seed å½“å‰ task", error);
      await syncTaskIndexSnapshot(await resumeSnapshot(params));
      return taskIndexRepo.updateTaskState({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        taskId: params.taskId,
        patch,
      });
    }
  }

  function updateTaskIndexFromStreamEvent(params: TaskTarget, event: ZCodeStreamEvent): void {
    if (event.type === "session_info_update") {
      const patch: Parameters<typeof taskIndexRepo.applyAgentPatch>[0]["patch"] = {
        title: typeof event.title === "string" ? event.title : undefined,
        updatedAt: Date.now(),
      };
      if (event.target) {
        // session_info_update ç»å¸¸åªæºå¸¦æ ‡é¢˜æˆ–æ›´æ–°æ—¶é—´ï¼›åªæœ‰äº‹ä»¶æ˜¾å¼åŒ…å«
        // target æ—¶æ‰è¦†ç›– task-indexï¼Œé¿å…æŠŠä»Ž db.sqlite æ¢å¤å‡ºçš„ goal æ¸…æˆ undefinedã€‚
        patch.target = event.target.target;
      }
      void taskIndexRepo
        .applyAgentPatch({
          workspacePath: params.workspacePath,
          workspaceIdentity: params.workspaceIdentity,
          taskId: params.taskId,
          patch,
        })
        .catch((error) => {
          logger.warn(undefined, "åŒæ­¥ session_info_update åˆ° task index å¤±è´¥", error);
        });
      return;
    }

    if (event.type === "task_complete") {
      void taskIndexRepo
        .applyAgentPatch({
          workspacePath: params.workspacePath,
          workspaceIdentity: params.workspaceIdentity,
          taskId: params.taskId,
          patch: {
            status: "completed",
            lastError: undefined,
            updatedAt: Date.now(),
          },
        })
        .catch((error) => {
          logger.warn(undefined, "åŒæ­¥ task_complete åˆ° task index å¤±è´¥", error);
        });
      return;
    }

    if (event.type === "task_error") {
      void taskIndexRepo
        .applyAgentPatch({
          workspacePath: params.workspacePath,
          workspaceIdentity: params.workspaceIdentity,
          taskId: params.taskId,
          patch: {
            status: "error",
            lastError: {
              code: event.code,
              ...(event.detail ? { detail: event.detail } : {}),
              message: event.error,
              traceId: event.traceId,
              taskId: params.taskId,
              ...(event.attribution ? { attribution: event.attribution } : {}),
            },
            updatedAt: Date.now(),
          },
        })
        .catch((error) => {
          logger.warn(undefined, "åŒæ­¥ task_error åˆ° task index å¤±è´¥", error);
        });
    }
  }

  function updateTaskApiRetryFromStreamEvent(params: TaskTarget, event: ZCodeStreamEvent): void {
    const key = taskKey(params);
    if (event.type === "session_info_update" && event.apiRetry !== undefined) {
      apiRetryByTaskKey.set(key, event.apiRetry ?? null);
      return;
    }
    if (event.type === "task_complete" || event.type === "task_error") {
      apiRetryByTaskKey.set(key, null);
    }
  }

  function hasActiveTaskApiRetry(params: TaskTarget): boolean {
    return apiRetryByTaskKey.get(taskKey(params)) != null;
  }

  function snapshotToZCode(
    snapshot: ZCodeSessionStateSnapshot,
    options?: { includeEmptyPendingElicitations?: boolean },
  ): ZCodeTaskSnapshot {
    const meta = snapshotToMeta(snapshot);
    const activeGoalIterationCount = getSnapshotGoalActiveIterationCount(snapshot);
    const goalIterationByAssistantMessageId = getZCodeGoalIterationByAssistantMessageId(
      snapshot.messages,
      {
        ...(activeGoalIterationCount > 0 ? { maxGoalIteration: activeGoalIterationCount } : {}),
        target: snapshot.projection.target,
      },
    );
    const backgroundTaskNotifications = collectZCodeBackgroundTaskNotificationsByToolUseId(
      snapshot.messages,
    );
    const messages = mergeLiveToolProjectionIntoSnapshotMessages(
      meta,
      normalizeGoalVerificationTimelineMessageOrder(
        addGoalVerificationTimelineSnapshotFallback(
          addSessionForkSnapshotFallback(
            coalesceConsecutiveZCodeAssistants(
              getZCodeUserVisibleMessages(snapshot.messages, {
                target: snapshot.projection.target,
              }).map((message) =>
                mapMessage(
                  message,
                  message.info.role === "assistant"
                    ? goalIterationByAssistantMessageId.get(message.info.messageId)
                    : undefined,
                  backgroundTaskNotifications,
                ),
              ),
            ),
            snapshot,
          ),
          snapshot,
        ),
      ),
    );
    const pendingPermissions: ZCodePermissionRequest[] = snapshot.projection.pendingPermissions
      .filter((permission) => !isUserInputBackedPermissionToolName(permission.toolName))
      .map((permission) => pendingPermissionToStreamEvent(snapshot.session.sessionId, permission));
    const pendingElicitations = snapshot.projection.pendingPermissions
      .filter((permission) => isUserInputBackedPermissionToolName(permission.toolName))
      .map((permission) =>
        pendingUserInputBackedPermissionToElicitationEvent(snapshot.session.sessionId, permission),
      )
      .filter(
        (event): event is Extract<ZCodeStreamEvent, { type: "elicitation_request" }> =>
          event !== null,
      );
    const backgroundTaskControls = parseZCodeBackgroundTaskControlItems(
      snapshot.projection.backgroundJobs,
    );
    setTaskBackgroundTaskControlCache(
      backgroundTaskControlsByTaskKey,
      taskKey(meta),
      backgroundTaskControls,
    );
    return {
      meta,
      messages,
      fileChanges: [],
      configOptions: settingsToConfigOptions(snapshot.settings),
      // agent åè®® snapshot å«æœ‰ `/compact` ç­‰å‘½ä»¤ï¼›task facade æŠ•å½±æ—¶å¿…é¡»ä¿ç•™ï¼Œ
      // å¦åˆ™ replayable/legacy task restore ä¼šæŠŠ UI çš„ slashCommands å›žå¡«æˆç©ºã€‚
      slashCommands: snapshot.slashCommands ?? EMPTY_SLASH_COMMANDS,
      runtime: {
        activeTurnKind: snapshot.runtime.activeTurnKind,
        apiRetry: apiRetryByTaskKey.get(taskKey(meta)) ?? null,
        contextUsage:
          contextUsageFromRuntime(snapshot.runtime.contextUsage) ??
          contextUsageFromProjection(snapshot.projection) ??
          undefined,
        pendingPermissions,
        backgroundBashJobs: backgroundTaskControls,
        // æ‰‹æœº replayable å¿«ç…§éœ€è¦ç”¨ç©ºæ•°ç»„è¡¨è¾¾â€œç”¨æˆ·è¾“å…¥é˜Ÿåˆ—å·²æ¸…ç©ºâ€ã€‚
        // desktop-continuous ä¸»é“¾è·¯ä»ä¿æŒåŽŸæŠ•å½±å½¢æ€ï¼Œé¿å…æŠŠ replayable çš„é›†åˆæ¢å¤è¯­ä¹‰æ‰©æ•£è¿‡åŽ»ã€‚
        ...(pendingElicitations.length > 0 || options?.includeEmptyPendingElicitations
          ? { pendingElicitations }
          : {}),
        pendingCommands: runtimeCommands.get(taskKey(meta)) ?? [],
        // todo çš„æƒå¨æ•°æ®åœ¨ agent DBï¼›åŽ†å²æ¢å¤æ—¶å¿…é¡»éš snapshot æ˜ å°„ç»™ UIï¼Œ
        // ä¸èƒ½åªä¾èµ– renderer è¿è¡ŒæœŸæ”¶åˆ°è¿‡çš„ plan stream eventã€‚
        plan: sessionTodosToPlanSteps(snapshot.todos),
        goalStats: sessionGoalStatsToRuntime(snapshot.goalStats),
        goalVerifications: snapshot.runtime.goalVerifications ?? null,
        goalVerificationTimeline: snapshot.runtime.goalVerificationTimeline ?? null,
        todoGroups: sessionTodoGroupsToRuntime(snapshot.todoGroups),
      },
    };
  }

  function mapServiceEvent(params: TaskTarget, event: ZCodeAgentServiceEvent): void {
    if (event.type === "snapshot") {
      void syncTaskIndexSnapshot(event.snapshot).catch((error) => {
        logger.warn(undefined, "åŒæ­¥ ZCode snapshot åˆ° task index å¤±è´¥", error);
      });
      const snapshotEvent: ZCodeStreamEvent = {
        type: "task_snapshot_updated",
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        workspaceKey: workspaceKey(params),
        taskId: params.taskId,
        traceId: generateTraceId(params.taskId),
      };
      emitTaskEvent(params, snapshotEvent);
      emitWorkspaceConfig(params, event.snapshot.settings);
      return;
    }

    if (event.type === "state.updated") {
      for (const streamEvent of mapStateUpdated(params, event.notification)) {
        emitTaskEvent(params, streamEvent);
      }
      return;
    }

    if (event.type === "permission.request") {
      emitTaskEvent(params, permissionRequestToStreamEvent(params.taskId, event.request));
      return;
    }

    if (event.type === "userInput.request") {
      emitTaskEvent(params, userInputRequestToElicitationStreamEvent(params.taskId, event.request));
      return;
    }

    if (event.type === "userInput.response") {
      emitTaskEvent(
        params,
        userInputResponseToElicitationStreamEvent(params.taskId, event.requestId, event.response),
      );
      return;
    }

    if (event.type === "session.event") {
      recordAgentModelNetworkTelemetry(event.event);
      if (event.event.type === "turn.started") {
        const payload = asRecord(event.event.payload);
        const inputId = stringValue(payload.inputId);
        if (inputId) {
          // remote/replayable/fallback è®¢é˜…ä¸ä¸€å®šç”± sendPrompt å»ºç«‹ã€‚
          // turn.started æ˜¯åŽç»­ model.streaming äº‹ä»¶å½’å±žå½“å‰è¾“å…¥çš„åè®®äº‹å®žï¼Œå¿…é¡»åœ¨ services æŠ•å½±å±‚åŒæ­¥è®°å½•ã€‚
          activePromptInputIds.set(taskKey(params), inputId);
        }
      }
    }

    const activePromptInputId = activePromptInputIds.get(taskKey(params));
    const streamEvents = mapSessionEvent(
      params,
      event.event,
      streamedTurnKeys,
      activePromptInputId,
      getToolProjectionMemory(params),
      backgroundTaskControlsByTaskKey,
      hasActiveTaskApiRetry(params),
    );
    for (const streamEvent of streamEvents) {
      rememberLiveToolProjection(params, streamEvent);
      updateTaskApiRetryFromStreamEvent(params, streamEvent);
      updateTaskIndexFromStreamEvent(params, streamEvent);
      emitTaskEvent(params, streamEvent);
      if (streamEvent.type === "task_complete" || streamEvent.type === "task_error") {
        completeRuntimeCommandForTerminalEvent(params, streamEvent);
      }
    }
    if (event.event.type === "turn.completed" || event.event.type === "turn.failed") {
      activePromptInputIds.delete(taskKey(params));
    }
  }

  let disposed = false;

  function handleTaskIndexTerminalEvent(event: ZCodeTaskIndexTerminalEvent): void {
    const params: TaskTarget = {
      taskId: event.target.sessionId,
      workspacePath: event.target.workspacePath,
      workspaceIdentity: event.target.workspaceIdentity,
    };
    const key = taskKey(params);
    if (!activePromptInputIds.has(key) && !runtimeCommands.has(key)) {
      return;
    }
    // ç»ˆæ€äº‹ä»¶æºæ¢æˆ v4 sessions-index çš„ phase è¿ç§»ï¼Œæ‘˜è¦ä¸æºå¸¦ inputIdï¼Œ
    // ä¸€å¾‹ç”¨æœ¬åœ°è®°å½•çš„ active input æ”¶å£ï¼ˆæ—§åè®® payload.inputId ç¼ºå¤±æ—¶çš„å…œåº•è·¯å¾„ï¼Œè¯­ä¹‰ä¸å˜ï¼‰ã€‚
    const terminalInputId = activePromptInputIds.get(key);
    completeRuntimeCommandByInputId(params, terminalInputId, event.kind);
    // turn ç»ˆæ€åªè¯´æ˜Ž stream æ”¶å£å·²åˆ°ï¼Œä¸ä»£è¡¨ agent server çš„ active lock å·²é‡Šæ”¾ã€‚
    // è¿™é‡Œä»…æ”¶å£å½“å‰ inputï¼›ä¸‹ä¸€æ¡ host command å¿…é¡»ç­‰ ready äº‹ä»¶è§¦å‘ã€‚
    activePromptInputIds.delete(key);
  }

  const taskIndexTerminalDisposable = taskIndexSyncer.onSessionTerminalEvent((event) => {
    queueMicrotask(() => {
      if (!disposed) {
        handleTaskIndexTerminalEvent(event);
      }
    });
  });

  function handleTaskIndexReadyEvent(event: ZCodeTaskIndexReadyEvent): void {
    const params: TaskTarget = {
      taskId: event.target.sessionId,
      workspacePath: event.target.workspacePath,
      workspaceIdentity: event.target.workspaceIdentity,
    };
    const key = taskKey(params);
    if (!activePromptInputIds.has(key) && !runtimeCommands.has(key)) {
      return;
    }
    const activeInputId = activePromptInputIds.get(key);
    completeRuntimeCommandByInputId(params, activeInputId, event.reason);
    // prompt_completed/prompt_failed ç”± agent server åœ¨é‡Šæ”¾ activeAbortController åŽå‘å‡ºã€‚
    // æ‰‹æœº host command queue ä»¥å®ƒä½œä¸ºâ€œä¸‹ä¸€æ¡å¯ä»¥å‘é€â€çš„ ready è¾¹ç•Œï¼Œé¿å… fixed delay é‡è¯•ï¼Œ
    // ä¹Ÿä¸æ”¹å˜æ¡Œé¢ continuous çš„ renderer-local queueã€‚
    activePromptInputIds.delete(key);
    scheduleRuntimeCommandDrain(params, "session-ready");
  }

  const taskIndexReadyDisposable = taskIndexSyncer.onSessionReadyEvent((event) => {
    queueMicrotask(() => {
      if (!disposed) {
        handleTaskIndexReadyEvent(event);
      }
    });
  });

  function disposeLocalTaskState(): void {
    taskIndexTerminalDisposable.dispose();
    taskIndexReadyDisposable.dispose();
    taskIndexRepo.close();
    for (const emitter of taskEmitters.values()) emitter.dispose();
    for (const emitter of globalTaskEmitters.values()) emitter.dispose();
    errorEmitter.dispose();
    taskEmitters.clear();
    globalTaskEmitters.clear();
    runtimeCommandDrains.clear();
  }

  async function disposeZCodeAgentServiceAndWait(): Promise<void> {
    const agentService = options.zcodeAgentService as IZCodeAgentService & {
      disposeAllAndWait?: () => Promise<void>;
    };
    if (agentService.disposeAllAndWait) {
      await agentService.disposeAllAndWait();
      return;
    }
    agentService.disposeAll();
  }

  const service: IZCodeTaskService & {
    disposeAll(): void;
    disposeAllAndWait(): Promise<void>;
  } = {
    async initialize(params) {
      const result = await options.zcodeAgentService.initialize(params);
      return {
        available: result.available,
        version: result.protocolName
          ? `${result.protocolName}/${result.protocolVersion ?? 1}`
          : undefined,
      };
    },

    async releaseWorkspacePreparation(params): Promise<void> {
      // å…³é—­ workspace UI åªä¼šé‡Šæ”¾ RPC ä½¿ç”¨æ–¹ï¼Œä¸ä¼šè‡ªåŠ¨ç»ˆæ­¢å·²é¢„çƒ­çš„ Agentã€‚
      // WSL Host å…±äº«åŽ Host ä¼šç»§ç»­å­˜æ´»ï¼Œå› æ­¤å¿…é¡»æŒ‰ workspaceKey æ˜¾å¼å›žæ”¶å¯¹åº” runtimeã€‚
      await options.zcodeAgentService.disposeWorkspace(normalizeWorkspaceParams(params));
    },

    async createTask(params): Promise<ZCodeTaskCreateResult> {
      const target = normalizeWorkspaceParams(params);
      const requestedSelection =
        params.modelSelection ??
        (params.model
          ? {
              ...parseModelPickerValue(params.model),
              ...(params.thoughtLevel ? { options: { reasoningLevel: params.thoughtLevel } } : {}),
            }
          : undefined);
      const draftSessionId = params.draftSessionId?.trim();
      const mcpServers = await resolveProductMcpServers(params.mcpServers);
      let snapshot: ZCodeSessionStateSnapshot | null = null;
      if (draftSessionId && !mcpServers) {
        try {
          snapshot = await options.zcodeAgentService.readSession({
            ...target,
            sessionId: draftSessionId,
          });
          if (requestedSelection) {
            if (!sameModelSelection(snapshot.settings.model.current, requestedSelection)) {
              // replayable é¦–å‘å¤ç”¨ draft session æ—¶ï¼Œdraft å¯èƒ½ä»åœåœ¨é¢„çƒ­æ—¶çš„æ—§æ¨¡åž‹ã€‚
              // å¤ç”¨å‰å¿…é¡»åŒæ­¥ UI å½“å‰æ¨¡åž‹ï¼Œå¦åˆ™æ‰‹æœºè¿œæŽ§é¦–å‘ä¼šæ˜¾ç¤ºæ–°æ¨¡åž‹ä½†çœŸå®žè¯·æ±‚ä»ç”¨æ—§æ¨¡åž‹ã€‚
              snapshot = await options.zcodeAgentService.setModel({
                ...target,
                sessionId: draftSessionId,
                model: requestedSelection,
              });
            }
          }
          if (
            requestedSelection?.options?.reasoningLevel &&
            snapshot.settings.thoughtLevel.current !== requestedSelection.options.reasoningLevel
          ) {
            // replayable é¦–å‘å¤ç”¨ draft session æ—¶ä¹Ÿå¿…é¡»ä»¥ UI å½“å‰ thought_level ä¸ºå‡†ã€‚
            // å¦åˆ™æ‰‹æœºè¿œæŽ§å¯èƒ½å¤ç”¨æ—§ draft sessionï¼Œå¯¼è‡´é¦–å‘è¯·æ±‚æ²¿ç”¨è¿‡æœŸæŽ¨ç†å¼ºåº¦ã€‚
            snapshot = await options.zcodeAgentService.setThoughtLevel({
              ...target,
              sessionId: draftSessionId,
              thoughtLevel: requestedSelection.options.reasoningLevel,
            });
          }
        } catch (error) {
          if (!isSessionMissingError(error)) {
            throw error;
          }
          // æ‰‹æœºç«¯è‰ç¨¿ session å’Œæ¡Œé¢ä¸€æ ·åªå­˜åœ¨ agent runtime å†…å­˜é‡Œã€‚
          // è¿œç«¯é‡è¿ž/agent é‡å¯åŽæ—§ draftSessionId å¯èƒ½å¤±æ•ˆï¼›é¦–å‘æ¶ˆè´¹ç‚¹é™çº§æ–°å»ºï¼Œé¿å…ç”¨æˆ·å¡æ­»ã€‚
          logger.warn(
            undefined,
            "æ‰‹æœº replayable draft session å·²å¤±æ•ˆï¼Œé™çº§åˆ›å»ºæ–° task",
            {
              draftSessionId,
              workspaceIdentity: target.workspaceIdentity ?? null,
              workspacePath: target.workspacePath,
            },
          );
        }
      }
      if (!snapshot) {
        // v4 createSession å‘½ä»¤å·²åŽŸç”Ÿï¼ˆdesktop
        // v4 UI åœ¨ç”¨ï¼‰ï¼Œä½† replayable createTask éœ€è¦ mcpServers/model/importedHistory
        // è½½è·ä¸Ž snapshot è¿”å›žå€¼ï¼ˆtask index åŒæ­¥ä¾èµ–ï¼‰ï¼Œv4 å‘½ä»¤é¢å‡æœªå»ºæ¨¡ï¼›
        if (params.v4Create === true) {
          const model = requestedSelection;
          const ack = assertV4CommandAckOk(
            "createSession",
            await options.zcodeAgentService.sendConversationCommandV4({
              ...target,
              envelope: createHostCommandEnvelope({
                type: "createSession",
                sessionId: null,
                payload: {
                  workspaceId: target.workspaceIdentity?.trim() || target.workspacePath,
                  config: {
                    ...(model ? { provider: model.providerId, model: model.modelId } : {}),
                    ...(model?.options?.reasoningLevel
                      ? { thought: model.options.reasoningLevel }
                      : {}),
                    ...(params.mode ? { mode: toZCodeMode(params.mode) } : {}),
                  },
                  ...(mcpServers ? { mcpServers } : {}),
                },
              }),
            }),
            `workspace=${target.workspacePath}`,
          );
          const sessionId = ack.result?.type === "createSession" ? ack.result.sessionId : undefined;
          if (!sessionId) {
            throw new Error("v4 createSession accepted without sessionId result");
          }
          snapshot = await options.zcodeAgentService.readSession({
            ...target,
            sessionId,
          });
        } else {
          snapshot = await options.zcodeAgentService.createSession({
            ...target,
            sessionTraceId: createSessionTraceId(),
            mode: toZCodeMode(params.mode),
            model: requestedSelection,
            thoughtLevel: requestedSelection?.options?.reasoningLevel,
            ...(params.automationId || params.deferPersistenceUntilFirstPrompt
              ? {
                  // ä¿®å¤åŽŸå› ï¼šautomation / é—²æ—¶ä»»åŠ¡æ–°å»ºç©º session åŽä¼šç«‹å³ sendTextã€‚session_input æœ‰
                  // session å¤–é”®ï¼Œå¿…é¡»è®© V4 admission åœ¨é¦–å‘å‰ç»Ÿä¸€æŒä¹…åŒ– session ä¸»è®°å½•ï¼›
                  // å¦åˆ™ create è¿”å›žæˆåŠŸåŽç¬¬ä¸€æ¡ prompt ä¼šç¨³å®šè§¦å‘ FOREIGN KEY constraint failedã€‚
                  persistence: "deferred" as const,
                }
              : {}),
            ...(params.automationId
              ? {
                  titleGenerationEnabled: false,
                }
              : {}),
            // Bugfix: replayable task facade åˆ›å»º session æ—¶åŒæ ·ä¼šå¯åŠ¨ runtimeï¼›
            // ä¹‹å‰è¿™é‡Œä¸¢æŽ‰ mcpServersï¼Œå¯¼è‡´æ‰‹æœºè¿œæŽ§è·¯å¾„å’Œ desktop-continuous çš„ MCP è¡Œä¸ºä¸ä¸€è‡´ã€‚
            mcpServers,
          });
        }
      }
      const baseMeta = snapshotToMeta(snapshot);
      const meta = await syncTaskIndexMeta({
        ...baseMeta,
        ...(params.automationId ? { cronAutomationId: params.automationId } : {}),
        // é—²æ—¶æ´¾å‘åœ¨åˆ›å»ºæ—¶å³ç›–ç« æŒä¹…å½’å±žï¼›æœˆäº®å›¾æ ‡ä¸ŽåŽç»­ç³»ç»Ÿåˆ†ç»„å½’å±žéƒ½åªçœ‹è¯¥æ ‡è®°ã€‚
        ...(params.offPeakTaskId ? { offPeakTaskId: params.offPeakTaskId } : {}),
      });
      await taskIndexRepo.initializeGroupedTaskAtTop({
        workspacePath: meta.workspacePath,
        workspaceIdentity: meta.workspaceIdentity,
        taskId: meta.taskId,
      });
      notifySyncerSession({
        taskId: meta.taskId,
        workspacePath: meta.workspacePath,
        workspaceIdentity: meta.workspaceIdentity,
      });
      emitWorkspaceConfig(target, snapshot.settings);
      // æ‰‹æœºç«¯é€šè¿‡ shared-host åˆ›å»º task æ—¶ï¼Œæ¡Œé¢ renderer æ²¡æœ‰æœ¬åœ°ä¹è§‚æ’å…¥ã€‚
      // create äº‹ä»¶å¿…é¡»ä¿ç•™ task_created è¯­ä¹‰ï¼Œå¦åˆ™ UI ä¼šæŒ‰æ™®é€š meta äº‹ä»¶åªé‡æŽ’å·²å­˜åœ¨é¡¹ï¼Œè¿œæŽ§é¦–é¡µå°±æ‹¿ä¸åˆ°æ–°ä»»åŠ¡ã€‚
      emitWorkspaceTaskListChanged(target, meta, "task_created");
      // task åˆ›å»ºç»“æžœéœ€è¦æºå¸¦ agent åè®®å¿«ç…§é‡Œçš„å‘½ä»¤åˆ—è¡¨ï¼›å¦åˆ™ replayable é¦–å±ä¼šè¦†ç›–ä¸ºç©ºã€‚
      return {
        ...meta,
        initialSlashCommands: snapshot.slashCommands ?? EMPTY_SLASH_COMMANDS,
      };
    },

    async sendPrompt(params): Promise<void> {
      const storedTarget = getTaskTarget(params.taskId);
      const target = {
        ...storedTarget,
        ...(params.remoteSessionId ? { remoteSessionId: params.remoteSessionId } : {}),
      };
      await sendPromptToAgent(target, {
        traceId: params.traceId,
        queryId: params.queryId,
        messageId: params.messageId,
        content: params.content,
        attachments: params.attachments,
        ...turnAttributionOf(params),
        toolDenylist: params.toolDenylist,
        botDeliveryTarget: params.botDeliveryTarget,
        clientId: params.clientId,
        clientMode: params.clientMode,
        modelSelection: params.modelSelection,
        modelExecution: params.modelExecution,
      });
    },

    async deliverSessionMessage(
      _request: SessionMessageSendRequested,
    ): Promise<SessionMessageDeliveryResult> {
      unsupported("deliverSessionMessage");
    },

    async sendSessionMessageDeliveryResult(): Promise<void> {
      unsupported("sendSessionMessageDeliveryResult");
    },

    async enqueueTaskCommand(params): Promise<ZCodeEnqueueTaskCommandResult> {
      assertCurrentOwnerRun(params, params.ownerRunId);
      const workspaceKeyValue = workspaceKey(params);
      const command: ZCodeTaskRuntimeCommand = {
        commandId: params.commandId,
        taskId: params.taskId,
        traceId: params.traceId,
        queryId: params.queryId,
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        workspaceKey: workspaceKeyValue,
        status: "accepted",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        clientId: params.clientId,
        clientLabel: params.clientLabel,
        type: "send_prompt",
        content: params.content,
        attachments: params.attachments,
        // manual run / æ‰‹æœº replayable çš„ prompt å¯èƒ½å…ˆè¿›å…¥ host command queueï¼›
        // è‹¥è¿™é‡Œä¸¢ automationIdï¼Œdrain æ—¶ä¼šæŒ‰æ™®é€šç”¨æˆ·è¾“å…¥å‘é€ï¼ŒCronCreate ä¼šé‡æ–°æš´éœ²ã€‚
        automationId: params.automationId,
      };
      const key = taskKey(params);
      runtimeCommands.set(key, [...(runtimeCommands.get(key) ?? []), command]);
      // æ‰‹æœº replayable host command è¢« accepted åŽï¼Œå‰ç«¯æœ¬åœ° drain ä¼šä¸»åŠ¨è·³è¿‡ hostCommandã€‚
      // å› æ­¤ host éœ€è¦åœ¨å½“å‰ task å·²ç©ºé—²æ—¶è‡ªè¡Œè§¦å‘æ¶ˆè´¹ï¼›æ¡Œé¢ continuous ä¸è°ƒç”¨è¯¥å…¥å£ï¼Œä¸ä¼šå—å½±å“ã€‚
      scheduleRuntimeCommandDrain(params, "enqueue");
      return { accepted: true, command };
    },

    async promoteTaskCommand(params): Promise<ZCodeEnqueueTaskCommandResult> {
      assertCurrentOwnerRun(params, params.ownerRunId);
      const key = taskKey(params);
      const commands = runtimeCommands.get(key) ?? [];
      const command = commands.find((candidate) => candidate.commandId === params.commandId);
      if (!command) {
        throw Object.assign(new Error("Task command not found."), {
          code: "OWNER_COMMAND_FAILED",
        });
      }
      if (command.status === "running") {
        return { accepted: true, command };
      }
      const nextCommand = {
        ...command,
        status: "accepted" as const,
        updatedAt: Date.now(),
      };
      runtimeCommands.set(key, [nextCommand, ...commands.filter((item) => item !== command)]);
      scheduleRuntimeCommandDrain(params, "promote");
      return { accepted: true, command: nextCommand };
    },

    async cancelTaskCommand(params): Promise<ZCodeCancelTaskCommandResult> {
      assertCurrentOwnerRun(params, params.ownerRunId);
      const key = taskKey(params);
      const commands = runtimeCommands.get(key) ?? [];
      const command = commands.find((candidate) => candidate.commandId === params.commandId);
      if (!command) {
        logger.info(undefined, "ZCode task command å–æ¶ˆæ—¶å·²ä¸å­˜åœ¨", {
          commandId: params.commandId,
          taskId: params.taskId,
          workspaceIdentity: params.workspaceIdentity ?? null,
          workspaceKey: resolveWorkspaceKey(params),
          workspacePath: params.workspacePath,
        });
        return {
          canceled: true,
          commandId: params.commandId,
          reason: "not_found",
        };
      }
      if (command.status === "running") {
        logger.info(command.traceId, "ZCode task command å·²å¼€å§‹è¿è¡Œï¼Œè·³è¿‡å–æ¶ˆ", {
          commandId: command.commandId,
          taskId: params.taskId,
          workspaceIdentity: params.workspaceIdentity ?? null,
          workspaceKey: resolveWorkspaceKey(params),
          workspacePath: params.workspacePath,
        });
        return {
          canceled: false,
          commandId: command.commandId,
          reason: "already_running",
          status: command.status,
        };
      }
      // æ‰‹æœº replayable é˜Ÿåˆ—çš„äº‹å®žæºåœ¨ host runtime command queueã€‚
      // åˆ é™¤æŒ‰é’®ä¸èƒ½åªæ¸… renderer æœ¬åœ° storeï¼Œå¦åˆ™ä¸‹ä¸€æ¬¡ snapshot ä¼šæŠŠå·² accepted çš„å‘½ä»¤æ¢å¤å›žæ¥ã€‚
      setRuntimeCommands(
        params,
        commands.filter((item) => item.commandId !== command.commandId),
      );
      emitRuntimeCommandSnapshotUpdated(params, command.traceId);
      logger.info(command.traceId, "ZCode task command å·²å–æ¶ˆ", {
        commandId: command.commandId,
        status: command.status,
        taskId: params.taskId,
        workspaceIdentity: params.workspaceIdentity ?? null,
        workspaceKey: resolveWorkspaceKey(params),
        workspacePath: params.workspacePath,
      });
      return {
        canceled: true,
        commandId: command.commandId,
        status: command.status,
      };
    },

    async stopGeneration(params): Promise<void> {
      const startedAt = Date.now();
      const target = params.workspacePath
        ? {
            taskId: params.taskId,
            workspacePath: params.workspacePath,
            workspaceIdentity: params.workspaceIdentity,
          }
        : getTaskTarget(params.taskId);
      logger.info(params.runId, "ZCode task facade stopGeneration å¼€å§‹", {
        hasRunId: Boolean(params.runId),
        taskId: params.taskId,
        workspaceIdentity: target.workspaceIdentity ?? null,
        workspaceKey: resolveWorkspaceKey(target),
        workspacePath: target.workspacePath,
      });
      // session/stop â†’ v4 stop å‘½ä»¤ï¼ˆgoal-pause barrier è¯­ä¹‰ç”± CLI åŽŸç”Ÿ handler æ‰¿æŽ¥ï¼‰ã€‚
      const ack = await options.zcodeAgentService.sendConversationCommandV4({
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        envelope: createHostCommandEnvelope({
          type: "stop",
          payload: {},
          sessionId: params.taskId,
        }),
      });
      assertV4CommandAckOk("stop", ack, `session=${params.taskId}`);
      logger.info(params.runId, "ZCode task facade stopGeneration ACK", {
        durationMs: Date.now() - startedAt,
        taskId: params.taskId,
        workspaceIdentity: target.workspaceIdentity ?? null,
        workspaceKey: resolveWorkspaceKey(target),
        workspacePath: target.workspacePath,
      });
    },

    async compactSession(params) {
      // v4 compact æ˜¯ CAS å‘½ä»¤ï¼ˆå¿…å¸¦ v4 conversation revision
      // çš„ baseRevisionï¼‰ï¼Œè€Œæœ¬ facade çš„ expectedRevision æ˜¯æ—§åè®® stateRevisionâ€”â€”
      // ä¸¤å¥—è®¡æ•°å™¨ä¸å¯äº’æ¢ï¼›replayable ä¾§æ‹¿åˆ° v4 revision å‰å¼ºè¡Œè¿ç§»ä¼šé€ æˆå‡ staleã€‚
      // ä¸” v4 compact æ—  instructions/runtimeModel è½½è·ã€‚
      const target = params.workspacePath
        ? {
            taskId: params.taskId,
            workspacePath: params.workspacePath,
            workspaceIdentity: params.workspaceIdentity,
          }
        : getTaskTarget(params.taskId);
      notifySyncerSession(target);
      if (params.inputId) {
        activePromptInputIds.set(taskKey(target), params.inputId);
      }
      try {
        const result = await options.zcodeAgentService.compactSession({
          workspacePath: target.workspacePath,
          workspaceIdentity: target.workspaceIdentity,
          sessionId: params.taskId,
          inputId: params.inputId,
          instructions: params.instructions,
          expectedRevision: params.expectedRevision,
        });
        if (result.compact?.state === "accepted") {
          return result;
        }
        const meta = await syncTaskIndexSnapshot(result.snapshot);
        // compact æ”¶æ•›æ˜¯çŠ¶æ€åŒæ­¥ï¼Œä¸æ¶‰åŠå½’å±žï¼›ç¼ºçœ task_meta_changed ä¼šè§¦å‘å…¨å±€ membership é‡æ‹‰ã€‚
        emitWorkspaceTaskListChanged(target, meta, "task_status_changed");
        activePromptInputIds.delete(taskKey(target));
        return result;
      } catch (error) {
        activePromptInputIds.delete(taskKey(target));
        throw error;
      }
    },

    async goalSession(params) {
      // v4 sendGoalCommand åªè¦†ç›– set è¯­ä¹‰ï¼ˆtext åŽŸæ–‡ï¼‰ï¼Œ
      // æœ¬ facade çš„ action=resume/clear/replace/status ä¾èµ–æ—§ op çš„ç»“æž„åŒ– action é¢
      // ï¼ˆv4 ä¾§ resumeGoal æ˜¯ CAS å‘½ä»¤ï¼Œrevision è®¡æ•°å™¨é—®é¢˜åŒ compactSessionï¼‰ã€‚
      // è¿‡æ¸¡å½’å®¿ = replayable v4 è¯»è·¯å¾„æ”¶å£ï¼Œä¸Ž compactSession åŒæ‰¹ã€‚
      const startedAt = Date.now();
      const target = params.workspacePath
        ? {
            taskId: params.taskId,
            workspacePath: params.workspacePath,
            workspaceIdentity: params.workspaceIdentity,
          }
        : getTaskTarget(params.taskId);
      notifySyncerSession(target);
      const mayStartContinuation =
        params.action === "set" || params.action === "replace" || params.action === "resume";
      if (mayStartContinuation) {
        // goal resume ä¹Ÿå¯èƒ½å¯åŠ¨æ–°ä¸€è½®æ¨¡åž‹è¾“å‡ºï¼Œä¸èƒ½ç»§æ‰¿ä¸Šä¸€è½® live-only å·¥å…·ã€‚
        clearLiveToolProjection(target);
        clearStreamingToolInputCache(target);
      }
      if (params.inputId && mayStartContinuation) {
        activePromptInputIds.set(taskKey(target), params.inputId);
      }
      logger.info(params.inputId, "[zcode-task-service] goalSession start", {
        action: params.action,
        hasObjective: Boolean(params.objective?.trim()),
        mayStartContinuation,
        taskId: params.taskId,
        workspaceIdentity: target.workspaceIdentity,
        workspacePath: target.workspacePath,
      });
      const result = await options.zcodeAgentService.goalSession({
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        sessionId: params.taskId,
        inputId: params.inputId,
        action: params.action,
        objective: params.objective,
        expectedRevision: params.expectedRevision,
      });
      logger.info(params.inputId, "[zcode-task-service] goalSession agent è¿”å›ž", {
        action: params.action,
        durationMs: Date.now() - startedAt,
        responseLength: result.response?.length ?? 0,
        startedTurn: result.startedTurn,
        status: result.snapshot.session.status,
        taskId: params.taskId,
        workspaceIdentity: target.workspaceIdentity,
        workspacePath: target.workspacePath,
      });
      const syncStartedAt = Date.now();
      const meta = await syncTaskIndexSnapshot(result.snapshot);
      // goal åŠ¨ä½œåŽçš„å¿«ç…§æ”¶æ•›åŒä¸ºçŠ¶æ€åŒæ­¥ï¼Œä¸æ¶‰åŠå½’å±žï¼Œé¿å…å…¨å±€ membership é‡æ‹‰ã€‚
      emitWorkspaceTaskListChanged(target, meta, "task_status_changed");
      logger.info(params.inputId, "[zcode-task-service] goalSession task index åŒæ­¥å®Œæˆ", {
        action: params.action,
        durationMs: Date.now() - startedAt,
        startedTurn: result.startedTurn,
        status: result.snapshot.session.status,
        syncDurationMs: Date.now() - syncStartedAt,
        taskId: params.taskId,
        workspaceIdentity: target.workspaceIdentity,
        workspacePath: target.workspacePath,
      });
      if (!mayStartContinuation || result.snapshot.session.status !== "running") {
        activePromptInputIds.delete(taskKey(target));
      }
      return result;
    },

    async respondPermission(params): Promise<boolean> {
      const target = params.workspacePath
        ? {
            taskId: params.taskId,
            workspacePath: params.workspacePath,
            workspaceIdentity: params.workspaceIdentity,
          }
        : getTaskTarget(params.taskId);
      // permission å›žæ‰§æ”¶æ•› v4 resolveInteractionã€‚
      // interactionId â‰¡ ä¸šåŠ¡ requestIdï¼ˆCLI interaction-broker åŒæºæ³¨å†Œï¼‰ï¼›optionId ç”±
      // CLI ä¾§ buildProtocolPermissionOptions ç²¾ç¡®å›žæ˜  responseï¼ˆallow_project çš„
      // permissionUpdates æŒä¹…åŒ–è§„åˆ™ä¸ä¸¢ï¼Œè§ interaction-broker v4AnswerToPermissionResponseï¼‰ã€‚
      const ack = await options.zcodeAgentService.sendConversationCommandV4({
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        envelope: createHostCommandEnvelope({
          type: "resolveInteraction",
          payload: {
            interactionId: params.requestId,
            answer: { optionId: params.optionId },
          },
          sessionId: params.taskId,
        }),
      });
      assertV4CommandAckOk("resolveInteraction", ack, `permission ${params.requestId}`);
      return true;
    },

    async respondElicitation(params): Promise<boolean> {
      const target = params.workspacePath
        ? {
            taskId: params.taskId,
            workspacePath: params.workspacePath,
            workspaceIdentity: params.workspaceIdentity,
          }
        : getTaskTarget(params.taskId);
      // AskUserQuestion/plan-approval å›žæ‰§æ”¶æ•› v4 resolveInteractionã€‚
      // answer.action/content æ˜¯ additive æ‰©å±•ï¼ˆå¤šé¢˜ç­”æ¡ˆ/æ³¨è§£æ— æŸæ‰¿è½½ï¼ŒCLI ä¾§
      // interaction-broker ä¼˜å…ˆæŒ‰ action ç²¾ç¡®æ˜ å°„ï¼Œç¼ºçœå›žè½ optionId/freeText å…¼å®¹è·¯å¾„ï¼‰ã€‚
      const ack = await options.zcodeAgentService.sendConversationCommandV4({
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        envelope: createHostCommandEnvelope({
          type: "resolveInteraction",
          payload: {
            interactionId: params.requestId,
            answer: {
              action: params.action,
              ...(params.content ? { content: params.content } : {}),
            },
          },
          sessionId: params.taskId,
        }),
      });
      assertV4CommandAckOk("resolveInteraction", ack, `elicitation ${params.requestId}`);
      if (params.clientMode === "web-remote-replayable") {
        // è¯­ä¹‰ä¿çœŸï¼ˆåŽŸ agentService.respondUserInput çš„ web-remote-replayable åˆ†æ”¯ï¼‰ï¼š
        // æ‰‹æœºè¿œæŽ§åº”ç­”åŽï¼Œæ¡Œé¢/å…¶å®ƒ observer éœ€è¦æ˜¾å¼å“åº”äº‹ä»¶æ¸…ç†åŒä¸€ requestId çš„å¼¹çª—ï¼›
        // v4 å‘½ä»¤è·¯å¾„ä¸å†ç»è¿‡æ—§ respondUserInputï¼Œè¿™é‡Œç”± adapter æœ¬åœ°è¡¥æŠ•åŒä¸€äº‹ä»¶ã€‚
        emitTaskEvent(
          target,
          userInputResponseToElicitationStreamEvent(params.taskId, params.requestId, {
            action: params.action,
            content: params.content,
          }),
        );
      }
      return true;
    },

    async closeTask(params): Promise<void> {
      // æ­¤å…¼å®¹å…¥å£ä»é€šè¿‡ closeSession å…³é—­ä¼šè¯ï¼›å°šæ— åªå…³é—­ runtimeã€ä¿ç•™ä¼šè¯çš„ç‹¬ç«‹æ“ä½œã€‚
      const target = getTaskTarget(params.taskId);
      await options.zcodeAgentService.closeSession({
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        sessionId: params.taskId,
      });
      setOverlay(target, { deleted: true });
      await updateIndexedTaskState(target, { deleted: true });
      clearLiveToolProjection(target);
      clearStreamingToolInputCache(target);
      // åˆ é™¤çš„åˆ—è¡¨å†…å®¹æ”¶æ•›ç”± sessions-index session.removed é©±åŠ¨ï¼›æ­¤å¤„å¹¿æ’­æ²¿ç”¨æ—§è¯­ä¹‰å…œåº•ã€‚
      emitWorkspaceTaskListChanged(target, undefined, "task_meta_changed");
    },

    async resumeTask(params): Promise<ZCodeTaskMeta> {
      // v4 ä¾§ resume å·²èµ° subscribe å†·æ¢å¤é’©å­
      // ï¼ˆCLI cold-resumeï¼‰ï¼Œä½† replayable resumeTask è¿˜æ‰¿æ‹… model/thoughtLevel å›žå¡«ä¸Ž
      // snapshotâ†’task index æ­£æ–‡ç´¢å¼•å›žæºï¼Œæ—§ resumeSession op ä¿ç•™åˆ° v4 ç”Ÿå‘½å‘¨æœŸæ”¶å£ã€‚
      const explicitModel = params.model?.trim();
      const explicitThoughtLevel = params.thoughtLevel?.trim();
      const indexHints =
        explicitModel && explicitThoughtLevel
          ? {}
          : await resolveTaskIndexResumeHints(params, "resume_task");
      const model = explicitModel || indexHints.model;
      const thoughtLevel = explicitThoughtLevel || indexHints.thoughtLevel;
      const snapshot = await resumeTaskSnapshot({
        taskId: params.taskId,
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        model,
        thoughtLevel,
        mcpServers: params.mcpServers,
      });
      emitWorkspaceConfig(params, snapshot.settings);
      const snapshotMeta = await syncTaskIndexSnapshot(snapshot);
      const meta =
        params.automationId || params.offPeakTaskId
          ? await syncTaskIndexMeta({
              ...snapshotMeta,
              ...(params.automationId ? { cronAutomationId: params.automationId } : {}),
              // ç»­è·‘æ—¶è¡¥å†™é—²æ—¶å½’å±žæ ‡è®°ã€‚
              ...(params.offPeakTaskId ? { offPeakTaskId: params.offPeakTaskId } : {}),
            })
          : snapshotMeta;
      notifySyncerSession({
        taskId: meta.taskId,
        workspacePath: meta.workspacePath,
        workspaceIdentity: meta.workspaceIdentity,
      });
      return meta;
    },

    async listTasks(params): Promise<ZCodeTaskMeta[]> {
      const tasks = await taskIndexRepo.listTaskMetas({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        provider: GLM_PROVIDER,
        pinned: false,
        archived: false,
      });
      return tasks.map(rememberIndexedTaskMeta);
    },

    async listPinnedTaskIds(): Promise<string[]> {
      const tasks = await taskIndexRepo.listTaskMetas({
        provider: GLM_PROVIDER,
        pinned: true,
        archived: false,
      });
      return tasks.map((task) => task.taskId);
    },

    async listPinnedTasks(params): Promise<ZCodeTaskMeta[]> {
      const tasks = await taskIndexRepo.listTaskMetas({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        provider: GLM_PROVIDER,
        pinned: true,
        archived: false,
      });
      return tasks.map(rememberIndexedTaskMeta);
    },

    async listDeletedTaskIds(params): Promise<string[]> {
      return taskIndexRepo.listDeletedTaskIds({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        provider: GLM_PROVIDER,
      });
    },

    // listTaskList çš„æ¶ˆè´¹é¢æ˜¯å…¨æ–‡æœç´¢ï¼ˆsearchable_text/snippetsï¼‰ä¸Ž
    // remoteTimelineTaskStore è¡¥å……é“¾è·¯ï¼›ä¾§æ  5 è§†å›¾ + remote shard çš„æ— æœç´¢è¡Œé›†åˆ
    // èµ°ä¸Šæ–¹ä¸‰ä¸ªåˆ†åŒºè¯»å–ã€‚workspace è¡Œåœ¨å®¢æˆ·ç«¯ç”¨å„ endpoint çš„ task è¡Œ + session detail æž„å»ºã€‚
    async listTaskList(params: ZCodeTaskListQuery): Promise<ZCodeTaskListResult> {
      const result = await taskIndexRepo.queryTaskList({
        ...params,
        provider: GLM_PROVIDER,
      });
      return {
        ...result,
        items: result.items.map(rememberIndexedTaskMeta),
      };
    },

    async createTaskGroup(params) {
      const group = await taskIndexRepo.createTaskGroup(params);
      return group;
    },

    async renameTaskGroup(params) {
      const group = await taskIndexRepo.renameTaskGroup(params);
      for (const scope of params.workspaceScopes ?? []) {
        // grouped ç»“æž„å˜æ›´æ— å•ä»»åŠ¡ metaï¼Œæ²¿ç”¨ task_meta_changed é©±åŠ¨ grouped è§†å›¾é‡æ‹‰ã€‚
        emitWorkspaceTaskListChanged(scope, undefined, "task_meta_changed");
      }
      return group;
    },

    async updateTaskGroupColor(params) {
      const group = await taskIndexRepo.updateTaskGroupColor(params);
      for (const scope of params.workspaceScopes ?? []) {
        emitWorkspaceTaskListChanged(scope, undefined, "task_meta_changed");
      }
      return group;
    },

    async deleteTaskGroup(params) {
      await taskIndexRepo.deleteTaskGroup(params);
      for (const scope of params.workspaceScopes ?? []) {
        emitWorkspaceTaskListChanged(scope, undefined, "task_meta_changed");
      }
    },

    // grouped è§†å›¾ä»»åŠ¡å†…å®¹ç”± sessions-index æä¾›ï¼›provider è¿‡æ»¤ä¸Ž meta ç¿»è¯‘
    // éšå®¢æˆ·ç«¯ task è¡Œ join å®Œæˆï¼Œæ­¤å¤„ä»…ä¿ç•™ç»“æž„è¯»å–ã€‚

    async listGroupedTaskViewStructure(params) {
      // grouped åŽŸå§‹ç»“æž„ï¼ˆä¸ join tasks è¡¨ï¼‰ï¼›ä»»åŠ¡å†…å®¹ç”± task-index/session åœ¨ renderer ä¾§ joinã€‚
      // å†·å¯åŠ¨ sidebar å¿…é¡»çœ‹åˆ°æ‰€æœ‰ directoryï¼Œå› æ­¤æ”¯æŒ includeAllWorkspacesï¼Œä¸ä¾èµ–å·²æ‰“å¼€çš„ tabs.
      if (!params.includeAllWorkspaces) {
        await runWorkspaceTaskAutoArchive(params.workspaceScopes);
      }
      const result = await taskIndexRepo.queryGroupedTaskViewStructure(params);
      if (params.includeAllWorkspaces) {
        // Global sidebar must receive task rows from the same global query boundary; cold start cannot depend on a workspace-scoped renderer lookup.
        const taskList = await taskIndexRepo.queryTaskList({
          kind: "active",
          workspaceScopes: params.workspaceScopes,
          includeAllWorkspaces: true,
          sortBy: "updated",
          limit: undefined,
          provider: GLM_PROVIDER,
        });
        return { ...result, tasks: taskList.items };
      }
      return result;
    },

    async applyGroupedTaskViewOrder(params) {
      const result = await taskIndexRepo.applyGroupedTaskViewOrder({
        ...params,
        // grouped ä¿å­˜æŽ’åºåŽçš„å›žåŒ…ä¹Ÿå¿…é¡»ç»§æ‰¿åˆ—è¡¨æŸ¥è¯¢çš„ glm provider è¾¹ç•Œï¼Œ
        // å¦åˆ™åŽ†å²å¤–éƒ¨ provider çš„ task ä¼šé€šè¿‡æœªè¿‡æ»¤çš„äºŒæ¬¡æŸ¥è¯¢çŸ­æš‚å›žåˆ° UIã€‚
        provider: GLM_PROVIDER,
      });
      for (const scope of params.workspaceScopes) {
        emitWorkspaceTaskListChanged(scope, undefined, "task_meta_changed");
      }
      return {
        nodes: result.nodes.map((node) =>
          node.type === "task"
            ? { ...node, task: rememberIndexedTaskMeta(node.task) }
            : {
                ...node,
                tasks: node.tasks.map(rememberIndexedTaskMeta),
              },
        ),
      };
    },

    async listArchivedTasks(params): Promise<ZCodeTaskMeta[]> {
      const tasks = await taskIndexRepo.listTaskMetas({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        provider: GLM_PROVIDER,
        archived: true,
      });
      return tasks.map(rememberIndexedTaskMeta);
    },

    async archiveStaleTasks(params): Promise<ZCodeTaskMeta[]> {
      // stale archive API å’Œè®¾ç½®é¡µè‡ªåŠ¨å½’æ¡£ä¿æŒä¸€è‡´ï¼Œæ¸…ç†å…¨éƒ¨åŽ†å² providerã€‚
      const archivedTasks = await taskIndexRepo.archiveStaleTasks({
        ...params,
      });
      for (const task of archivedTasks) {
        setOverlay(task, { archived: true });
        rememberIndexedTaskMeta(task);
        // åŒ runWorkspaceTaskAutoArchiveï¼šæ²¿ç”¨ task_meta_changed èµ° membership é‡æ‹‰æ”¶æ•›ã€‚
        emitWorkspaceTaskListChanged(task, task, "task_meta_changed");
      }
      return archivedTasks;
    },

    async archiveWorkspaceTasks(params): Promise<ZCodeTaskMeta[]> {
      const tasks = await taskIndexRepo.listTaskMetas({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        provider: GLM_PROVIDER,
        archived: false,
      });
      for (const task of tasks) {
        setOverlay(task, { archived: true });
        await taskIndexRepo.updateTaskState({
          workspacePath: task.workspacePath,
          workspaceIdentity: task.workspaceIdentity,
          taskId: task.taskId,
          patch: { archived: true },
        });
      }
      // æ‰¹é‡å½’æ¡£æ— é€ä»»åŠ¡ metaï¼Œæ²¿ç”¨ task_meta_changed èµ° membership é‡æ‹‰æ”¶æ•›ã€‚
      emitWorkspaceTaskListChanged(params, undefined, "task_meta_changed");
      return taskIndexRepo.listTaskMetas({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        provider: GLM_PROVIDER,
        archived: true,
      });
    },

    async getTaskSnapshot(params): Promise<ZCodeTaskSnapshot | null> {
      const startedAt = Date.now();
      const resumeStartedAt = Date.now();
      const explicitModel = params.model?.trim();
      const explicitThoughtLevel = params.thoughtLevel?.trim();
      const shouldBackfillTaskIndexResumeHints =
        params.clientMode === "web-remote-replayable" &&
        params.resumeModelPolicy !== "ui-resolved-only" &&
        (!explicitModel || !explicitThoughtLevel);
      const indexHints = shouldBackfillTaskIndexResumeHints
        ? await resolveTaskIndexResumeHints(params, "replayable_snapshot")
        : {};
      const model = explicitModel || indexHints.model;
      const thoughtLevel = explicitThoughtLevel || indexHints.thoughtLevel;
      const snapshot = await resumeTaskSnapshot({
        taskId: params.taskId,
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        // æ‰‹æœº replayable é¦–å± snapshot ä¼šå…ˆäºŽåŽç»­ resumeTask è¯»å–ã€‚
        // è¿™é‡Œå¿…é¡»æŠŠ task meta è§£æžå‡ºçš„åŽ†å²æ¨¡åž‹å’Œ thoughtLevel ä¼ è¿› session/resumeï¼Œ
        // é¿å…å†·æ¢å¤ç”¨ workspace/draft é»˜è®¤é…ç½®æ±¡æŸ“ context window ä¸Žæ€è€ƒå¼ºåº¦ã€‚
        model,
        thoughtLevel,
      });
      const resumeDurationMs = Date.now() - resumeStartedAt;
      const projectionStartedAt = Date.now();
      const zcodeSnapshot = limitTaskSnapshotMessages(
        snapshotToZCode(snapshot, {
          includeEmptyPendingElicitations: params.clientMode === "web-remote-replayable",
        }),
        params.messageLimit,
      );
      const projectionDurationMs = Date.now() - projectionStartedAt;
      // session owner çš„å¿«ç…§åˆ·æ–°ç´¢å¼•æŠ•å½±ï¼›syncTaskMeta ç»§ç»­ä¿ç•™ç”¨æˆ·æ‰‹åŠ¨æ ‡é¢˜ã€‚
      const indexStartedAt = Date.now();
      const indexedMeta = await syncTaskIndexMeta(zcodeSnapshot.meta);
      const indexDurationMs = Date.now() - indexStartedAt;
      logger.info(undefined, "[zcode-task-service] åŽ†å²å¿«ç…§è¯»å–å®Œæˆ", {
        clientMode: params.clientMode ?? "unknown",
        durationMs: Date.now() - startedAt,
        indexDurationMs,
        messageLimit: params.messageLimit ?? null,
        projectionDurationMs,
        resumeDurationMs,
        snapshotKind: "session",
        stats: getTaskSnapshotMessageDiagnostics(zcodeSnapshot),
        taskId: params.taskId,
        workspaceIdentity: params.workspaceIdentity ?? null,
        workspacePath: params.workspacePath,
      });
      return { ...zcodeSnapshot, meta: indexedMeta };
    },

    async getTaskSnapshotWithEtag(params) {
      const startedAt = Date.now();
      const snapshot = await service.getTaskSnapshot(params);
      if (!snapshot) {
        logger.info(undefined, "[zcode-task-service] åŽ†å²å¿«ç…§ ETag è¯»å–ä¸ºç©º", {
          clientMode: params.clientMode ?? "unknown",
          durationMs: Date.now() - startedAt,
          messageLimit: params.messageLimit ?? null,
          taskId: params.taskId,
          workspaceIdentity: params.workspaceIdentity ?? null,
          workspacePath: params.workspacePath,
        });
        return { snapshot: null };
      }
      const etagStartedAt = Date.now();
      const etag = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
      const etagDurationMs = Date.now() - etagStartedAt;
      if (params.ifNoneMatch && params.ifNoneMatch === etag) {
        logger.info(undefined, "[zcode-task-service] åŽ†å²å¿«ç…§ ETag å‘½ä¸­ç¼“å­˜", {
          clientMode: params.clientMode ?? "unknown",
          durationMs: Date.now() - startedAt,
          etagDurationMs,
          messageLimit: params.messageLimit ?? null,
          stats: getTaskSnapshotMessageDiagnostics(snapshot),
          taskId: params.taskId,
          workspaceIdentity: params.workspaceIdentity ?? null,
          workspacePath: params.workspacePath,
        });
        return { snapshot: null, etag, notModified: true };
      }
      logger.info(undefined, "[zcode-task-service] åŽ†å²å¿«ç…§ ETag ç”Ÿæˆå®Œæˆ", {
        clientMode: params.clientMode ?? "unknown",
        durationMs: Date.now() - startedAt,
        etagDurationMs,
        messageLimit: params.messageLimit ?? null,
        stats: getTaskSnapshotMessageDiagnostics(snapshot),
        taskId: params.taskId,
        workspaceIdentity: params.workspaceIdentity ?? null,
        workspacePath: params.workspacePath,
      });
      return { snapshot, etag };
    },

    async getTaskSnapshotBody(): Promise<ZCodeTaskSnapshotBody | null> {
      return null;
    },

    async getTaskSnapshotRef(): Promise<ZCodeTaskSnapshotRefContent | null> {
      return null;
    },

    async getTaskSnapshotToolCallsSlice(): Promise<ZCodeTaskSnapshotToolCallsSlice | null> {
      return null;
    },

    async getTaskMeta(params): Promise<ZCodeTaskMeta | null> {
      const meta = await taskIndexRepo.getTaskMeta(params);
      return meta ? rememberIndexedTaskMeta(meta) : null;
    },

    async getTaskConfigOptions(params): Promise<ZCodeConfigOption[]> {
      const snapshot = await resumeSnapshot(getTaskTarget(params.taskId));
      return settingsToConfigOptions(snapshot.settings);
    },

    async getTaskModelSelection(params): Promise<ModelSelection | null> {
      const target = getTaskTarget(params.taskId);
      const snapshot = await options.zcodeAgentService.readSession({
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        sessionId: params.taskId,
      });
      return snapshot.settings.model.current ?? null;
    },

    async setAssistantMessageFeedback(params): Promise<ZCodeSessionFile> {
      const snapshot = await service.getTaskSnapshot(params);
      if (!snapshot) {
        unsupported("setAssistantMessageFeedback");
      }
      const assistantMessages = snapshot.messages.filter((message) => message.role === "assistant");
      const targetMessage = assistantMessages[params.turnIndex];
      if (targetMessage) {
        targetMessage.feedback = params.feedback as ZCodeAssistantMessageFeedback | undefined;
      }
      return snapshot;
    },

    async scanImportableClaudeSessions(params: {
      workspacePath?: string;
      workspaceIdentity?: string;
      modifiedSince?: number;
      limit?: number;
    }): Promise<ZCodeImportableSessionCandidate[]> {
      // legacy ACP ä¸‹çº¿åŽ scanImportableClaudeSessions è¢«ç•™æˆç©ºæ¡©ï¼Œè¿ç§»å‘å¯¼æ‰«ä¸åˆ° ~/.claude/projectsã€‚
      // workspaceIdentity ä»…å½±å“å¯¼å…¥è½ç›˜ç›®å½•ï¼Œæ‰«æä»æŒ‰ jsonl å†… cwd ä¸Žå¯é€‰ workspacePath è¿‡æ»¤ã€‚
      void params.workspaceIdentity;
      return claudeNativeSessionImportRepo.scanImportableSessions({
        workspacePath: params.workspacePath,
        modifiedSince: params.modifiedSince,
        limit: params.limit,
      });
    },

    async importClaudeSessions(params: {
      workspacePath?: string;
      workspaceIdentity?: string;
      sessionIds: string[];
    }): Promise<ZCodeImportSessionsResult> {
      return importClaudeNativeSessions({
        taskIndexRepo,
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        sessionIds: params.sessionIds,
        createImportedSession: async (source) => {
          const targetWorkspaceIdentity = params.workspacePath
            ? params.workspaceIdentity
            : undefined;
          const snapshot = await options.zcodeAgentService.createSession({
            workspacePath: source.workspacePath,
            workspaceIdentity: targetWorkspaceIdentity,
            sessionId: buildImportedClaudeTaskId(source.workspacePath, source.sessionId),
            sessionTraceId: createSessionTraceId(),
            persistence: "immediate",
            importedHistory: {
              source: "claudeCode",
              title: source.title,
              createdAt: source.createdAt,
              updatedAt: source.updatedAt,
              messages: source.messages.map((message) => ({
                role: message.role,
                content: message.content,
                timestamp: message.timestamp,
              })),
            },
          });
          const meta = await syncTaskIndexSnapshot(snapshot);
          // å¯¼å…¥åŽçš„ä»»åŠ¡å¿…é¡»æ˜¯çœŸå®ž ZCode sessionï¼ŒsetModel/sendPrompt æ‰èƒ½ç»§ç»­å‘½ä¸­ runtimeã€‚
          // åŒæ—¶ä¿ç•™ migrationSourceï¼Œé¿å…ä»»åŠ¡åˆ—è¡¨æŠŠ Claude Code è¿ç§»åŽ†å²å½“æˆæœ¬åœ°æ–°ä¼šè¯ã€‚
          return syncTaskIndexMeta({ ...meta, migrationSource: "claudeCode" });
        },
        onTaskImported: (meta) => {
          rememberIndexedTaskMeta(meta);
          emitWorkspaceTaskListChanged(
            {
              workspacePath: meta.workspacePath,
              workspaceIdentity: meta.workspaceIdentity,
              taskId: meta.taskId,
            },
            meta,
            // å¯¼å…¥æ²¿ç”¨ task_meta_changed æ—§è¯­ä¹‰ã€‚
            "task_meta_changed",
          );
        },
      });
    },

    async setMode(params): Promise<void> {
      // session/setMode â†’ v4 switchCollaborationModeï¼ˆCASï¼Œrevision æ”¶æ•›è§
      // sendHostCasCommandV4ï¼‰ã€‚v4 handler ä¸å‘æ—§ state.updatedï¼Œè§‚å¯Ÿç«¯ä¸€è‡´æ€§ä¸Žæ¡Œé¢
      // v4 å·¥å…·æ¡åˆ‡æ¢åŒæ‰¹ï¼ˆè¯»è·¯å¾„ v4 store æ”¶å£ï¼‰ï¼›å‘èµ·ç«¯ç”±ä¸‹æ–¹ resumeSnapshot ä¿çœŸã€‚
      const target = getTaskTarget(params.taskId);
      await switchCollaborationModeViaProtocol(target, toZCodeMode(params.mode) ?? "build");
      const snapshot = await resumeSnapshot(target);
      await syncTaskIndexSnapshot(snapshot);
    },

    async setConfigOption(params): Promise<ZCodeConfigOption[]> {
      const target = getTaskTarget(params.taskId);
      if (params.configId === MODEL_CONFIG_ID) {
        return service.setModel({
          taskId: params.taskId,
          traceId: params.traceId,
          modelSelection: parseModelPickerValue(params.value),
        });
      }
      if (params.configId === THOUGHT_LEVEL_CONFIG_ID) {
        // session/setThoughtLevel â†’ v4 switchModelConfigï¼ˆv4 æ— ç‹¬ç«‹æ€è€ƒæ·±åº¦å‘½ä»¤ï¼Œ
        // thought å­—æ®µæ‰¿è½½ï¼›provider/model å–å½“å‰ä¼šè¯é€‰åž‹ï¼Œä¸Žæ¡Œé¢ v4 å·¥å…·æ¡åŒä¸€å‘½ä»¤é¢ï¼‰ã€‚
        // åŒ provider åŒ model ç›´åˆ‡ï¼Œä¸æ¶‰åŠ runtimeModelï¼ˆprovider å‡­æ®ï¼‰è§£æžâ€”â€”è¿™æ­£æ˜¯
        // setModel å°šä¸èƒ½è¿ç§»çš„åŽŸå› ï¼ˆè§ä¸‹æ–¹ setModel æ ‡æ³¨ï¼‰ã€‚
        const current = await options.zcodeAgentService.readSession({
          workspacePath: target.workspacePath,
          workspaceIdentity: target.workspaceIdentity,
          sessionId: params.taskId,
        });
        const model = current.settings.model.current;
        // æœªç»‘å®šä¼šè¯å¯ä»¥æŸ¥çœ‹ï¼Œä½†å•ç‹¬åˆ‡æ¡£ä½ä¸èƒ½çŒœæµ‹ Provider/Modelã€‚
        if (!model) throw new Error("è¯·å…ˆé€‰æ‹©æ¨¡åž‹ï¼Œå†è®¾ç½®æ€è€ƒæ¡£ä½");
        await sendConfigCasCommandV4(
          target,
          "switchModelConfig",
          {
            provider: model.providerId,
            model: model.modelId,
            thought: params.value,
          },
          `session=${params.taskId} thought=${params.value}`,
        );
      } else if (params.configId === MODE_CONFIG_ID) {
        await switchCollaborationModeViaProtocol(
          target,
          toZCodeMode(params.value as ZCodeTaskMode) ?? "build",
        );
      }
      const snapshot = await resumeSnapshot(target);
      await syncTaskIndexSnapshot(snapshot);
      return settingsToConfigOptions(snapshot.settings);
    },

    async setModel(params): Promise<ZCodeConfigOption[]> {
      // replayable facade ä»ä¾èµ– legacy op è¿”å›žçš„ Session
      // Snapshotï¼›æ¨¡åž‹æ‰§è¡Œäº‹å®žå·²ç»æ”¶æ•›åˆ°ç›®æ ‡ Worker Registryï¼ŒHost åªå‘é€ Selectionã€‚
      // è¿‡æ¸¡å½’å®¿ = task facade åŽŸç”Ÿæ¶ˆè´¹ V4 config æŠ•å½±ä¸Ž revisionã€‚
      const target = getTaskTarget(params.taskId);
      await options.zcodeAgentService.setModel({
        workspacePath: target.workspacePath,
        workspaceIdentity: target.workspaceIdentity,
        sessionId: params.taskId,
        // replayable/legacy facade çš„ modelId å¯èƒ½åªæ˜¯ UI è¿è¡Œæ€æ¨¡åž‹åï¼ˆå¦‚ gpt-5.5ï¼‰ã€‚
        // å¤šä¸ªè‡ªå®šä¹‰ provider åŒåæ—¶åªèƒ½ä¿¡ä»» UI ä¼ å…¥çš„ç»“æž„åŒ– ModelSelectionã€‚
        model: params.modelSelection,
      });
      const snapshot = await resumeSnapshot(target);
      await syncTaskIndexSnapshot(snapshot);
      return settingsToConfigOptions(snapshot.settings);
    },

    async setAutomationSessionConfig(params): Promise<ZCodeConfigOption[]> {
      const target = getTaskTarget(params.taskId);
      const model = params.modelSelection;
      const thoughtLevel = params.thoughtLevel?.trim() ?? "";
      // automation è¿‡åŽ»å…ˆèµ° legacy session/setModelï¼Œå†å‘ V4 Thinkã€‚è‹¥ç›®æ ‡æ¨¡åž‹
      // å·²å¸¦ç›¸åŒé»˜è®¤ Thinkï¼Œç¬¬äºŒæ­¥ä¼š noop ä¸”ä¸äº§ ModelSelectedï¼Œå¯¼è‡´ runtime å·²åˆ‡æ¢ä½†
      // conversation æŠ•å½±ä»æ˜¾ç¤ºæ—§æ¨¡åž‹ã€‚è¿™é‡Œç”¨ä¸€æ¡ V4 å‘½ä»¤åŽŸå­æ›´æ–° runtime ä¸ŽæŠ•å½±ã€‚
      await sendConfigCasCommandV4(
        target,
        "switchModelConfig",
        {
          provider: model.providerId,
          model: model.modelId,
          thought: thoughtLevel,
        },
        `automation session=${params.taskId} model=${model.providerId}/${model.modelId} thought=${thoughtLevel}`,
      );
      if (thoughtLevel) {
        // è·¨æ¨¡åž‹ switchModelConfig ä¼šå…ˆé‡‡ç”¨ç›®æ ‡æ¨¡åž‹é»˜è®¤ Thinkï¼Œé¿å…è¯¯ç”¨æºæ¨¡åž‹æ¡£ä½ã€‚
        // automation çš„ thought å·²ç”±åˆ›å»º/ç¼–è¾‘è¡¨å•æŒ‰ç›®æ ‡æ¨¡åž‹æ ¡éªŒï¼Œå¯åœ¨æ¨¡åž‹äº‹ä»¶è½åœ°åŽ
        // å†ä»¥åŒæ¨¡åž‹å‘½ä»¤æ˜¾å¼æ”¶æ•›ï¼›åŒé»˜è®¤å€¼æ—¶ noopï¼Œéžé»˜è®¤å€¼æ—¶å‘å¸ƒç¬¬äºŒä¸ª config deltaã€‚
        await sendConfigCasCommandV4(
          target,
          "switchModelConfig",
          {
            provider: model.providerId,
            model: model.modelId,
            thought: thoughtLevel,
          },
          `automation session=${params.taskId} thought=${thoughtLevel}`,
        );
      }
      if (params.mode?.trim()) {
        await switchCollaborationModeViaProtocol(target, toZCodeMode(params.mode) ?? "build");
      }
      const snapshot = await resumeSnapshot(target);
      await syncTaskIndexSnapshot(snapshot);
      return settingsToConfigOptions(snapshot.settings);
    },

    async getTaskNativeSessionLogFile() {
      const path = resolveZCodeAgentCurrentLogFilePath();
      // è¿”å›ž ZCode Agent çš„ç»“æž„åŒ–æ—¥å¿— JSONLï¼›æ—¥å¿—è¡Œä¸­çš„ sessionId ç”¨äºŽæŒ‰å½“å‰ä»»åŠ¡æŽ’æŸ¥ã€‚
      return { provider: GLM_PROVIDER, path, exists: existsSync(path) };
    },

    async getModelTrajectory(params) {
      // ZCode Agent æŠŠ taskId å½“ä½œ sessionId è½ç›˜ model-ioï¼ˆè§æœ¬æ–‡ä»¶å…¶å®ƒ sessionId: params.taskId ç”¨æ³•ï¼‰ï¼Œ
      // è¿™é‡ŒæŒ‰ sessionId è¿˜åŽŸè¯¥ task çš„æ¨¡åž‹è°ƒç”¨è½¨è¿¹ï¼Œä¾› UI ä¾§è¾¹æ å¯è§†åŒ–ã€‚
      const trajectory = await readModelTrajectory(params.taskId, params.limit);
      logger.info(
        `[ZCodeTaskService] getModelTrajectory taskId=${params.taskId} records=${trajectory.records.length} files=${trajectory.sourceFiles.length} truncated=${trajectory.truncated}`,
      );
      return trajectory;
    },

    async getTaskTokenUsage(params): Promise<ZCodeTaskTokenUsageResult> {
      // æ‘˜è¦é¢æ¿éœ€è¦å±•ç¤º task çš„ç´¯è®¡æ¨¡åž‹æ¶ˆè€—ï¼Œä¸èƒ½å¤ç”¨ usage_update çš„ context windowã€‚
      // è¿™é‡Œé€šè¿‡ ZCode Protocol è¯» agent SQLite çš„ model_usage èšåˆï¼Œä¿æŒæ¡Œé¢å’Œè¿œæŽ§åŒä¸€äº‹å®žæºã€‚
      return options.zcodeAgentService.getTaskTokenUsage({
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        sessionId: params.taskId,
      });
    },

    async getTaskSessionFilePath(params) {
      return {
        path: `${params.workspacePath}/${params.taskId}.zcode-session`,
        exists: false,
      };
    },

    async restartWorkspaceProcess(params): Promise<void> {
      await options.zcodeAgentService.disposeWorkspace(normalizeWorkspaceParams(params));
    },

    async deleteTask(params): Promise<void> {
      setOverlay(params, { deleted: true });
      const meta = await updateIndexedTaskState(params, { deleted: true });
      // task_meta_changed åªä¼šé‡æ‹‰æ™®é€š membershipï¼Œä¸èƒ½è¡¨è¾¾æŒä¹…åˆ é™¤è¯­ä¹‰ï¼›
      // sessions-index åŽç»­ä»ä¼šè¿”å›ž CLI ä¸­ä¿ç•™çš„ sessionï¼Œå¿…é¡»ç”¨ task_deleted è®© UI
      // ç«‹å³ç§»é™¤ç¼“å­˜å¹¶æ¢ä»£ deleted tombstone joinï¼Œé¿å…é‡å¯æˆ– live upsert åŽå¤æ´»ã€‚
      // åŒæ—¶æºå¸¦ metaï¼Œè®©æ¡Œé¢/è¿œæŽ§çš„é‡å¤è®¢é˜…èƒ½æŒ‰åŒä¸€äº‹ä»¶åŽ»é‡ membership bumpã€‚
      emitWorkspaceTaskListChanged(params, meta, "task_deleted");
    },

    async deleteArchivedTask(params): Promise<boolean> {
      const meta = await taskIndexRepo.deleteArchivedTask(params);
      if (!meta) return false;
      // å…ˆæŒä¹…åŒ–æˆåŠŸå†å†™ overlayï¼›å¦åˆ™å¤±è´¥é¡¹ä¼šè¢«å†…å­˜ deleted æ ‡è®°æå‰éšè—ã€‚
      setOverlay(params, { deleted: true });
      emitWorkspaceTaskListChanged(params, meta, "task_deleted");
      return true;
    },

    async deleteArchivedTasks(params): Promise<ZCodeArchivedTaskDeletionResult> {
      const result: ZCodeArchivedTaskDeletionResult = {
        deletedTaskIds: [],
        skippedTaskIds: [],
        failedTaskIds: [],
      };
      const taskIds = [...new Set(params.taskIds)];
      if (taskIds.length === 0) return result;
      const startedAt = Date.now();
      for (const taskId of taskIds) {
        const target = {
          workspacePath: params.workspacePath,
          workspaceIdentity: params.workspaceIdentity,
          taskId,
        };
        try {
          // ä¿ç•™é€é¡¹äº‹åŠ¡ä¸Žå½’æ¡£ guardï¼šä¸€é¡¹å¤±è´¥ä¸èƒ½å›žæ»šå…¶å®ƒæˆåŠŸé¡¹ï¼Œä¹Ÿä¸èƒ½æå‰éšè—å¤±è´¥é¡¹ã€‚
          const meta = await taskIndexRepo.deleteArchivedTask(target);
          if (!meta) {
            result.skippedTaskIds.push(taskId);
            continue;
          }
          setOverlay(target, { deleted: true });
          result.deletedTaskIds.push(taskId);
        } catch (error) {
          result.failedTaskIds.push(taskId);
          logger.warn(undefined, "[ArchivedTaskDeletion] æ‰¹æ¬¡ç›®æ ‡åˆ é™¤å¤±è´¥", {
            ...target,
            error,
          });
        }
      }
      if (result.deletedTaskIds.length > 0) {
        // æ ¹å› ï¼šå¾ªçŽ¯è°ƒç”¨å•æ¡æŽ¥å£ä¼šé€é¡¹å¹¿æ’­ï¼Œé©±åŠ¨ Host ä¸Ž UI å„è‡ªå…¨é‡é‡è¯»ã€‚
        // æ‰¹æ¬¡å®Œæˆåªå‘ä¸€æ¬¡ workspace äº‹ä»¶ï¼Œä»ä½¿æ‰€æœ‰è§‚å¯Ÿç«¯æ¢ä»£ deleted membershipï¼Œé˜²æ­¢ä»»åŠ¡å¤æ´»ã€‚
        emitWorkspaceTaskListChanged(params, undefined, "task_deleted");
      }
      logger.info(undefined, "[ArchivedTaskDeletion] batch completed", {
        workspaceKey: resolveWorkspaceKey(params),
        requested: taskIds.length,
        deleted: result.deletedTaskIds.length,
        skipped: result.skippedTaskIds.length,
        failed: result.failedTaskIds.length,
        durationMs: Date.now() - startedAt,
      });
      return result;
    },

    async renameTask(params): Promise<ZCodeTaskMeta> {
      const renamedAt = Date.now();
      logger.info(undefined, "[ZCodeTaskService] renameTask start", {
        taskId: params.taskId,
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
        workspaceKey: resolveWorkspaceKey(params),
        titleLength: params.title.length,
      });
      try {
        setOverlay(params, { title: params.title });
        logger.info(undefined, "[ZCodeTaskService] renameTask overlay set", {
          taskId: params.taskId,
          workspaceKey: resolveWorkspaceKey(params),
        });
        const meta = await updateIndexedTaskState(params, {
          title: params.title,
          // æ‰‹åŠ¨é‡å‘½åæ˜¯ app ä¾§ task meta å˜æ›´ã€‚ä¹‹å‰åªå†™ title ä¸æ›´æ–°æ—¶é—´ï¼Œ
          // è¿è¡Œä¸­å‰ç«¯ optimistic merge ä¼šæŠŠåŒ updatedAt çš„æ—§é•¿æ ‡é¢˜å½“æˆæ›´å¼º metaï¼Œå¯¼è‡´æ ‡é¢˜è¦ç­‰ä»»åŠ¡å®Œæˆæ‰åˆ·æ–°ã€‚
          updatedAt: renamedAt,
          titleOverridden: true,
        });
        logger.info(undefined, "[ZCodeTaskService] renameTask index updated", {
          taskId: params.taskId,
          workspaceKey: resolveWorkspaceKey(params),
          updatedAt: meta.updatedAt,
          titleLength: meta.title.length,
        });
        try {
          const ack = await options.zcodeAgentService.sendConversationCommandV4({
            workspacePath: params.workspacePath,
            workspaceIdentity: params.workspaceIdentity,
            envelope: createHostCommandEnvelope({
              type: "renameSession",
              sessionId: params.taskId,
              payload: { title: params.title },
            }),
          });
          assertV4CommandAckOk("renameSession", ack, `session=${params.taskId}`);
        } catch (error) {
          // æ—§ä¾§è¾¹æ  rename è¿‡åŽ»åªå†™ tasks-indexï¼›v4 sessions-index è¯» CLI
          // session storeï¼Œå¯¼è‡´æ‰‹åŠ¨æ ‡é¢˜åœ¨æ–°ä¾§è¾¹æ ä¸¢å¤±ã€‚è¿™é‡Œå°½åŠ›åŒæ­¥ renameSessionï¼Œ
          // ä½†åŽ†å²/å¯¼å…¥ç±» task å¯èƒ½æ²¡æœ‰æ´»è·ƒ v4 sessionï¼Œä¸èƒ½å› æ­¤ç ´åæ—¢æœ‰é‡å‘½åã€‚
          logger.warn(
            undefined,
            "åŒæ­¥ task rename åˆ° v4 session store å¤±è´¥ï¼Œä¿ç•™ task-index æ ‡é¢˜",
            {
              taskId: params.taskId,
              workspacePath: params.workspacePath,
              workspaceIdentity: params.workspaceIdentity,
              message: error instanceof Error ? error.message : String(error),
            },
          );
        }
        // æ‰‹åŠ¨é‡å‘½ååŒæ ·æ˜¯æ ‡é¢˜å˜æ›´ï¼Œä¸Ž pin/archive/unread å½’å±žæ— å…³ï¼Œç”¨ä¸“å±ž reasonã€‚
        emitWorkspaceTaskListChanged(params, meta, "task_title_changed");
        logger.info(undefined, "[ZCodeTaskService] renameTask event emitted", {
          taskId: params.taskId,
          workspaceKey: resolveWorkspaceKey(params),
        });
        return meta;
      } catch (error) {
        logger.error(undefined, "[ZCodeTaskService] renameTask failed", {
          taskId: params.taskId,
          workspacePath: params.workspacePath,
          workspaceIdentity: params.workspaceIdentity,
          workspaceKey: resolveWorkspaceKey(params),
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },

    async setTaskPinned(params): Promise<ZCodeTaskMeta> {
      setOverlay(params, { pinned: params.pinned });
      const meta = await updateIndexedTaskState(params, {
        pinned: params.pinned,
      });
      emitWorkspaceTaskListChanged(params, meta, params.pinned ? "task_pinned" : "task_unpinned");
      return meta;
    },

    async setTaskUnread(params): Promise<ZCodeTaskMeta> {
      if (!params.unread && typeof params.expectedUnreadAt === "number") {
        const result = await taskIndexRepo.clearTaskUnreadIfMatches({
          taskId: params.taskId,
          workspacePath: params.workspacePath,
          workspaceIdentity: params.workspaceIdentity,
          expectedUnreadAt: params.expectedUnreadAt,
        });
        // æ—§æ‰‹æœºç‚¹å‡»å¯èƒ½æ™šäºŽæ–°çš„ç»ˆæ€æœªè¯»åˆ°è¾¾ã€‚CAS æœªå‘½ä¸­æ—¶å¿…é¡»æŠŠ
        // service overlay å¯¹è´¦åˆ°å½“å‰ metaï¼Œä¸èƒ½å…ˆä¹è§‚æ¸…é™¤åŽç•™ä¸‹ renderer-only å·²è¯»çŠ¶æ€ã€‚
        setOverlay(params, { unreadAt: result.meta.unreadAt });
        if (result.cleared) {
          emitWorkspaceTaskListChanged(params, result.meta, "task_meta_changed");
        }
        return result.meta;
      }

      const unreadAt = params.unread ? Date.now() : undefined;
      setOverlay(params, { unreadAt });
      const meta = await updateIndexedTaskState(params, { unreadAt });
      // repository å¯èƒ½ä¸ºé¿å…åŒæ¯«ç§’ CAS ç‰ˆæœ¬ç¢°æ’žè€ŒæŽ¨è¿› unreadAtï¼›
      // service overlay å¿…é¡»å¯¹è´¦æœ€ç»ˆæŒä¹…å€¼ï¼Œå¦åˆ™åŽç»­ snapshot ä¼šç»§ç»­æš´éœ²æ—§ markerã€‚
      setOverlay(params, { unreadAt: meta.unreadAt });
      // unread å½’å±žåœ¨ tasks-indexã€sessions-index ä¸æºå¸¦ï¼Œå¿…é¡»èµ° task_meta_changed è§¦å‘ membership é‡æ‹‰ã€‚
      emitWorkspaceTaskListChanged(params, meta, "task_meta_changed");
      return meta;
    },

    async archiveTask(params): Promise<ZCodeTaskMeta> {
      setOverlay(params, { archived: true });
      const meta = await updateIndexedTaskState(params, { archived: true });
      emitWorkspaceTaskListChanged(params, meta, "task_archived");
      return meta;
    },

    async unarchiveTask(params): Promise<ZCodeTaskMeta> {
      setOverlay(params, { archived: false });
      const meta = await updateIndexedTaskState(params, { archived: false });
      emitWorkspaceTaskListChanged(params, meta, "task_unarchived");
      return meta;
    },

    async branchTaskFromPrompt(): Promise<ZCodeTaskCreateResult> {
      unsupported("branchTaskFromPrompt");
    },

    onDynamicStreamEvent(taskId: string): Event<ZCodeStreamEvent> {
      return getGlobalTaskEmitter(taskId).event;
    },

    onDynamicTaskTerminalOutcome(taskId: string): Event<ZCodeTaskTerminalOutcome> {
      // åˆå¹¶è¿ç§»ï¼šV4 syncer åªæš´éœ²å½’ä¸€åŒ–åŽçš„ç»ˆæ€ kindï¼Œä¸å†æºå¸¦æ—§åè®® event payloadã€‚
      // automation åªéœ€è¦ç¨³å®šæ”¶å£è¿è¡Œç»“æžœï¼Œå› æ­¤ completed/failed åœ¨æ­¤æ˜ å°„ä¸ºå…¬å¼€ outcomeã€‚
      return (listener) =>
        taskIndexSyncer.onSessionTerminalEvent((terminal) => {
          if (terminal.target.sessionId !== taskId) {
            return;
          }
          const target = {
            taskId,
            workspacePath: terminal.target.workspacePath,
            workspaceIdentity: terminal.target.workspaceIdentity,
          };
          const inputId = activePromptInputIds.get(taskKey(target));
          listener({
            taskId,
            ...(inputId ? { inputId } : {}),
            outcome: terminal.kind === "turn.failed" ? "failed" : "succeeded",
          });
        });
    },

    onDynamicTaskReady(taskId: string): Event<ZCodeTaskReadyOutcome> {
      return (listener) =>
        taskIndexSyncer.onSessionReadyEvent((ready) => {
          if (ready.target.sessionId !== taskId) {
            return;
          }
          listener({ taskId, reason: ready.reason });
        });
    },

    onDynamicTaskEvent(params): Event<ZCodeStreamEvent> {
      const target = {
        taskId: params.taskId,
        workspacePath: params.workspacePath,
        workspaceIdentity: params.workspaceIdentity,
      };
      rememberTaskTarget(target);
      return (listener) => {
        const localDisposable = getTaskEmitter(target).event(listener);
        // è¿™é‡Œä»æ˜¯ services/ å†…æ—§ session/subscribe è¯è¡¨çš„
        // æœ€åŽæ¶ˆè´¹ç‚¹ï¼ˆreplayable çš„ stream æŠ•å½±æºï¼‰ã€‚å†™è·¯å¾„ï¼ˆsend/stop/äº¤äº’å›žæ‰§ï¼‰
        // å·²æ”¶æ•› v4 å‘½ä»¤ï¼›è¯»è·¯å¾„æ¶ˆè´¹æ–¹æ˜¯
        // host é•œåƒ taskRealtimePortï¼ˆè¯è¡¨åŒä¸º ZCodeStreamEventï¼‰ï¼Œé•œåƒæ¢ v4 å¸§ = relay
        // åè®®ä¸Žæ‰‹æœº store æ•´é“¾é‡åšã€‚
        // è¿‡æ¸¡å½’å®¿ = replayable è¯»è·¯å¾„ v4 storeï¼Œä¸Ž host/index.ts é•œåƒã€
        // mapStateUpdated/mapServiceEventã€agentService.onDynamicSessionEvent åŒæ‰¹æ‘˜é™¤ã€‚
        const upstreamDisposable = options.zcodeAgentService.onDynamicSessionEvent({
          workspacePath: params.workspacePath,
          workspaceIdentity: params.workspaceIdentity,
          sessionId: params.taskId,
          deliveryKind: toZCodeDeliveryKind(params.deliveryKind),
          includeSnapshot: params.deliveryKind === "replayable",
        })((event) => mapServiceEvent(target, event));
        return {
          dispose() {
            upstreamDisposable.dispose();
            localDisposable.dispose();
          },
        };
      };
    },

    onDynamicWorkspaceEvent(workspace): Event<ZCodeWorkspaceEvent> {
      return taskIndexSyncer.onDynamicWorkspaceEvent(workspace);
    },

    onError: errorEmitter.event,

    disposeAll(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      memoryDiagnostics.dispose();
      // syncer æŒæœ‰ agentService çš„ v4 å¸§è®¢é˜…ï¼ˆsessions-index/workspace-configï¼‰ï¼Œ
      // å¿…é¡»åœ¨ agentService.disposeAll å‰é‡Šæ”¾ï¼Œå¦åˆ™ emitter dispose æ—¶ä»ä¼šå›žè°ƒåˆ°å·²å¤±æ•ˆçš„ syncerã€‚
      // workspaceEmitters å·²ä¸‹æ²‰åˆ° syncerï¼Œç”± syncer.disposeAll ç»Ÿä¸€å›žæ”¶ã€‚
      taskIndexSyncer.disposeAll();
      options.zcodeAgentService.disposeAll();
      disposeLocalTaskState();
    },

    async disposeAllAndWait(): Promise<void> {
      if (disposed) {
        return;
      }
      disposed = true;
      // app é€€å‡ºå¿…é¡»å…ˆæ–­å¼€ task index syncer çš„è®¢é˜…ï¼Œå†ç­‰å¾… agent è¿›ç¨‹æ ‘å®Œæˆæ¸…ç†ï¼›
      // å¦åˆ™ host é€€å‡ºæ—¶ä¼šæŠŠ zcode-cli çš„ SIGKILL å…œåº• timer ä¸€èµ·å¸¦èµ°ã€‚
      taskIndexSyncer.disposeAll();
      await disposeZCodeAgentServiceAndWait();
      disposeLocalTaskState();
    },
  };

  return service;
}

function normalizeWorkspaceParams(params: {
  workspacePath: string;
  workspaceIdentity?: string;
}): ZCodeAgentWorkspaceTarget {
  return {
    workspacePath: params.workspacePath,
    workspaceIdentity: params.workspaceIdentity,
  };
}

function applyOverlayToMeta(meta: ZCodeTaskMeta, overlay: TaskOverlay): ZCodeTaskMeta {
  return {
    ...meta,
    title: overlay.title ?? meta.title,
    unreadAt: overlay.unreadAt,
  };
}

function deriveTitleFromSnapshot(snapshot: ZCodeSessionStateSnapshot): string {
  return resolveZCodeVisibleSessionTitle({
    title: snapshot.session.title,
    messages: snapshot.messages,
    target: snapshot.projection.target,
  });
}

function normalizeSnapshotMessageLimit(messageLimit: number | undefined): number | undefined {
  if (!messageLimit || !Number.isFinite(messageLimit) || messageLimit <= 0) {
    return undefined;
  }
  return Math.floor(messageLimit);
}

function buildSnapshotHistory(
  totalMessages: number,
  messageLimit: number,
): NonNullable<ZCodeTaskSnapshot["history"]> {
  return {
    truncatedBefore: totalMessages > messageLimit,
    totalMessages,
  };
}

function getTaskSnapshotMessageDiagnostics(snapshot: ZCodeTaskSnapshot) {
  let assistantMessages = 0;
  let userMessages = 0;
  let toolCalls = 0;
  let bodyRefs = 0;
  let toolSliceMessages = 0;
  let contentChars = 0;
  let thoughtChars = 0;

  for (const message of snapshot.messages) {
    if (message.role === "assistant") {
      assistantMessages += 1;
    } else {
      userMessages += 1;
    }
    toolCalls += message.tools?.length ?? 0;
    bodyRefs += message.bodyRefs?.length ?? 0;
    if (message.toolSlice) {
      toolSliceMessages += 1;
    }
    contentChars += message.content.length;
    thoughtChars += message.thought?.length ?? 0;
  }

  return {
    assistantMessages,
    bodyRefs,
    contentChars,
    fileChanges: snapshot.fileChanges?.length ?? 0,
    historyTotalMessages: snapshot.history?.totalMessages ?? snapshot.messages.length,
    messages: snapshot.messages.length,
    slashCommands: snapshot.slashCommands?.length ?? 0,
    thoughtChars,
    toolCalls,
    toolSliceMessages,
    truncatedBefore: snapshot.history?.truncatedBefore ?? false,
    userMessages,
  };
}

function limitTaskSnapshotMessages(
  snapshot: ZCodeTaskSnapshot,
  messageLimit: number | undefined,
): ZCodeTaskSnapshot {
  const limit = normalizeSnapshotMessageLimit(messageLimit);
  if (!limit) {
    return snapshot;
  }
  const history = buildSnapshotHistory(snapshot.messages.length, limit);
  return {
    ...snapshot,
    messages: history.truncatedBefore ? snapshot.messages.slice(-limit) : snapshot.messages,
    // æ‰‹æœº replayable é¦–å±ä¸ºäº†æ€§èƒ½åªæ‹¿å°¾éƒ¨çª—å£ã€‚
    // UI ä¸èƒ½å†ç”¨â€œè¿”å›žæ¡æ•°æ˜¯å¦ç­‰äºŽ limitâ€çŒœæµ‹æ˜¯å¦è¿˜æœ‰æ›´æ—©åŽ†å²ï¼Œå› ä¸ºçŸ­å°¾éƒ¨ç»ˆæ€å¿«ç…§ä¹Ÿå¯èƒ½æ˜¯è£å‰ªçª—å£ã€‚
    history,
  };
}

function parseModelPickerValue(value: string): ModelSelection {
  const customModel = decodeCustomModelValue(value);
  if (customModel?.providerId && customModel.modelName) {
    // UI ä¸‹æ‹‰çš„ custom:provider:model åªæ˜¯å±•ç¤ºæ€ï¼Œä¸èƒ½åŽŸæ ·ä¼ ç»™ zcode-cliã€‚
    // æ—§è§£æžä¼šå…ˆæŒ‰å†’å·æˆªæ–­æˆ customï¼Œæœ€ç»ˆä¸‹å‘ glm/customï¼Œè§¦å‘ Unsupported modelã€‚
    return {
      providerId: customModel.providerId,
      modelId: customModel.modelName,
    };
  }

  return parseSharedModelSelection(value);
}

function toZCodeMode(mode: ZCodeTaskMode | undefined): ZCodeSessionMode | undefined {
  switch (mode) {
    case "plan":
      return "plan";
    case "edit":
      // automation UI ä¿å­˜çš„â€œè‡ªåŠ¨ç¼–è¾‘â€ä½¿ç”¨ canonical editã€‚æ—§æ˜ å°„æ¼æŽ‰è¯¥å€¼ï¼Œ
      // è°ƒç”¨æ–¹çš„ ?? build ä¼šæŠŠæƒé™æ¨¡å¼é™é»˜é™çº§æˆâ€œå˜æ›´å‰ç¡®è®¤â€ã€‚
      return "edit";
    case "yolo":
      return "yolo";
    case "auto":
      return "auto";
    case "build":
    case "autoEdit":
      return "build";
    default:
      return undefined;
  }
}

function fromZCodeMode(mode: ZCodeSessionMode): ZCodeTaskMode {
  return mode === "build" ? "build" : mode;
}

function addSessionForkSnapshotFallback(
  messages: ZCodePersistedMessage[],
  snapshot: ZCodeSessionStateSnapshot,
): ZCodePersistedMessage[] {
  const parentSessionId = snapshot.session.parentSessionId;
  if (
    !parentSessionId ||
    messages.some((message) => message.syntheticTimeline?.type === "session_fork")
  ) {
    return messages;
  }

  return [
    ...messages,
    {
      id: `zcode-timeline-fork-${parentSessionId}-`,
      role: "user",
      content: "",
      timestamp: snapshot.session.createdAt,
      // æ—§çš„çº¯å¯¹è¯ fork æ²¡æœ‰è½åº“ synthetic noticeï¼Œåªèƒ½ä»Ž session.parentSessionId
      // æ¢å¤ä¸€ä¸ªä¸å¯è·³è½¬çš„åˆ†å‰²çº¿ï¼Œé¿å…åŽ†å² fork ä¼šè¯å®Œå…¨çœ‹ä¸åˆ°æ¥æºè¾¹ç•Œã€‚
      syntheticTimeline: {
        version: 1,
        kind: "synthetic",
        type: "session_fork",
        display: "separator",
        parentSessionId,
        targetMessageId: "",
      },
    },
  ];
}

function addGoalVerificationTimelineSnapshotFallback(
  messages: ZCodePersistedMessage[],
  snapshot: ZCodeSessionStateSnapshot,
): ZCodePersistedMessage[] {
  const timeline = snapshot.runtime.goalVerificationTimeline ?? [];
  if (timeline.length === 0) {
    return messages;
  }
  const existingIds = new Set(
    messages
      .map((message) =>
        message.syntheticTimeline?.type === "goal_verification"
          ? goalVerificationTimelineIdentityKey(message.syntheticTimeline)
          : null,
      )
      .filter((id): id is string => Boolean(id)),
  );
  const timelineMessages = timeline
    .filter((item) => !existingIds.has(goalVerificationTimelineIdentityKey(item)))
    .map<ZCodePersistedMessage>((item) => ({
      id: goalVerificationTimelineMessageId(item),
      role: "assistant",
      content: "",
      timestamp: item.startedAt ?? item.updatedAt,
      // goal verifier lifecycle æ˜¯ agent snapshot çš„æŒä¹…çŠ¶æ€ï¼Œä¸ä¸€å®šæœ‰
      // å¯¹åº” message historyï¼›task facade ä¹Ÿè¦æŒ‰ target+iteration å’Œ anchor è¡¥ dividerï¼Œé¿å…æ¢å¤åŽé‡å¤æˆ–é”™ä½ã€‚
      syntheticTimeline: item,
    }));
  if (timelineMessages.length === 0) {
    return messages;
  }
  return insertGoalVerificationTimelineMessages(messages, timelineMessages);
}

function goalVerificationTimelineIdentityKey(
  item: Extract<ZCodeGoalVerificationTimelineMeta, { type: "goal_verification" }>,
): string {
  if (typeof item.goalIteration === "number") {
    return `${item.targetId}:${item.goalIteration}`;
  }
  return `verification:${item.verificationId}`;
}

function goalVerificationTimelineMessageId(
  item: Extract<ZCodeGoalVerificationTimelineMeta, { type: "goal_verification" }>,
): string {
  if (typeof item.goalIteration === "number") {
    return `zcode-goal-verification-${item.targetId}-${item.goalIteration}`;
  }
  return `zcode-goal-verification-${item.verificationId}`;
}

function insertGoalVerificationTimelineMessages(
  messages: ZCodePersistedMessage[],
  timelineMessages: ZCodePersistedMessage[],
): ZCodePersistedMessage[] {
  const result = [...messages];
  for (const message of [...timelineMessages].sort(
    (left, right) => left.timestamp - right.timestamp,
  )) {
    const timeline = message.syntheticTimeline;
    const anchorIndex =
      timeline?.type === "goal_verification" && timeline.anchorAssistantMessageId
        ? findPersistedMessageIndexById(result, timeline.anchorAssistantMessageId)
        : -1;
    if (anchorIndex >= 0) {
      result.splice(goalVerificationAnchorInsertIndex(result, anchorIndex), 0, message);
      continue;
    }
    result.splice(timestampInsertIndex(result, message.timestamp), 0, message);
  }
  return result;
}

function normalizeGoalVerificationTimelineMessageOrder(
  messages: ZCodePersistedMessage[],
): ZCodePersistedMessage[] {
  const timelineMessages = messages.filter(
    (message) => message.syntheticTimeline?.type === "goal_verification",
  );
  if (timelineMessages.length === 0) {
    return messages;
  }
  // agent history å·²å­˜åœ¨çš„ verifier divider ä¹Ÿå¯èƒ½å› ä¸ºå¼‚æ­¥åˆ°è¾¾æŽ’åˆ°ä¸‹ä¸€æ¡ç”¨æˆ·è¾“å…¥åŽé¢ï¼›
  // task facade snapshot å¿…é¡»æŒ‰ anchor é‡æ–°æŠ•å½±ï¼Œè€Œä¸æ˜¯åªç»™ç¼ºå¤± divider åš fallbackã€‚
  return insertGoalVerificationTimelineMessages(
    messages.filter((message) => message.syntheticTimeline?.type !== "goal_verification"),
    timelineMessages,
  );
}

function goalVerificationAnchorInsertIndex(
  messages: readonly ZCodePersistedMessage[],
  anchorIndex: number,
): number {
  let index = anchorIndex + 1;
  while (
    index < messages.length &&
    messages[index]?.syntheticTimeline?.type === "goal_verification"
  ) {
    index += 1;
  }
  return index;
}

function timestampInsertIndex(
  messages: readonly ZCodePersistedMessage[],
  timestamp: number,
): number {
  const index = messages.findIndex((message) => message.timestamp > timestamp);
  return index >= 0 ? index : messages.length;
}

function findPersistedMessageIndexById(
  messages: readonly ZCodePersistedMessage[],
  messageId: string,
): number {
  return messages.findIndex(
    (message) => message.id === messageId || message.mergedMessageIds?.includes(messageId) === true,
  );
}

function getSnapshotGoalActiveIterationCount(snapshot: ZCodeSessionStateSnapshot): number {
  const targetId = snapshot.projection.target?.targetId;
  const timeline =
    snapshot.runtime.goalVerificationTimeline?.filter(
      (item) => !targetId || item.targetId === targetId,
    ) ?? [];
  return getZCodeGoalActiveIterationCount({
    targetStatus: snapshot.projection.target?.status ?? null,
    timeline,
  });
}

function toZCodeDeliveryKind(
  deliveryKind: "continuous" | "bot-channel-continuous" | "replayable" | "mixed" | undefined,
): ZCodeDeliveryKind {
  return deliveryKind === "replayable" ? "web-remote-replayable" : "desktop-continuous";
}

function backgroundTaskNotificationToolUpdateFromInput(params: {
  input: string | undefined;
  inputId: InputId | undefined;
  taskId: string;
  traceId: TraceId;
}): Extract<ZCodeStreamEvent, { type: "tool_call_update" }> | null {
  const parsed = parseZCodeBackgroundTaskNotificationText(params.input);
  if (!parsed) {
    return null;
  }
  const status = zcodeBackgroundTaskNotificationToolUpdateStatus(parsed.notification.status);
  return {
    type: "tool_call_update",
    taskId: params.taskId,
    traceId: params.traceId,
    ...(params.inputId ? { inputId: params.inputId } : {}),
    toolId: parsed.toolUseId,
    status,
    content: parsed.notification.result ?? parsed.notification.summary,
    // replayable åŠ¨æ€äº‹ä»¶ä¹Ÿå¿…é¡»æŠŠ notification error æ”¾åˆ°æ ‡å‡† tool errorï¼Œ
    // å¦åˆ™æ‰‹æœºè¿œæŽ§ä¸Žæ¡Œé¢ continuous çš„å¤±è´¥è¯¦æƒ…ä¼šäº§ç”Ÿåˆ†å‰ã€‚
    ...(status === "failed" && parsed.notification.error
      ? { error: parsed.notification.error }
      : {}),
    raw: attachZCodeBackgroundTaskNotificationToRaw(
      { toolCallId: parsed.toolUseId },
      parsed.notification,
    ),
  };
}

function mapMessage(
  message: ZCodeMessageWithParts,
  goalIteration?: number,
  backgroundTaskNotifications?: ReadonlyMap<string, ZCodeBackgroundTaskNotificationInfo>,
): ZCodePersistedMessage {
  const tools: ZCodePersistedToolCall[] = [];
  const parts: ZCodePersistedMessagePart[] = [];
  const attachments =
    message.info.role === "user" ? mapPromptAttachmentsFromParts(message.parts) : undefined;
  let syntheticTimeline: ZCodeTimelineMeta | undefined;
  for (const part of message.parts) {
    if (part.type === "text") {
      // fork notice ç­‰ç»“æž„åŒ– synthetic æ¶ˆæ¯æŠŠ timeline meta å†™åœ¨ part.metadata ä¸Šï¼›
      // æŒä¹…åŒ–å±‚ä¸å¸¦ metadata å­—æ®µï¼Œæ‰€ä»¥æå–ä¸€ä»½æŒ‚åˆ° message çº§åˆ«ä¾› UI æ¸²æŸ“åˆ†éš”æ¡ã€‚
      if (!syntheticTimeline) {
        const fromText = extractSyntheticTimelineFromTextPart(part);
        if (fromText) {
          syntheticTimeline = fromText;
        }
      }
    } else if (part.type === "compaction" && !syntheticTimeline) {
      // compact çš„æ¨¡åž‹ summary/timelineText å±žäºŽ agent å†…éƒ¨ä¸Šä¸‹æ–‡ï¼Œä¸èƒ½ä½œä¸ºæ­£æ–‡é€å‡ºã€‚
      // æŒä¹…åŒ–æ¢å¤åªä»Žç»“æž„åŒ–å­—æ®µåˆæˆæ¨ªçº¿ï¼Œå±•ç¤ºæ–‡æ¡ˆç”± UI/TUI æœ¬åœ° i18n å†³å®šã€‚
      syntheticTimeline = synthesizeCompactionTimeline(part);
    }
  }
  for (const part of message.parts) {
    if (part.type === "text") {
      parts.push({ type: "content", content: part.text });
    } else if (part.type === "reasoning") {
      parts.push({ type: "thought", content: part.text });
    } else if (part.type === "tool") {
      const toolIndex = tools.length;
      tools.push(mapToolPart(part, backgroundTaskNotifications));
      parts.push({ type: "tool-call", toolIndex });
    }
  }
  return {
    id: message.info.messageId,
    role: message.info.role,
    content: textFromParts(message.parts),
    timestamp: message.info.time.created,
    // æœªç»‘å®šæ¢å¤ä»éœ€å‘ˆçŽ°å®Œæ•´åŽ†å²ï¼Œä¸èƒ½ä¸ºç¼ºå¤±çš„æ¶ˆæ¯æ¥æºè¡¥é»˜è®¤æ¨¡åž‹ã€‚
    model: message.info.model ? formatModelPickerValue(message.info.model) : undefined,
    ...(syntheticTimeline ? { syntheticTimeline } : {}),
    ...(attachments ? { attachments } : {}),
    ...(message.info.role === "assistant"
      ? {
          ...(goalIteration ? { goalIteration } : {}),
          durationMs: message.info.time.completed
            ? message.info.time.completed - message.info.time.created
            : undefined,
          thought: reasoningFromParts(message.parts),
          tools: tools.length > 0 ? tools : undefined,
          parts: parts.length > 0 ? parts : undefined,
        }
      : {}),
  };
}

function mapPromptAttachmentsFromParts(
  parts: readonly ZCodeMessagePart[],
): ZCodePromptAttachment[] | undefined {
  const attachments = parts
    .filter((part): part is Extract<ZCodeMessagePart, { type: "file" }> => part.type === "file")
    .map(mapPromptAttachmentFromFilePart)
    .filter((attachment): attachment is ZCodePromptAttachment => attachment !== undefined);
  return attachments.length > 0 ? attachments : undefined;
}

function mapPromptAttachmentFromFilePart(
  part: Extract<ZCodeMessagePart, { type: "file" }>,
): ZCodePromptAttachment | undefined {
  const mimeType = part.mime || "application/octet-stream";
  const metadata = asRecord(part.metadata);
  const filename = part.filename?.trim() || filenameFromPathLike(part.url) || "attachment";
  const sizeBytes = numberValue(metadata.sizeBytes);
  const dataBase64 = dataBase64FromDataUrl(part.url);
  const localPath = localPathFromAttachmentPart(part.url, metadata);

  // åŽ†å²æ¢å¤é“¾è·¯ä¹‹å‰åªæŠŠ file part å½“ä½œæ¨¡åž‹ä¸Šä¸‹æ–‡ï¼Œä¸å›žå¡« UI çš„ attachments å­—æ®µã€‚
  // ç”¨æˆ·æ¶ˆæ¯æ¢å¤åŽé™„ä»¶ chip å› æ­¤æ¶ˆå¤±ï¼›è¿™é‡Œä»Ž agent æŒä¹…åŒ–çš„ file part åæŠ•å½±å›žå‘é€æ—¶çš„é™„ä»¶å½¢æ€ã€‚
  if (mimeType.startsWith("image/")) {
    return {
      kind: "image",
      filename,
      mimeType,
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      ...(dataBase64 ? { dataBase64 } : {}),
      ...(localPath ? { localPath } : {}),
    };
  }

  if (mimeType.startsWith("audio/")) {
    return {
      kind: "audio",
      filename,
      mimeType,
      ...(dataBase64 ? { dataBase64 } : {}),
      ...(localPath ? { localPath } : {}),
    };
  }

  if (mimeType.startsWith("video/")) {
    return {
      kind: "video",
      filename,
      mimeType,
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      ...(dataBase64 ? { dataBase64 } : {}),
      ...(localPath ? { localPath } : {}),
    };
  }

  const preview = asRecord(metadata.preview);
  const textContent = !localPath ? stringValue(preview.text) : undefined;
  return {
    kind: "file",
    filename,
    mimeType,
    sizeBytes: sizeBytes ?? 0,
    ...(dataBase64 ? { dataBase64 } : {}),
    ...(textContent !== undefined ? { textContent } : {}),
    ...(localPath ? { localPath } : {}),
  };
}

function dataBase64FromDataUrl(value: string): string | undefined {
  const match = /^data:[^;,]+;base64,(.*)$/i.exec(value);
  return match?.[1] || undefined;
}

function localPathFromAttachmentPart(
  url: string,
  metadata: Record<string, unknown>,
): string | undefined {
  const originalUrl = stringValue(metadata.originalUrl);
  if (originalUrl && isAbsolutePathLike(originalUrl)) {
    return originalUrl;
  }
  return isAbsolutePathLike(url) ? url : undefined;
}

function isAbsolutePathLike(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("\\\\");
}

function filenameFromPathLike(value: string): string | undefined {
  if (value.startsWith("data:")) {
    return undefined;
  }
  const pathPart = value.split(/[?#]/u)[0] ?? "";
  const segments = pathPart.split(/[\\/]/u).filter(Boolean);
  const filename = segments.at(-1)?.trim();
  return filename && !filename.includes("://") ? filename : undefined;
}

function extractSyntheticTimelineFromTextPart(
  part: Extract<ZCodeMessagePart, { type: "text" }>,
): ZCodeTimelineMeta | undefined {
  const metadata = part.metadata;
  if (!metadata || typeof metadata !== "object") return undefined;
  const forkContext = (metadata as Record<string, unknown>)["forkContext"];
  if (!forkContext || typeof forkContext !== "object") return undefined;
  const ctx = forkContext as Record<string, unknown>;
  if (ctx["kind"] !== "session_fork") return undefined;
  const parentSessionId = typeof ctx["parentSessionId"] === "string" ? ctx["parentSessionId"] : "";
  const targetMessageId = typeof ctx["targetMessageId"] === "string" ? ctx["targetMessageId"] : "";
  const targetCheckpointId =
    typeof ctx["targetCheckpointId"] === "string" ? ctx["targetCheckpointId"] : undefined;
  if (!parentSessionId || !targetMessageId) return undefined;
  return {
    version: 1,
    kind: "synthetic",
    type: "session_fork",
    display: "separator",
    parentSessionId,
    targetMessageId,
    ...(targetCheckpointId ? { targetCheckpointId } : {}),
    ...(typeof ctx["restoredFileCount"] === "number"
      ? { restoredFileCount: ctx["restoredFileCount"] }
      : {}),
  };
}

function synthesizeCompactionTimeline(
  part: Extract<ZCodeMessagePart, { type: "compaction" }>,
): ZCodeTimelineMeta | undefined {
  const metadata = asRecord(part.metadata);
  const operationId = stringValue(metadata.operationId) ?? part.partId;
  const status = timelineStatusValue(metadata.timelineStatus);
  if (!status && !part.summaryMessageId) {
    // compact summary user message ä¹Ÿå¸¦ compaction metadataï¼Œ
    // ä½†å®ƒæ˜¯æ¨¡åž‹ä¸Šä¸‹æ–‡ï¼Œä¸æ˜¯ UI timelineï¼›å¦åˆ™ snapshot æ¢å¤ä¼šå¤šæ¸²æŸ“ä¸€æ¡æ¨ªçº¿ã€‚
    return undefined;
  }
  const trigger = timelineTriggerValue(metadata.trigger) ?? (part.auto ? "auto" : "manual");
  const replace = booleanValue(metadata.replace);
  const reason = part.reason ?? stringValue(metadata.reason);
  const boundaryId = stringValue(metadata.boundaryId) ?? part.summaryMessageId;
  const summaryMessageId = part.summaryMessageId ?? stringValue(metadata.summaryMessageId);
  const preCompactTokenCount = numberValue(metadata.preCompactTokenCount);
  const postCompactTokenCount = numberValue(metadata.postCompactTokenCount);
  const truePostCompactTokenCount = numberValue(metadata.truePostCompactTokenCount);
  const attempt = numberValue(metadata.attempt);
  const maxAttempts = numberValue(metadata.maxAttempts);
  const startedAt = numberValue(metadata.startedAt);
  const endedAt = numberValue(metadata.endedAt);
  return {
    version: 1,
    kind: "synthetic",
    type: "context_compaction",
    operationId,
    status: status ?? "completed",
    trigger,
    display: "separator",
    ...(replace !== undefined ? { replace } : {}),
    ...(reason ? { reason } : {}),
    ...(boundaryId ? { boundaryId } : {}),
    ...(summaryMessageId ? { summaryMessageId } : {}),
    ...(preCompactTokenCount !== undefined ? { preCompactTokenCount } : {}),
    ...(postCompactTokenCount !== undefined ? { postCompactTokenCount } : {}),
    ...(truePostCompactTokenCount !== undefined ? { truePostCompactTokenCount } : {}),
    ...(attempt !== undefined ? { attempt } : {}),
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(endedAt !== undefined ? { endedAt } : {}),
  };
}

function mapToolPart(
  part: Extract<ZCodeMessagePart, { type: "tool" }>,
  backgroundTaskNotifications?: ReadonlyMap<string, ZCodeBackgroundTaskNotificationInfo>,
): ZCodePersistedToolCall {
  const state = part.state;
  const taskNotification = backgroundTaskNotifications?.get(part.callId);
  // ZCode Protocol çš„ part.callId æ˜¯å®žæ—¶æµå’Œç»ˆæ€ snapshot å…±åŒçš„å·¥å…·èº«ä»½ã€‚
  // ä»¥å‰åªä¿å­˜ metadata ä¼šä¸¢æŽ‰ toolCallIdï¼Œæ‰‹æœº replayable é‡Œ result-only ä¸´æ—¶å·¥å…·å°±æ— æ³•è¢«ç»ˆæ€å¿«ç…§è¦†ç›–ã€‚
  const raw = attachZCodeBackgroundTaskNotificationToRaw(
    attachToolCallIdToRaw("metadata" in state ? (state.metadata ?? state) : state, part.callId),
    taskNotification,
  );
  if (state.status === "completed") {
    // snapshot é‡Œçš„ completed æ˜¯ background Agent launch ACKï¼›failed
    // notification å¿…é¡»åœ¨ replayable restore ä¸­è¦†ç›–å®ƒï¼Œä½†ä¸èƒ½é¡ºå¸¦æ”¹å˜ stopped ç­‰æ—¢æœ‰è¯­ä¹‰ã€‚
    const notificationStatus = taskNotification?.status
      ? zcodeBackgroundTaskNotificationToolUpdateStatus(taskNotification.status)
      : undefined;
    const notificationFailed = notificationStatus === "failed";
    return {
      toolName: part.tool,
      title: state.title || part.tool,
      kind: part.tool,
      status: notificationFailed ? "failed" : "completed",
      input: state.input,
      output: state.output,
      ...(notificationFailed && taskNotification?.error ? { error: taskNotification.error } : {}),
      raw,
    };
  }
  if (state.status === "error") {
    return {
      toolName: part.tool,
      title: part.tool,
      kind: part.tool,
      status: "failed",
      input: state.input,
      error: state.error,
      raw,
    };
  }
  return {
    toolName: part.tool,
    title: "title" in state && state.title ? state.title : part.tool,
    kind: part.tool,
    input: state.input,
    raw,
  };
}

function attachToolCallIdToRaw(raw: unknown, toolCallId: string): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { toolCallId, raw };
  }
  return {
    ...raw,
    toolCallId:
      typeof (raw as Record<string, unknown>).toolCallId === "string"
        ? (raw as Record<string, unknown>).toolCallId
        : toolCallId,
  };
}

function textFromParts(parts: readonly ZCodeMessagePart[]): string {
  return textFromZCodeMessageParts(parts);
}

function reasoningFromParts(parts: readonly ZCodeMessagePart[]): string | undefined {
  const text = parts
    .filter(
      (part): part is Extract<ZCodeMessagePart, { type: "reasoning" }> => part.type === "reasoning",
    )
    .map((part) => part.text)
    .join("");
  return text || undefined;
}

function fromZCodeGoal(goal: unknown): ZCodeTaskGoal {
  const record = asRecord(goal);
  const time = asRecord(record.time);
  const status = stringValue(record.status);
  return {
    sessionID: stringValue(record.sessionID) ?? stringValue(record.sessionId) ?? "",
    targetID: stringValue(record.targetID) ?? stringValue(record.targetId) ?? "",
    objective: stringValue(record.objective) ?? "",
    summaryTitle: stringValue(record.summaryTitle) ?? null,
    status: isZCodeTaskGoalStatus(status) ? status : "active",
    tokenBudget: typeof record.tokenBudget === "number" ? record.tokenBudget : null,
    tokensUsed: numberValue(record.tokensUsed) ?? 0,
    timeUsedSeconds: numberValue(record.timeUsedSeconds) ?? 0,
    time: {
      created: numberValue(time.created) ?? numberValue(record.createdAt) ?? 0,
      updated: numberValue(time.updated) ?? numberValue(record.updatedAt) ?? 0,
    },
  };
}

function isZCodeTaskGoalStatus(status: string | undefined): status is ZCodeTaskGoal["status"] {
  return (
    status === "active" ||
    status === "paused" ||
    status === "budget_limited" ||
    status === "complete"
  );
}

function sessionTodosToPlanSteps(
  todos: ZCodeSessionStateSnapshot["todos"],
): ZCodePlanStep[] | null {
  if (!todos || todos.length === 0) {
    return null;
  }
  return todos.map((todo, index) => ({
    id: `todo-${index}`,
    status: todo.status,
    title: todo.content,
  }));
}

function sessionGoalStatsToRuntime(
  stats: ZCodeSessionStateSnapshot["goalStats"],
): ZCodeTaskGoalStats | null {
  return stats ? { ...stats } : null;
}

function sessionTodoGroupsToRuntime(
  groups: ZCodeSessionStateSnapshot["todoGroups"],
): ZCodeTodoGroup[] | null {
  if (!groups || groups.length === 0) {
    return null;
  }
  return groups.map((group) => ({
    id: group.id,
    source: group.source,
    ...(group.goalIteration ? { goalIteration: group.goalIteration } : {}),
    ...(group.targetId ? { targetId: group.targetId } : {}),
    ...(group.startedAt ? { startedAt: group.startedAt } : {}),
    ...(group.updatedAt ? { updatedAt: group.updatedAt } : {}),
    todos: group.todos.map((todo, index) => ({
      id: `${group.id}-todo-${index}`,
      status: todo.status,
      title: todo.content,
    })),
  }));
}

function mapStateUpdated(
  params: TaskTarget,
  notification: ZCodeStateUpdatedNotification,
): ZCodeStreamEvent[] {
  const parsedSettings = zcodeSessionSettingsStateSchema.safeParse(notification.patch);
  if (!parsedSettings.success) {
    return [];
  }
  const traceId = generateTraceId(params.taskId);
  return [
    {
      type: "mode_update",
      taskId: params.taskId,
      traceId,
      currentModeId: normalizeAvailableZCodeMode(parsedSettings.data.mode.current),
      availableModes: getZCodeAgentAvailableModes(),
    },
    {
      type: "glm_agent_model_state_update",
      taskId: params.taskId,
      traceId,
      version: 1,
      sessionId: params.taskId,
      reason:
        notification.reason === "thought_level_changed"
          ? "thought_level_changed"
          : notification.reason === "model_changed"
            ? "model_changed"
            : "session_initialized",
      model: {
        currentValue: formatModelPickerValue(parsedSettings.data.model.current),
      },
      thoughtLevel: {
        enabled: parsedSettings.data.thoughtLevel.enabled,
        currentValue: parsedSettings.data.thoughtLevel.current,
        options: parsedSettings.data.thoughtLevel.available.map((option) => ({
          value: option.value,
          name: option.label,
        })),
      },
      contextWindow: {
        tokens:
          parsedSettings.data.model.available.find(
            (option) =>
              formatModelPickerValue(option.ref) ===
              formatModelPickerValue(parsedSettings.data.model.current),
          )?.contextWindow ?? 0,
      },
    },
  ];
}

function mapSessionEvent(
  params: TaskTarget,
  event: ZCodeSessionEvent,
  streamedTurnKeys: Set<string>,
  activePromptInputId?: InputId,
  toolProjectionMemory?: ZCodeToolProjectionMemory,
  backgroundTaskControlsByTaskKey?: Map<string, ZCodeBackgroundTaskControlItem[]>,
  hasActiveApiRetry = false,
): ZCodeStreamEvent[] {
  const protocolTraceId = event.traceId ?? generateTraceId(params.taskId);
  const payload = asRecord(event.payload);
  const inputId = stringValue(payload.inputId);
  const queryId = stringValue(payload.queryId);
  // å…¼å®¹å±‚å¯¹å¤–çš„ traceId è¯­ä¹‰æ˜¯â€œä¸€æ¬¡ç”¨æˆ·è¾“å…¥åˆ°æœ¬è½®å›žå¤ç»“æŸâ€çš„è½®æ¬¡æ ‡è¯†ã€‚
  // ZCode Protocol runtime trace åªåœ¨äº‹ä»¶æ²¡æœ‰ inputId æ—¶å…œåº•ï¼Œé¿å…åŒä¸€è½® chunk/tool/complete è¢«æ‹†æˆä¸åŒ traceã€‚
  const eventInputId = inputId ?? activePromptInputId;
  const traceId = eventInputId ?? protocolTraceId;
  if (eventInputId && eventInputId !== protocolTraceId) {
    logger.debug(
      eventInputId,
      `å¯¹é½ ZCode prompt inputId eventType=${event.type} protocolTrace=${protocolTraceId}`,
    );
  }
  const turnKey = `${event.sessionId}:${event.turnId ?? eventInputId ?? traceId}`;

  if (event.type === "turn.started") {
    streamedTurnKeys.delete(turnKey);
    const runStartedEvent: ZCodeStreamEvent = {
      type: "task_run_started",
      taskId: params.taskId,
      traceId,
      ...(eventInputId ? { inputId: eventInputId } : {}),
      ...(event.turnId ? { turnId: event.turnId } : {}),
      startedAt: event.timestamp,
    };
    const taskNotificationToolUpdate = backgroundTaskNotificationToolUpdateFromInput({
      input: stringValue(payload.input),
      taskId: params.taskId,
      traceId,
      inputId: eventInputId,
    });
    if (taskNotificationToolUpdate) {
      return [runStartedEvent, taskNotificationToolUpdate];
    }
    if (
      stringValue(payload.inputSource) === "goal-continuation" &&
      stringValue(payload.inputVisibility) === "model-only"
    ) {
      return [
        runStartedEvent,
        {
          type: "goal_iteration_started",
          taskId: params.taskId,
          traceId,
          ...(eventInputId ? { inputId: eventInputId } : {}),
          ...(stringValue(payload.targetId) ? { targetId: stringValue(payload.targetId) } : {}),
          startedAt: event.timestamp,
        },
      ];
    }
    return [runStartedEvent];
  }

  const compactTimeline = mapCompactTimelinePayload(params.taskId, traceId, eventInputId, payload);
  if (compactTimeline) {
    streamedTurnKeys.add(turnKey);
    return [compactTimeline];
  }

  const partTimeline = mapSyntheticTimelinePartPayload(
    params.taskId,
    traceId,
    eventInputId,
    payload,
  );
  if (partTimeline) {
    streamedTurnKeys.add(turnKey);
    return [partTimeline];
  }

  const modelStreaming = mapModelStreaming(
    params.taskId,
    traceId,
    eventInputId,
    payload,
    toolProjectionMemory,
  );
  const apiRetryClearEvent = maybeBuildApiRetryClearOnModelProgress(
    hasActiveApiRetry,
    params.taskId,
    traceId,
    eventInputId,
    payload,
  );
  if (modelStreaming) {
    if (modelStreaming.type === "agent_message_chunk") {
      streamedTurnKeys.add(turnKey);
    }
    return apiRetryClearEvent ? [apiRetryClearEvent, modelStreaming] : [modelStreaming];
  }
  if (apiRetryClearEvent) {
    return [apiRetryClearEvent];
  }

  if (event.type === "tool.updated") {
    return mapToolUpdated(params.taskId, traceId, eventInputId, payload, toolProjectionMemory);
  }

  if (event.type === "permission.requested") {
    const toolCallId = stringValue(payload.toolCallId);
    const toolName = stringValue(payload.toolName);
    if (toolCallId && toolName) {
      toolProjectionMemory?.toolNameById?.set(toolCallId, toolName);
    }
    if (isUserInputBackedPermissionToolName(toolName)) {
      // AskUserQuestion/ExitPlanMode çš„ permission.requested åªæ˜¯ core çš„ç­‰å¾…æ€æ ‡è®°ï¼›
      // çœŸæ­£éœ€è¦å±•ç¤ºçš„é—®é¢˜ä¼šé€šè¿‡ interaction/requestUserInput åˆ°è¾¾ã€‚ç»§ç»­æŠŠå®ƒæŠ•æˆæ™®é€šæƒé™ï¼Œ
      // UI ä¼šå‡ºçŽ° Allow/Deny å¼¹çª—ä¸”æ— æ³•æŠŠç­”æ¡ˆå†™å›žå·¥å…· inputã€‚
      return [];
    }
    return [permissionPayloadToStreamEvent(params.taskId, traceId, eventInputId, payload)];
  }

  if (event.type === "permission.resolved") {
    return permissionResolvedPayloadToStreamEvents(
      params.taskId,
      traceId,
      eventInputId,
      payload,
      toolProjectionMemory?.toolNameById,
    );
  }

  if (event.type === "turn.steerQueued") {
    const source = turnSteerSourceValue(payload.source);
    return [
      {
        type: "turn_steer_queued",
        taskId: params.taskId,
        traceId,
        ...(eventInputId ? { inputId: eventInputId } : {}),
        ...(queryId ? { queryId } : {}),
        pendingInputId: stringValue(payload.pendingInputId) ?? event.eventId,
        messageId: eventInputId,
        ...(turnSteerCommandKindValue(payload.commandKind)
          ? { commandKind: turnSteerCommandKindValue(payload.commandKind) }
          : {}),
        ...(source ? { source } : {}),
        targetTurnId: stringValue(payload.targetTurnId),
        content: stringValue(payload.input) ?? "",
        raw: payload,
      },
    ];
  }

  if (event.type === "turn.steerDrained") {
    return [
      {
        type: "turn_steer_status",
        taskId: params.taskId,
        traceId,
        ...(eventInputId ? { inputId: eventInputId } : {}),
        ...(stringArray(payload.queryIds).length > 0
          ? { queryIds: stringArray(payload.queryIds) }
          : {}),
        status: "drained",
        pendingInputIds: stringArray(payload.pendingInputIds),
        injectedMessageIds: stringArray(payload.injectedMessageIds),
        targetTurnId: stringValue(payload.targetTurnId),
        raw: payload,
      },
    ];
  }

  if (event.type === "turn.completed") {
    const events: ZCodeStreamEvent[] = [];
    const response = stringValue(payload.response);
    if (response && !streamedTurnKeys.has(turnKey)) {
      events.push({
        type: "agent_message_chunk",
        taskId: params.taskId,
        traceId,
        ...(eventInputId ? { inputId: eventInputId } : {}),
        content: response,
      });
    }
    events.push({
      type: "task_complete",
      taskId: params.taskId,
      traceId,
      ...(eventInputId ? { inputId: eventInputId } : {}),
      stopReason: stringValue(payload.resultType) ?? "complete",
      usage: usageFromPayload(payload.usage),
    });
    toolProjectionMemory?.streamingToolInputById?.clear();
    streamedTurnKeys.delete(turnKey);
    return events;
  }

  if (event.type === "turn.failed") {
    toolProjectionMemory?.streamingToolInputById?.clear();
    streamedTurnKeys.delete(turnKey);
    const errorPayload = asRecord(payload.error);
    if (stringValue(payload.turnPhase) === "compact") {
      return [
        compactFailureToTimelineEvent(
          params.taskId,
          traceId,
          eventInputId,
          stringValue(errorPayload.message) ?? "ZCode compact failed",
        ),
      ];
    }
    const attribution = errorAttributionSchema.safeParse(errorPayload.attribution);
    // dynamic task event ä¹Ÿä¼šå†™å…¥ task indexï¼›åªä¿® snapshot è¯»è·¯å¾„ä»ä¼šä¸¢ live å½’å› ã€‚
    return [
      {
        type: "task_error",
        taskId: params.taskId,
        traceId,
        ...(eventInputId ? { inputId: eventInputId } : {}),
        error: stringValue(errorPayload.message) ?? "ZCode session failed",
        // type æ˜¯å¤–å±‚é”™è¯¯åˆ†ç±»ï¼Œcode æ‰æ˜¯ provider/subagent è¦å±•ç¤ºçš„çœŸå®žé”™è¯¯ç ã€‚
        code: stringValue(errorPayload.code) ?? stringValue(errorPayload.type),
        detail: stringValue(errorPayload.detail),
        ...(attribution.success ? { attribution: attribution.data } : {}),
      },
    ];
  }

  return mapSessionInfoLikePayload(
    params.taskId,
    traceId,
    eventInputId,
    event.eventId,
    payload,
    backgroundTaskControlsByTaskKey,
    `${resolveWorkspaceKey(params)}\u0000${params.taskId}`,
  );
}

function maybeBuildApiRetryClearOnModelProgress(
  hasActiveApiRetry: boolean,
  taskId: string,
  traceId: TraceId,
  inputId: InputId | undefined,
  payload: Record<string, unknown>,
): Extract<ZCodeStreamEvent, { type: "session_info_update" }> | null {
  if (!hasActiveApiRetry || !isZCodeModelRetryRecoveryProgressPayload(payload)) {
    return null;
  }
  // é‡è¯•è¯·æ±‚å¼€å§‹ä¸ä»£è¡¨æ¢å¤æˆåŠŸï¼Œç«‹å³æ¸…ä¼šè®©è¾“å…¥æ é—ªçƒï¼›
  // åªæœ‰ retry attempt çœŸçš„äº§å‡ºæ¨¡åž‹å†…å®¹ï¼Œæ‰æ¸…æŽ‰â€œé‡è¯•ä¸­â€è¿è¡Œæ€ã€‚
  return {
    type: "session_info_update",
    taskId,
    traceId,
    ...(inputId ? { inputId } : {}),
    apiRetry: null,
  };
}

function mapModelStreaming(
  taskId: string,
  traceId: TraceId,
  inputId: InputId | undefined,
  payload: Record<string, unknown>,
  toolProjectionMemory?: ZCodeToolProjectionMemory,
): ZCodeStreamEvent | null {
  const kind = stringValue(payload.kind);
  const delta = stringValue(payload.delta);
  const parentToolUseId = parentToolUseIdFromToolPayload(payload);
  if (kind === "text_delta") {
    if (!delta) {
      return null;
    }
    return {
      type: "agent_message_chunk",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      ...(parentToolUseId ? { parentToolUseId } : {}),
      messageId: stringValue(payload.assistantMessageId),
      content: delta,
    };
  }
  if (kind === "reasoning_delta") {
    if (!delta) {
      return null;
    }
    return {
      type: "agent_thought_chunk",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      ...(parentToolUseId ? { parentToolUseId } : {}),
      content: delta,
    };
  }
  return mapToolInputStreaming(taskId, traceId, inputId, payload, toolProjectionMemory);
}

function mapToolInputStreaming(
  taskId: string,
  traceId: TraceId,
  inputId: InputId | undefined,
  payload: Record<string, unknown>,
  toolProjectionMemory?: ZCodeToolProjectionMemory,
): ZCodeStreamEvent | null {
  const streamingToolInputById = toolProjectionMemory?.streamingToolInputById;
  const toolNameById = toolProjectionMemory?.toolNameById;
  const kind = stringValue(payload.kind);
  const toolId = stringValue(payload.toolCallId);
  if (!toolId) {
    return null;
  }
  const toolName = stringValue(payload.toolName) ?? toolNameById?.get(toolId);
  if (toolName) {
    toolNameById?.set(toolId, toolName);
  }
  const title = toolName ?? "tool";
  const parentToolUseId = parentToolUseIdFromToolPayload(payload);
  const buildRaw = (input: unknown, rawInput: string | undefined) => ({
    ...payload,
    ...(input !== undefined ? { input } : {}),
    ...(rawInput ? { streamingRawInputLength: rawInput.length } : {}),
  });

  if (kind === "tool_input_start") {
    streamingToolInputById?.set(toolId, { rawInput: "" });
    logStreamingToolInputProjection(traceId, {
      inputKeys: [],
      kind,
      projectedType: "tool_call",
      rawInputLength: 0,
      taskId,
      toolId,
      toolName,
    });
    return {
      type: "tool_call",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      toolId,
      parentToolUseId,
      input: {},
      toolName,
      kind: title,
      title,
      raw: buildRaw({}, undefined),
    };
  }

  if (kind === "tool_input_delta") {
    const state = appendZCodeStreamingToolInputDelta(
      streamingToolInputById?.get(toolId),
      stringValue(payload.delta) ?? "",
    );
    streamingToolInputById?.set(toolId, state);
    if (!shouldMaterializeZCodeStreamingToolInputPreview(state, { toolName })) {
      // æ€§èƒ½ä¿®å¤ï¼šservices å…¼å®¹æŠ•å½±æ›¾ç»æ¯ä¸ª delta éƒ½è§£æžç´¯è®¡ JSONï¼Œå¹¶æŠŠ rawInput å…¨é‡å¡žè¿› rawã€‚
      // è¿™é‡Œå…ˆåªç»´æŠ¤ tombstone bufferï¼Œè¾¾åˆ°é¢„ç®—æˆ–æŽ§åˆ¶è¾¹ç•Œå† emitï¼Œé¿å… host/renderer åŒç«¯ O(nÂ²)ã€‚
      return null;
    }
    const preview = buildZCodeStreamingToolInputPreview(state.rawInput);
    markZCodeStreamingToolInputPreviewMaterialized(state);
    const previewToolName = toolName ?? inferStreamingToolInputToolName(preview.input);
    const previewTitle = previewToolName ?? title;
    if (previewToolName && !toolName) {
      toolNameById?.set(toolId, previewToolName);
    }
    logStreamingToolInputProjection(traceId, {
      inputKeys: inputPreviewKeys(preview.input),
      kind,
      projectedType: "tool_call_update",
      rawInputLength: state.rawInput.length,
      taskId,
      toolId,
      toolName: previewToolName,
    });
    return {
      type: "tool_call_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      toolId,
      parentToolUseId,
      status: "pending",
      title: previewTitle,
      toolName: previewToolName,
      kind: previewTitle,
      input: preview.input,
      raw: buildRaw(preview.input, preview.rawInput),
    };
  }

  if (kind === "tool_input_end") {
    const state = streamingToolInputById?.get(toolId) ?? { rawInput: "" };
    const previewToolName = toolName ?? title;
    const previewTitle = previewToolName ?? title;
    logStreamingToolInputProjection(traceId, {
      inputKeys: [],
      kind,
      projectedType: "tool_call_update",
      rawInputLength: state.rawInput.length,
      taskId,
      toolId,
      toolName: previewToolName,
    });
    return {
      type: "tool_call_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      toolId,
      parentToolUseId,
      status: "pending",
      title: previewTitle,
      toolName: previewToolName,
      kind: previewTitle,
      // æ€§èƒ½ä¿®å¤ï¼štool_input_end ä¸Žæœ€ç»ˆ tool_call ç›¸é‚»æ—¶ä¸å†é‡å¤è§£æžåŒä¸€ä»½å¤§ JSONï¼›
      // end åªä½œä¸ºç”Ÿå‘½å‘¨æœŸè¾¹ç•Œï¼Œå®Œæ•´ input äº¤ç»™ tool_call ä¸€æ¬¡æ€§è½åº“/æ¸²æŸ“ã€‚
      raw: buildRaw(undefined, state.rawInput),
    };
  }

  if (kind === "tool_call") {
    const state = streamingToolInputById?.get(toolId);
    const rawInput = state?.rawInput ?? "";
    const hasCompleteInput = "input" in payload;
    const completeInput = hasCompleteInput ? payload.input : undefined;
    const preview = buildZCodeStreamingToolInputPreview(
      rawInput,
      hasCompleteInput ? completeInput : undefined,
    );
    const previewToolName = toolName ?? inferStreamingToolInputToolName(preview.input);
    const previewTitle = previewToolName ?? title;
    if (previewToolName && !toolName) {
      toolNameById?.set(toolId, previewToolName);
    }
    if ((hasCompleteInput || preview.complete) && toolProjectionMemory) {
      finalizeZCodeToolProjectionInput(toolId, preview.input, toolProjectionMemory);
    }
    streamingToolInputById?.set(toolId, {
      // æ€§èƒ½ä¿®å¤ï¼šæœ€ç»ˆ tool_call å·²ç»æŒæœ‰å®Œæ•´ inputï¼Œcompat projection ä¸å†é•¿æœŸä¿ç•™
      // streaming raw bufferï¼Œé¿å…å¹¶å‘é•¿ä»»åŠ¡æ—¶ host ä¾§å†…å­˜å’Œåºåˆ—åŒ–æˆæœ¬ç»§ç»­æ”¾å¤§ã€‚
      rawInput: "",
      deltaCount: state?.deltaCount,
      lastPreviewAt: Date.now(),
      lastPreviewRawInputLength: rawInput.length,
    });
    logStreamingToolInputProjection(traceId, {
      inputKeys: inputPreviewKeys(preview.input),
      kind,
      projectedType: "tool_call_update",
      rawInputLength: rawInput.length,
      taskId,
      toolId,
      toolName: previewToolName,
    });
    return {
      type: "tool_call_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      toolId,
      parentToolUseId,
      status: "pending",
      title: previewTitle,
      toolName: previewToolName,
      kind: previewTitle,
      input: preview.input,
      raw: buildRaw(preview.input, preview.rawInput),
    };
  }

  return null;
}

function logStreamingToolInputProjection(
  traceId: TraceId,
  details: {
    inputKeys: string[];
    kind: string;
    projectedType: "tool_call" | "tool_call_update";
    rawInputLength: number;
    taskId: string;
    toolId: string;
    toolName?: string;
  },
): void {
  logger.debug(traceId, "ZCode streaming tool input projected", {
    ...details,
    event: "zcode.task.streaming_tool_input.projected",
  });
}

function inputPreviewKeys(input: unknown): string[] {
  return Object.keys(asRecord(input));
}

function inferStreamingToolInputToolName(input: unknown): string | undefined {
  const record = asRecord(input);
  const filePath = readStreamingToolInputStringField(record, [
    "file_path",
    "filePath",
    "path",
    "target_path",
    "targetPath",
    "filename",
    "file",
  ]);
  if (!filePath) {
    return undefined;
  }
  if (
    readStreamingToolInputStringField(record, ["old_string", "oldString", "old_text", "oldText"])
  ) {
    return "Edit";
  }
  if (
    readStreamingToolInputStringField(record, [
      "content",
      "new_string",
      "newString",
      "new_text",
      "newText",
    ]) !== undefined
  ) {
    return "Write";
  }
  return undefined;
}

function readStreamingToolInputStringField(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function mapCompactTimelinePayload(
  taskId: string,
  traceId: TraceId,
  inputId: InputId | undefined,
  payload: Record<string, unknown>,
): Extract<ZCodeStreamEvent, { type: "agent_message_chunk" }> | null {
  const timeline = compactTimelineMetaFromPayload(payload, inputId);
  if (!timeline) {
    return null;
  }
  const messageId = stringValue(payload.messageId);
  return {
    type: "agent_message_chunk",
    taskId,
    traceId,
    ...(inputId ? { inputId } : {}),
    ...(messageId ? { messageId } : {}),
    // compact lifecycle æ˜¯ç»“æž„åŒ–çŠ¶æ€äº‹ä»¶ï¼Œä¸æ˜¯ assistant æ­£æ–‡ã€‚
    // å³ä½¿ä¸Šæ¸¸è¯¯å¸¦ textï¼Œä¹Ÿä¸èƒ½æŠŠå†…éƒ¨ summary/prompt æŠ•å½±åˆ°èŠå¤©åŒºã€‚
    content: "",
    zcodeTimeline: timeline,
  };
}

function mapSyntheticTimelinePartPayload(
  taskId: string,
  traceId: TraceId,
  inputId: InputId | undefined,
  payload: Record<string, unknown>,
): Extract<ZCodeStreamEvent, { type: "agent_message_chunk" }> | null {
  const part = asRecord(payload.part);
  if (part.type !== "text") {
    return null;
  }
  const timeline = extractSyntheticTimelineFromTextPart(
    part as Extract<ZCodeMessagePart, { type: "text" }>,
  );
  if (!timeline) {
    return null;
  }
  const messageId = stringValue(part.messageId) ?? stringValue(payload.messageId);
  return {
    type: "agent_message_chunk",
    taskId,
    traceId,
    ...(inputId ? { inputId } : {}),
    ...(messageId ? { messageId } : {}),
    content: stringValue(part.text) ?? "",
    // fork notice æ˜¯ part.upserted é‡Œçš„ç»“æž„åŒ– synthetic textï¼Œä¸æ˜¯æ¨¡åž‹æ­£æ–‡ deltaã€‚
    // è¿™é‡Œæå‰æŠ•æˆ timeline dividerï¼Œé¿å… UI æŒ‰æ™®é€šæ¶ˆæ¯æ¸²æŸ“åŽä¸¢æŽ‰æ¨ªçº¿ã€‚
    zcodeTimeline: timeline,
  };
}

function compactTimelineMetaFromPayload(
  payload: Record<string, unknown>,
  inputId: InputId | undefined,
): ZCodeContextCompactionTimelineMeta | null {
  const operationId = stringValue(payload.operationId);
  const status = timelineStatusValue(payload.status ?? payload.timelineStatus);
  if (!operationId || !status) {
    return null;
  }
  const trigger = timelineTriggerValue(payload.trigger) ?? "manual";
  const replace = booleanValue(payload.replace);
  const reason = stringValue(payload.reason);
  const boundaryId = stringValue(payload.boundaryId);
  const summaryMessageId = stringValue(payload.summaryMessageId);
  const preCompactTokenCount = numberValue(payload.preCompactTokenCount);
  const postCompactTokenCount = numberValue(payload.postCompactTokenCount);
  const truePostCompactTokenCount = numberValue(payload.truePostCompactTokenCount);
  const attempt = numberValue(payload.attempt);
  const maxAttempts = numberValue(payload.maxAttempts);
  const startedAt = numberValue(payload.startedAt);
  const endedAt = numberValue(payload.endedAt);
  return {
    version: 1,
    kind: "synthetic",
    type: "context_compaction",
    operationId,
    status,
    trigger,
    display: "separator",
    ...(inputId ? { inputId } : {}),
    ...(replace !== undefined ? { replace } : {}),
    ...(reason ? { reason } : {}),
    ...(boundaryId ? { boundaryId } : {}),
    ...(summaryMessageId ? { summaryMessageId } : {}),
    ...(preCompactTokenCount !== undefined ? { preCompactTokenCount } : {}),
    ...(postCompactTokenCount !== undefined ? { postCompactTokenCount } : {}),
    ...(truePostCompactTokenCount !== undefined ? { truePostCompactTokenCount } : {}),
    ...(attempt !== undefined ? { attempt } : {}),
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(endedAt !== undefined ? { endedAt } : {}),
  };
}

function compactFailureToTimelineEvent(
  taskId: string,
  traceId: TraceId,
  inputId: InputId | undefined,
  reason: string,
): Extract<ZCodeStreamEvent, { type: "agent_message_chunk" }> {
  return {
    type: "agent_message_chunk",
    taskId,
    traceId,
    ...(inputId ? { inputId } : {}),
    content: "",
    zcodeTimeline: {
      version: 1,
      kind: "synthetic",
      type: "context_compaction",
      operationId: `compact-failed-${inputId ?? traceId}`,
      status: /abort|cancel|interrupt|stop/i.test(reason) ? "interrupted" : "failed",
      trigger: "manual",
      display: "separator",
      ...(inputId ? { inputId } : {}),
      reason,
      endedAt: Date.now(),
    },
  };
}

function mapToolUpdated(
  taskId: string,
  traceId: TraceId,
  inputId: InputId | undefined,
  payload: Record<string, unknown>,
  toolProjectionMemory?: ZCodeToolProjectionMemory,
): ZCodeStreamEvent[] {
  const toolId = stringValue(payload.toolCallId);
  if (!toolId) {
    return [];
  }
  const parentToolUseId = parentToolUseIdFromToolPayload(payload);
  const memory = toolProjectionMemory ?? {};
  const toolNameById = memory.toolNameById;
  const rememberedTool = resolveZCodeToolProjectionMetadata(payload, toolId, memory);
  const rememberedToolName = rememberedTool.toolName;
  const rememberedInput = rememberedTool.hasInput ? rememberedTool.input : undefined;
  if ("input" in payload && "toolName" in payload) {
    const toolName = rememberedToolName ?? "tool";
    toolNameById?.set(toolId, toolName);
    finalizeZCodeToolProjectionInput(toolId, payload.input, memory);
    const toolEvent: ZCodeStreamEvent = {
      type: "tool_call",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      toolId,
      parentToolUseId,
      input: payload.input,
      toolName,
      kind: toolName,
      title: toolName,
      raw: payload,
    };
    const planSteps = isMainAgentToolProjectionSource(payload)
      ? extractPlanStepsFromToolInput({
          title: toolName,
          kind: toolName,
          input: payload.input,
        })
      : null;
    if (!planSteps) {
      return [toolEvent];
    }
    return [
      toolEvent,
      {
        type: "plan",
        taskId,
        traceId,
        ...(inputId ? { inputId } : {}),
        steps: planSteps,
      },
    ];
  }
  if ("result" in payload) {
    const result = asRecord(payload.result);
    // ZCode Protocol çš„ ToolCallResult åªæœ‰ toolCallId/resultï¼Œä¸å†é‡å¤å¸¦ toolNameã€‚
    // åŽ»æŽ‰ ZCode Agent åŽå¦‚æžœä¸è®°ä½å‰åº ToolCallScheduled çš„ TodoWrite åç§°ï¼Œresult é‡Œçš„ todos
    // å°±åªèƒ½å½“æ™®é€šå­—ç¬¦ä¸²è¾“å‡ºï¼Œæ— æ³•ç»§ç»­æŠ•å°„æˆé¡¶éƒ¨ todo/plan äº‹ä»¶ã€‚
    const toolName = rememberedToolName;
    const content = normalizeToolResultContent(toolName, result);
    const status = toolResultStatus(toolName, result);
    const toolEvent: ZCodeStreamEvent = {
      type: "tool_call_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      toolId,
      parentToolUseId,
      toolName,
      kind: toolName,
      title: toolName,
      ...(rememberedInput !== undefined ? { input: rememberedInput } : {}),
      status,
      content,
      error: stringValue(asRecord(result.error).message),
      raw: payload,
    };
    if (status !== "in_progress") {
      forgetZCodeToolProjectionMetadata(toolId, memory);
    }
    const planSteps = isMainAgentToolProjectionSource(payload)
      ? extractPlanStepsFromToolOutput({
          title: toolName,
          kind: toolName,
          output: content ?? result,
        })
      : null;
    if (!planSteps) {
      return [toolEvent];
    }
    return [
      toolEvent,
      {
        type: "plan",
        taskId,
        traceId,
        ...(inputId ? { inputId } : {}),
        steps: planSteps,
      },
    ];
  }
  if ("error" in payload) {
    forgetZCodeToolProjectionMetadata(toolId, memory);
    return [
      {
        type: "tool_call_update",
        taskId,
        traceId,
        ...(inputId ? { inputId } : {}),
        toolId,
        parentToolUseId,
        toolName: rememberedToolName,
        kind: rememberedToolName,
        title: rememberedToolName,
        ...(rememberedInput !== undefined ? { input: rememberedInput } : {}),
        status: "failed",
        error: stringValue(asRecord(payload.error).message) ?? "Tool failed",
        raw: payload,
      },
    ];
  }
  return [
    {
      type: "tool_call_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      toolId,
      parentToolUseId,
      toolName: rememberedToolName,
      kind: rememberedToolName,
      title: rememberedToolName,
      ...(rememberedInput !== undefined && payload.inputOmitted !== true
        ? { input: rememberedInput }
        : {}),
      status: "in_progress",
      raw: payload,
    },
  ];
}

function toolResultStatus(
  toolName: string | undefined,
  result: Record<string, unknown>,
): Extract<ZCodeStreamEvent, { type: "tool_call_update" }>["status"] {
  if (result.success === false) {
    return "failed";
  }
  if (isBackgroundAgentLaunchResult(toolName, result)) {
    // Agent åŽå°å¯åŠ¨ ACK åªæ˜¯å­ agent å·²åˆ›å»ºï¼Œä¸ä»£è¡¨å­ agent å·²å®Œæˆï¼›
    // æŠ•å½±æˆ completed ä¼šè®©å‰ç«¯åœ¨çœŸå®ž completion å‰æŠŠ subagent å¡ç‰‡è¯¯æ ‡ä¸ºå®Œæˆã€‚
    return "in_progress";
  }
  return "completed";
}

function isBackgroundAgentLaunchResult(
  toolName: string | undefined,
  result: Record<string, unknown>,
): boolean {
  const content = stringValue(result.content);
  if (!content) {
    return false;
  }
  if (
    (isSubagentDispatchToolName(toolName) || toolName === undefined) &&
    isBackgroundAgentLaunchAcknowledgement(content)
  ) {
    return true;
  }
  const parsed = parseJsonRecord(content);
  const parsedStatus = stringValue(parsed?.status);
  return (
    parsed !== null &&
    (isSubagentDispatchToolName(toolName) || stringValue(parsed.agentId) !== undefined) &&
    ((parsedStatus === "backgrounded" && stringValue(parsed.backgroundTaskId) !== undefined) ||
      (parsedStatus === "async_launched" &&
        stringValue(parsed.agentId) !== undefined &&
        stringValue(parsed.outputFile) !== undefined))
  );
}

function isBackgroundAgentLaunchAcknowledgement(content: string): boolean {
  // subagent async launch çš„æ¨¡åž‹å¯è§ ACK ä»Ž backgroundTaskId/outputFile æ–‡æ¡ˆè¿åˆ° output_file æ–‡æ¡ˆï¼›
  // service projection éœ€è¦åŒæ—¶è¯†åˆ«æ–°æ—§æ ¼å¼ï¼Œå¦åˆ™ä¼šæŠŠå¯åŠ¨ç¡®è®¤å½“æˆå·²å®Œæˆç»“æžœå‘ç»™ UIã€‚
  return (
    isLegacyBackgroundAgentLaunchAcknowledgement(content) ||
    isPreviousBackgroundAgentLaunchAcknowledgement(content) ||
    isCurrentBackgroundAgentLaunchAcknowledgement(content)
  );
}

function isLegacyBackgroundAgentLaunchAcknowledgement(content: string): boolean {
  return (
    content.includes("backgroundTaskId:") &&
    content.includes("Runtime will wait for this background Agent")
  );
}

function isPreviousBackgroundAgentLaunchAcknowledgement(content: string): boolean {
  return (
    content.startsWith("Agent ") &&
    content.includes(" started in background.") &&
    content.includes("agentId:") &&
    content.includes("outputFile:") &&
    content.includes("You will be notified when the Agent completes.")
  );
}

function isCurrentBackgroundAgentLaunchAcknowledgement(content: string): boolean {
  return (
    content.startsWith("Async agent launched successfully.") &&
    content.includes("agentId:") &&
    content.includes("The agent is working in the background.") &&
    content.includes("notified automatically when it completes")
  );
}

function isSubagentDispatchToolName(toolName: string | undefined): boolean {
  return toolName === "Agent" || toolName === "Task";
}

function parentToolUseIdFromToolPayload(payload: Record<string, unknown>): string | null {
  // ZCode Protocol å‘é€çš„çˆ¶çº§å­—æ®µå« parentToolCallIdï¼›
  // UI stream æ¨¡åž‹ç»Ÿä¸€æ¶ˆè´¹ parentToolUseIdï¼Œå¿…é¡»åœ¨æœåŠ¡æŠ•å½±å±‚å®Œæˆä¸€æ¬¡æ€§å½’ä¸€ã€‚
  return stringValue(payload.parentToolUseId) ?? stringValue(payload.parentToolCallId) ?? null;
}

function normalizeToolResultContent(
  toolName: string | undefined,
  result: Record<string, unknown>,
): unknown {
  const content = result.content;
  const agentActivity = parseAgentActivityResultContent(toolName, content);
  return agentActivity ?? stringValue(content);
}

function parseAgentActivityResultContent(
  toolName: string | undefined,
  content: unknown,
): { kind: "agent_activity"; content: string; thought?: string } | null {
  if (typeof content !== "string" || content.trim().length === 0) {
    return null;
  }
  const parsed = parseJsonRecord(content);
  if (!parsed) {
    return null;
  }
  const isAgentResult =
    toolName === "Agent" ||
    toolName === "Task" ||
    stringValue(parsed.agentId) !== undefined ||
    stringValue(parsed.agentType) !== undefined;
  if (!isAgentResult) {
    return null;
  }
  // Agent å·¥å…·ç»“æžœæ˜¯ JSON å­—ç¬¦ä¸²ï¼Œæœ€ç»ˆæ‘˜è¦åœ¨ content[].textï¼›
  // æœåŠ¡å±‚å…ˆè½¬æˆ agent_activityï¼Œé¿å… UI æ¯æ¡æ¸²æŸ“è·¯å¾„éƒ½çŒœåŽŸå§‹ JSONã€‚
  const output = agentTextFromContentField(parsed.content);
  if (!output) {
    return null;
  }
  const thought = stringValue(parsed.thought);
  return {
    kind: "agent_activity",
    content: output,
    ...(thought ? { thought } : {}),
  };
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function agentTextFromContentField(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const text = value
    .map((item) => stringValue(asRecord(item).text))
    .filter((item): item is string => Boolean(item))
    .join("\n");
  return text || undefined;
}

function permissionRequestToStreamEvent(
  taskId: string,
  request: ZCodePermissionRequestParams,
): ZCodePermissionRequest {
  return {
    type: "permission_request",
    taskId,
    traceId: generateTraceId(taskId),
    requestId: request.requestId,
    description: request.reason || request.toolName,
    kind: request.toolName,
    title: request.toolName,
    options: request.options,
    ...(request.origin ? { origin: request.origin } : {}),
    raw: request,
  };
}

function pendingPermissionToStreamEvent(
  taskId: string,
  permission: ZCodeSessionStateSnapshot["projection"]["pendingPermissions"][number],
): ZCodePermissionRequest {
  return {
    type: "permission_request",
    taskId,
    traceId: generateTraceId(taskId),
    requestId: permission.requestId,
    description: permission.reason || permission.toolName,
    kind: permission.toolName,
    title: permission.toolName,
    options: permission.options,
    ...(permission.origin ? { origin: permission.origin } : {}),
    raw: permission,
  };
}

function userInputRequestToElicitationStreamEvent(
  taskId: string,
  request: ZCodeUserInputRequestParams,
): ZCodeStreamEvent {
  const questions =
    request.questions?.map((question) => ({
      question: question.question,
      header: question.header,
      options: question.options.map((option) => ({
        value: option.value,
        label: option.label,
        description: option.description,
      })),
      ...(question.multiSelect ? { multiSelect: true } : {}),
    })) ?? [];
  const firstQuestion = questions[0];
  const requestSchema = asRecord(request.schema);
  const requestInput = asRecord(request.input);
  const plan =
    requestSchema.interaction === "plan_approval" &&
    typeof requestInput.plan === "string" &&
    requestInput.plan.trim()
      ? requestInput.plan.trim()
      : undefined;
  return {
    type: "elicitation_request",
    taskId,
    traceId: generateTraceId(taskId),
    requestId: request.requestId,
    message: firstQuestion?.question ?? request.prompt ?? "Input required",
    header: firstQuestion?.header,
    options: firstQuestion?.options ?? [],
    ...(firstQuestion?.multiSelect ? { multiSelect: true } : {}),
    ...(questions.length > 0 ? { questions } : {}),
    ...(request.origin ? { origin: request.origin } : {}),
    // ExitPlanMode çš„ request åŒæ—¶æºå¸¦ schema å’Œ inputï¼›ç›´æŽ¥å– `schema ?? input`
    // ä¼šä¸¢æŽ‰ input.planï¼Œå®¡æ‰¹æŠ•å½±å› è€Œç¼ºå°‘æ­£æ–‡ã€‚
    // è¿™é‡Œåªåˆå…¥ planï¼Œä¿æŒæ™®é€š elicitation ä»¥åŠå…¶ä»–å·¥å…· input çš„æ•°æ®è¾¹ç•Œã€‚
    schema: plan ? { ...requestSchema, plan } : (request.schema ?? request.input),
  };
}

function userInputResponseToElicitationStreamEvent(
  taskId: string,
  requestId: string,
  response: ZCodeUserInputResponse,
): Extract<ZCodeStreamEvent, { type: "elicitation_response" }> {
  return {
    type: "elicitation_response",
    taskId,
    traceId: generateTraceId(taskId),
    requestId,
    action: response.action,
    ...(response.content ? { content: response.content } : {}),
  };
}

type PendingElicitationQuestion = {
  question: string;
  header: string;
  options: Array<{ value: string; label: string; description?: string }>;
  multiSelect?: boolean;
};

function pendingUserInputBackedPermissionToElicitationEvent(
  taskId: string,
  permission: ZCodeSessionStateSnapshot["projection"]["pendingPermissions"][number],
): Extract<ZCodeStreamEvent, { type: "elicitation_request" }> | null {
  if (isAskUserQuestionToolName(permission.toolName)) {
    return pendingAskUserQuestionToElicitationEvent(taskId, permission);
  }
  if (isExitPlanModeToolName(permission.toolName)) {
    return pendingExitPlanModeToElicitationEvent(taskId, permission);
  }
  return null;
}

function pendingAskUserQuestionToElicitationEvent(
  taskId: string,
  permission: ZCodeSessionStateSnapshot["projection"]["pendingPermissions"][number],
): Extract<ZCodeStreamEvent, { type: "elicitation_request" }> | null {
  const questions = askUserQuestionInputToElicitationQuestions(permission.input);
  if (questions.length === 0) {
    return null;
  }
  const firstQuestion = questions[0];
  return {
    type: "elicitation_request",
    taskId,
    traceId: generateTraceId(taskId),
    requestId: permission.requestId,
    message: firstQuestion?.question ?? permission.reason,
    header: firstQuestion?.header,
    options: firstQuestion?.options ?? [],
    ...(firstQuestion?.multiSelect ? { multiSelect: true } : {}),
    questions,
    ...(permission.origin ? { origin: permission.origin } : {}),
    schema: permission.input,
  };
}

function pendingExitPlanModeToElicitationEvent(
  taskId: string,
  permission: ZCodeSessionStateSnapshot["projection"]["pendingPermissions"][number],
): Extract<ZCodeStreamEvent, { type: "elicitation_request" }> {
  const questions = createExitPlanModeApprovalQuestions();
  const firstQuestion = questions[0];
  const input = asRecord(permission.input);
  const plan = typeof input.plan === "string" && input.plan.trim() ? input.plan.trim() : undefined;
  return {
    type: "elicitation_request",
    taskId,
    traceId: generateTraceId(taskId),
    requestId: permission.requestId,
    message: firstQuestion.question,
    header: firstQuestion.header,
    options: firstQuestion.options,
    questions,
    ...(permission.origin ? { origin: permission.origin } : {}),
    // è®¡åˆ’å®¡æ‰¹æŠ•å½±å¿…é¡»å±•ç¤ºæœ¬æ¬¡ ExitPlanMode å¯¹åº”çš„è®¡åˆ’æ­£æ–‡ï¼›
    // è¿™é‡Œåªå®šå‘æŠ•å½± planï¼Œé¿å…æŠŠå…¶ä»– permission input æ³„æ¼åˆ°é€šç”¨ elicitation schemaã€‚
    schema: {
      interaction: "plan_approval",
      toolName: permission.toolName,
      ...(plan ? { plan } : {}),
    },
  };
}

function setTaskBackgroundTaskControlCache(
  cache: Map<string, ZCodeBackgroundTaskControlItem[]> | undefined,
  cacheKey: string,
  jobs: ZCodeBackgroundTaskControlItem[],
) {
  cache?.set(cacheKey, jobs);
}

function updateTaskBackgroundTaskControlCacheFromPayload(
  cache: Map<string, ZCodeBackgroundTaskControlItem[]> | undefined,
  cacheKey: string,
  payload: Record<string, unknown>,
): ZCodeBackgroundTaskControlItem[] | null {
  const parsedJobs = parseZCodeBackgroundTaskControlItems([payload]);
  if (parsedJobs.length === 0) {
    return null;
  }
  if (!cache) {
    return parsedJobs;
  }
  const nextJobs = mergeZCodeBackgroundTaskControlItems(cache.get(cacheKey) ?? [], parsedJobs);
  cache.set(cacheKey, nextJobs);
  return nextJobs;
}

function createExitPlanModeApprovalQuestions(): [PendingElicitationQuestion] {
  return [
    {
      header: "Plan",
      options: [
        {
          description: "Exit plan mode and start implementation.",
          label: "Approve",
          value: EXIT_PLAN_MODE_APPROVAL_APPROVE,
        },
      ],
      question: EXIT_PLAN_MODE_APPROVAL_QUESTION,
    },
  ];
}

function askUserQuestionInputToElicitationQuestions(input: unknown): PendingElicitationQuestion[] {
  type ElicitationOption = PendingElicitationQuestion["options"][number];
  const questions = asRecord(input).questions;
  if (!Array.isArray(questions)) {
    return [];
  }
  return questions
    .map((question) => {
      const record = asRecord(question);
      const questionText = stringValue(record.question);
      const header = stringValue(record.header) ?? questionText;
      const rawOptions = Array.isArray(record.options) ? record.options : [];
      const options: ElicitationOption[] = rawOptions
        .map((option) => {
          const optionRecord = asRecord(option);
          const label = stringValue(optionRecord.label);
          if (!label) {
            return null;
          }
          const description = stringValue(optionRecord.description);
          const parsedOption: ElicitationOption = {
            value: label,
            label,
            ...(description ? { description } : {}),
          };
          return parsedOption;
        })
        .filter((option): option is ElicitationOption => option !== null);
      if (!questionText || !header || options.length === 0) {
        return null;
      }
      const parsedQuestion: PendingElicitationQuestion = {
        question: questionText,
        header,
        options,
        ...(record.multiSelect === true ? { multiSelect: true } : {}),
      };
      return parsedQuestion;
    })
    .filter((question): question is PendingElicitationQuestion => question !== null);
}

function permissionPayloadToStreamEvent(
  taskId: string,
  traceId: TraceId,
  inputId: InputId | undefined,
  payload: Record<string, unknown>,
): ZCodeStreamEvent {
  return {
    type: "permission_request",
    taskId,
    traceId,
    ...(inputId ? { inputId } : {}),
    requestId: stringValue(payload.requestId) ?? stringValue(payload.toolCallId) ?? "unknown",
    description:
      stringValue(payload.reason) ?? stringValue(payload.toolName) ?? "Permission required",
    kind: stringValue(payload.toolName) ?? "tool",
    title: stringValue(payload.toolName),
    options: permissionOptionsFromPayload(payload),
    raw: payload,
  };
}

function permissionOptionsFromPayload(payload: Record<string, unknown>): ZCodePermissionOption[] {
  return Array.isArray(payload.options) ? (payload.options as ZCodePermissionOption[]) : [];
}

function permissionResolvedPayloadToStreamEvents(
  taskId: string,
  traceId: TraceId,
  inputId: InputId | undefined,
  payload: Record<string, unknown>,
  toolNameById?: Map<string, string>,
): ZCodeStreamEvent[] {
  const toolCallId = stringValue(payload.toolCallId);
  const toolName =
    stringValue(payload.toolName) ?? (toolCallId ? toolNameById?.get(toolCallId) : undefined);
  const decision = stringValue(payload.decision);
  const requestId = stringValue(payload.requestId) ?? toolCallId ?? "unknown";

  if (isUserInputBackedPermissionToolName(toolName)) {
    return [
      {
        type: "elicitation_response",
        taskId,
        traceId,
        ...(inputId ? { inputId } : {}),
        requestId,
        action: decision === "deny" ? "decline" : "accept",
      },
    ];
  }

  const permissionResponse = {
    type: "permission_response",
    taskId,
    traceId,
    ...(inputId ? { inputId } : {}),
    requestId,
    optionId: decision ?? "allow",
    response: {
      decision: decision === "deny" ? "deny" : "allow",
    },
  } as Extract<ZCodeStreamEvent, { type: "permission_response" }>;

  if (decision !== "deny" || !toolCallId) {
    return [permissionResponse];
  }

  // Plan mode ç­‰è¿è¡Œæ—¶æ‹’ç»ä¼šå…ˆå‘ permission.resolvedï¼Œ
  // ä½†ä¸ä¸€å®šæœ‰å¯¹åº” tool.updated(error) å®žæ—¶äº‹ä»¶ï¼›åªæ¸…æƒé™è¯·æ±‚ä¼šè®©å·² started çš„å·¥å…·å¡ä¸€ç›´è½¬ã€‚
  return [
    permissionResponse,
    {
      type: "tool_call_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      toolId: toolCallId,
      parentToolUseId: parentToolUseIdFromToolPayload(payload),
      status: "failed",
      toolName,
      kind: toolName,
      title: toolName,
      error: stringValue(payload.reason) ?? "Permission denied",
      raw: payload,
    },
  ];
}

function mapSessionInfoLikePayload(
  taskId: string,
  traceId: TraceId,
  inputId: InputId | undefined,
  eventId: string | undefined,
  payload: Record<string, unknown>,
  backgroundTaskControlsByTaskKey?: Map<string, ZCodeBackgroundTaskControlItem[]>,
  cacheKey = taskId,
): ZCodeStreamEvent[] {
  const events: ZCodeStreamEvent[] = [];
  // event.taskId æ˜¯å¯¹å¤– session idï¼›å†…éƒ¨ cache å¿…é¡»æ²¿ç”¨ workspace-aware taskKeyï¼Œ
  // å¦åˆ™ replayable snapshot seed å’ŒåŽç»­ live update ä¼šåˆ†è£‚æˆä¸¤ä»½ background job çŠ¶æ€ã€‚
  const backgroundTaskControlCacheKey = cacheKey;
  const tokenUsageDelta = taskTokenUsageDeltaFromPayload(
    taskId,
    traceId,
    inputId,
    eventId,
    payload,
  );
  if (tokenUsageDelta) {
    events.push(tokenUsageDelta);
  }
  const networkDebugStatus = zcodeTaskNetworkDebugStatusFromPayload({
    taskId,
    traceId,
    ...(inputId ? { inputId } : {}),
    ...(eventId ? { eventId } : {}),
    payload,
  });
  if (networkDebugStatus) {
    events.push(networkDebugStatus);
  }
  const contextUsage = contextUsageFromPayload(payload);
  if (contextUsage) {
    events.push({
      type: "usage_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      used: contextUsage.used,
      size: contextUsage.size,
      cost: contextUsage.cost ?? null,
      ...(contextUsage.cache ? { cache: contextUsage.cache } : {}),
      ...(contextUsage.breakdown ? { breakdown: contextUsage.breakdown } : {}),
    });
  }
  const title = stringValue(payload.title);
  if (title) {
    events.push({
      type: "session_info_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      title,
    });
  }
  const apiRetry = apiRetryFromSessionInfoPayload(payload);
  if (apiRetry !== undefined) {
    events.push({
      type: "session_info_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      apiRetry,
    });
  }
  if ("target" in payload && ("action" in payload || "source" in payload)) {
    events.push({
      type: "session_info_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      target: {
        action: stringValue(payload.action) === "cleared" ? "cleared" : "set",
        source: stringValue(payload.source) === "tool" ? "tool" : "runtime",
        target: payload.target ? fromZCodeGoal(payload.target as never) : null,
        previousTarget: payload.previousTarget
          ? fromZCodeGoal(payload.previousTarget as never)
          : undefined,
      },
    });
  }
  const projection = asRecord(payload.projection);
  if (Array.isArray(projection.backgroundJobs)) {
    const jobs = parseZCodeBackgroundTaskControlItems(projection.backgroundJobs);
    setTaskBackgroundTaskControlCache(
      backgroundTaskControlsByTaskKey,
      backgroundTaskControlCacheKey,
      jobs,
    );
    events.push({
      type: "background_bash_jobs_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      jobs,
    });
  }
  const backgroundJobUpdate = updateTaskBackgroundTaskControlCacheFromPayload(
    backgroundTaskControlsByTaskKey,
    backgroundTaskControlCacheKey,
    payload,
  );
  if (backgroundJobUpdate) {
    events.push({
      type: "background_bash_jobs_update",
      taskId,
      traceId,
      ...(inputId ? { inputId } : {}),
      jobs: backgroundJobUpdate,
    });
  }
  return events;
}

function taskTokenUsageDeltaFromPayload(
  taskId: string,
  traceId: TraceId,
  inputId: InputId | undefined,
  eventId: string | undefined,
  payload: Record<string, unknown>,
): Extract<ZCodeStreamEvent, { type: "task_token_usage_delta" }> | null {
  if (!isModelCompleteUsagePayload(payload)) {
    return null;
  }
  const usage = usageFromPayload(payload.usage);
  if (!usage || usage.totalTokens <= 0) {
    return null;
  }
  const querySource = stringValue(payload.querySource);
  const queryId = stringValue(payload.queryId);
  // ç´¯è®¡ Token è¦è·Ÿéšæ¯æ¬¡æ¨¡åž‹å®Œæˆå®žæ—¶æ›´æ–°ï¼Œè€Œä¸æ˜¯ç­‰ task_complete çš„æ•´è½®æ±‡æ€»ï¼›
  // eventId æ˜¯ protocol æµçš„ç¨³å®šå•äº‹ä»¶æ ‡è¯†ï¼Œç”¨å®ƒåŽ»é‡å¯é¿å…å‰åŽå° monitor é‡å¤è®°è´¦ã€‚
  const eventKey =
    eventId ??
    `${traceId}:${inputId ?? "no-input"}:${queryId ?? "no-query"}:${querySource ?? "unknown"}:${usage.inputTokens}:` +
      `${usage.outputTokens}:${usage.totalTokens}`;
  return {
    type: "task_token_usage_delta",
    taskId,
    traceId,
    ...(inputId ? { inputId } : {}),
    ...(queryId ? { queryId } : {}),
    eventKey,
    ...(eventId ? { eventId } : {}),
    ...(querySource ? { querySource } : {}),
    usage,
  };
}

function isModelCompleteUsagePayload(payload: Record<string, unknown>): boolean {
  if (!("usage" in payload)) {
    return false;
  }
  return (
    stringValue(payload.stopReason) !== undefined ||
    "contextWindow" in payload ||
    stringValue(payload.querySource) !== undefined
  );
}

function apiRetryFromSessionInfoPayload(
  payload: Record<string, unknown>,
): ZCodeApiRetryStatus | null | undefined {
  if ("apiRetry" in payload) {
    return normalizeZCodeApiRetryStatus(payload.apiRetry);
  }

  const runtimeRetry = normalizeZCodeApiRetryStatus(asRecord(payload.runtime).apiRetry);
  if (runtimeRetry !== undefined) {
    return runtimeRetry;
  }

  const metaRetry = normalizeZCodeApiRetryStatus(asRecord(asRecord(payload._meta).zcode).apiRetry);
  if (metaRetry !== undefined) {
    return metaRetry;
  }

  return (
    zcodeApiRetryFromStreamRecoveryPayload(payload) ??
    zcodeApiRetryFromModelNetworkStatusPayload(payload)
  );
}

function recordAgentModelNetworkTelemetry(event: ZCodeSessionEvent): void {
  const observation = agentModelNetworkObservationFromEvent(event);
  if (!observation) {
    return;
  }
  try {
    emitNetworkTelemetryObservation(observation);
  } catch (error) {
    // ä¿®å¤åŽŸå› ï¼šagent æ¨¡åž‹ç½‘ç»œé¥æµ‹å±žäºŽæ—è·¯æŒ‡æ ‡ï¼Œsink å¼‚å¸¸ä¸èƒ½å½±å“ä¸»ä¼šè¯æ¶ˆæ¯æµã€‚
    logger.warn(undefined, "ä¸ŠæŠ¥ agent æ¨¡åž‹ç½‘ç»œé¥æµ‹å¤±è´¥", error);
  }
}

function agentModelNetworkObservationFromEvent(
  event: ZCodeSessionEvent,
): NetworkObservation | null {
  const payload = asRecord(event.payload);
  const type = stringValue(payload.type);
  if (type !== "model_request_completed" && type !== "model_request_failed") {
    return null;
  }
  // ä¿®å¤åŽŸå› ï¼šretryable failed åªæ˜¯åŒä¸€æ¬¡é€»è¾‘è¯·æ±‚çš„ä¸­é—´ attemptï¼Œæœ€ç»ˆ completed/failed ä¼šå¸¦æ€» attemptã€‚
  // å¦‚æžœè¿™é‡Œä¹Ÿè®¡æ•°ï¼Œä¼šæŠŠæˆåŠŸçŽ‡ã€å¤±è´¥çŽ‡å’Œé‡è¯•çŽ‡åŒæ—¶æ”¾å¤§ã€‚
  if (type === "model_request_failed" && booleanValue(payload.retryable) === true) {
    return null;
  }

  const durationMs = Math.max(0, Math.round(numberValue(payload.durationMs) ?? 0));
  const statusCode = nonNegativeIntegerValue(payload.statusCode);
  const ok = type === "model_request_completed";
  return {
    transport: "http",
    interface: buildAgentModelNetworkInterface(payload),
    durationMs,
    ok,
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(ok ? {} : { errorKind: classifyAgentModelNetworkError(payload, statusCode) }),
    attempt: positiveIntegerValue(payload.attempt) ?? 1,
  };
}

function buildAgentModelNetworkInterface(payload: Record<string, unknown>): string {
  const providerKind = safeNetworkDimension(stringValue(payload.providerKind)) ?? "unknown";
  const transport = safeNetworkDimension(stringValue(payload.transport)) ?? "unknown";
  const base = normalizeAgentModelBaseUrl(stringValue(payload.baseURL));
  return `zcode_agent.model.${providerKind}.${transport}.${base}`;
}

function normalizeAgentModelBaseUrl(value: string | undefined): string {
  if (!value) {
    return "unknown";
  }
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/\/+$/u, "") || "/";
    const safePath = pathname.length > 80 ? `${pathname.slice(0, 80)}...` : pathname;
    return `${parsed.host}${safePath}`;
  } catch {
    return safeNetworkDimension(value, 120) ?? "unknown";
  }
}

function safeNetworkDimension(value: string | undefined, maxLength = 48): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const safe = trimmed.replace(/[?#[\]{}|\\^`"'<>\s]+/gu, "_");
  return safe.length > maxLength ? `${safe.slice(0, maxLength)}...` : safe;
}

function classifyAgentModelNetworkError(
  payload: Record<string, unknown>,
  statusCode: number | undefined,
): string {
  const reason = stringValue(payload.reason);
  switch (reason) {
    case "timeout":
    case "stream_idle_timeout":
      return "timeout";
    case "network_error":
    case "stale_connection":
      return "connection_reset";
    case "proxy_error":
      return "proxy_error";
    case "tls_error":
      return "tls_error";
    default:
      if (statusCode !== undefined && statusCode >= 500) {
        return "server_error";
      }
      if (statusCode !== undefined && statusCode >= 400) {
        return "client_error";
      }
      return "other";
  }
}

type ContextUsageUpdate = Pick<
  Extract<ZCodeStreamEvent, { type: "usage_update" }>,
  "used" | "size" | "cost" | "cache" | "breakdown"
>;

function contextUsageFromProjection(
  projection: ZCodeSessionStateSnapshot["projection"],
): ContextUsageUpdate | null {
  if (projection.contextWindow <= 0 || projection.contextUsed <= 0) {
    return null;
  }
  return {
    used: projection.contextUsed,
    size: projection.contextWindow,
    cost: null,
  };
}

function contextUsageFromRuntime(
  runtimeUsage: ZCodeSessionStateSnapshot["runtime"]["contextUsage"] | undefined,
): ContextUsageUpdate | null {
  if (!runtimeUsage || runtimeUsage.size <= 0 || runtimeUsage.used <= 0) {
    return null;
  }
  // session resume æ—¶ protocol projection å¯èƒ½è¿˜æ²¡é‡æ”¾ä¸»è½®æ¬¡ usageã€‚
  // runtime.contextUsage æ¥è‡ªæŒä¹…åŒ– assistant token è®°å½•ï¼Œåº”ä¼˜å…ˆç”¨äºŽæ¢å¤æ—§ task UIã€‚
  return {
    used: runtimeUsage.used,
    size: runtimeUsage.size,
    cost: runtimeUsage.cost ?? null,
    ...(runtimeUsage.cache ? { cache: runtimeUsage.cache } : {}),
    ...(runtimeUsage.breakdown ? { breakdown: runtimeUsage.breakdown } : {}),
  };
}

function contextUsageFromPayload(payload: Record<string, unknown>): ContextUsageUpdate | null {
  const projection = asRecord(payload.projection);
  const usage = asRecord(payload.usage);
  const size = numberValue(payload.contextWindow ?? projection.contextWindow);
  const explicitUsed = numberValue(payload.contextUsed ?? projection.contextUsed);
  const useModelUsageForContext = shouldUseModelUsageForContext(payload);
  const modelUsageUsed = useModelUsageForContext ? contextUsageTokensFromPayload(usage) : undefined;
  const used =
    modelUsageUsed ??
    // ä¸»è½®æ¬¡æ¨¡åž‹è¿”å›ž usage æ—¶å¿…é¡»ä»¥çœŸå®žç½‘ç»œ token ç»Ÿè®¡ä¸ºå‡†ï¼›
    // context window æ˜¯ input + output å…±äº«çª—å£ï¼Œä¸èƒ½å†åªç”¨ inputTokens æ¸²æŸ“ meterã€‚
    // projection.contextUsed æ˜¯ runtime ä¼°ç®—/æ¢å¤äº‹å®žæºï¼Œåªåœ¨ç¼ºå°‘ usage æ—¶å…œåº•ã€‚
    explicitUsed;
  if (size === undefined || size <= 0) {
    return null;
  }
  // ZCode Protocol çš„ session.updated é‡Œ contextUsed/contextWindow æ˜¯ projection äº‹å®žæºï¼›
  // æ—§ task stream åªè®¤è¯† usage_updateï¼Œadapter ä¸è½¬æ¢å°±ä¼šè®©å³ä¸‹è§’ context meter æ°¸è¿œæ‹¿ä¸åˆ°æ•°æ®ã€‚
  // used=0 åªè¡¨ç¤ºåˆå§‹åŒ–æˆ–å¼‚å¸¸å…œåº•ï¼Œä¸èƒ½æ¸²æŸ“æˆå¯ç”¨çš„ context meterã€‚
  if (used === undefined || used <= 0) {
    return null;
  }
  return {
    used,
    size,
    cost: null,
    ...(useModelUsageForContext ? optionalContextCacheUsageFromPayload(payload, usage) : {}),
    ...(useModelUsageForContext ? optionalContextUsageBreakdownFromPayload(payload) : {}),
  };
}

function optionalContextUsageBreakdownFromPayload(
  payload: Record<string, unknown>,
): Pick<ContextUsageUpdate, "breakdown"> {
  const parsed = zcodeContextUsageBreakdownSchema.safeParse(payload.contextUsageBreakdown);
  return parsed.success && parsed.data.length > 0 ? { breakdown: parsed.data } : {};
}

function contextUsageTokensFromPayload(usage: Record<string, unknown>): number | undefined {
  const inputTokens = positiveIntegerValue(usage.inputTokens ?? usage.input);
  if (inputTokens !== undefined) {
    // AI SDK v6 å·²æŠŠ Anthropic cache read/write å¹¶å…¥ inputTokensã€‚
    // adapter åªéœ€è¦åŠ  outputï¼›å†åŠ  cacheReadTokens ä¼šæŠŠè¾“å…¥æ  context meter ç®—å¤§ã€‚
    return inputTokens + (nonNegativeIntegerValue(usage.outputTokens ?? usage.output) ?? 0);
  }

  const totalTokens = positiveIntegerValue(usage.totalTokens ?? usage.total);
  if (totalTokens !== undefined) {
    return totalTokens;
  }

  const cacheTokens =
    (nonNegativeIntegerValue(usage.cachedReadTokens ?? usage.cacheReadTokens) ?? 0) +
    (nonNegativeIntegerValue(usage.cachedWriteTokens ?? usage.cacheWriteTokens) ?? 0);
  return cacheTokens > 0
    ? cacheTokens + (nonNegativeIntegerValue(usage.outputTokens ?? usage.output) ?? 0)
    : undefined;
}

function optionalContextCacheUsageFromPayload(
  payload: Record<string, unknown>,
  usage: Record<string, unknown>,
): Pick<ContextUsageUpdate, "cache"> {
  const cache = contextCacheUsageFromPayload(payload, usage);
  return cache ? { cache } : {};
}

function shouldUseModelUsageForContext(payload: Record<string, unknown>): boolean {
  const querySource = stringValue(payload.querySource);
  // åªæœ‰ä¸»ä¼šè¯æ¨¡åž‹è¯·æ±‚çš„ inputTokens æ‰ä»£è¡¨å½“å‰å¯è§ä¸Šä¸‹æ–‡ã€‚
  // æ ‡é¢˜ã€åŽ‹ç¼©ã€prompt enhance ç­‰ sidecar è¯·æ±‚å³ä½¿å¸¦ contextWindowï¼Œä¹Ÿä¸èƒ½è¦†ç›–è¾“å…¥æ  context meterã€‚
  return querySource === undefined || querySource === "main_turn";
}

function contextCacheUsageFromPayload(
  payload: Record<string, unknown>,
  usage: Record<string, unknown>,
): ContextUsageUpdate["cache"] {
  const aggregate = asRecord(payload.cacheHit);
  if (Object.keys(aggregate).length > 0) {
    const inputTokens = nonNegativeIntegerValue(aggregate.inputTokens) ?? 0;
    const cacheReadTokens = nonNegativeIntegerValue(aggregate.cacheReadTokens) ?? 0;
    const cacheWriteTokens = nonNegativeIntegerValue(aggregate.cacheWriteTokens) ?? 0;
    const latestHitRate = numberValue(aggregate.latestHitRate);
    const hitRate = numberValue(aggregate.hitRate);
    const hitRateRequestCount = nonNegativeIntegerValue(aggregate.hitRateRequestCount);
    const totalInputTokens = nonNegativeIntegerValue(aggregate.totalInputTokens);
    const totalCacheReadTokens = nonNegativeIntegerValue(aggregate.totalCacheReadTokens);
    const totalCacheWriteTokens = nonNegativeIntegerValue(aggregate.totalCacheWriteTokens);
    return {
      inputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      ...(latestHitRate !== undefined ? { latestHitRate: Math.max(0, latestHitRate) } : {}),
      ...(hitRateRequestCount !== undefined ? { hitRateRequestCount } : {}),
      ...(totalInputTokens !== undefined ? { totalInputTokens } : {}),
      ...(totalCacheReadTokens !== undefined ? { totalCacheReadTokens } : {}),
      ...(totalCacheWriteTokens !== undefined ? { totalCacheWriteTokens } : {}),
      hitRate: hitRate !== undefined ? Math.max(0, hitRate) : null,
    };
  }

  const hasCacheRead = "cachedReadTokens" in usage || "cacheReadTokens" in usage;
  const hasCacheWrite = "cachedWriteTokens" in usage || "cacheWriteTokens" in usage;
  const hasHitRate = "cacheHitRate" in usage || "hitRate" in usage;
  if (!hasCacheRead && !hasCacheWrite && !hasHitRate) {
    return undefined;
  }
  const inputTokens = nonNegativeIntegerValue(usage.inputTokens ?? usage.input) ?? 0;
  const cacheReadTokens =
    nonNegativeIntegerValue(usage.cachedReadTokens ?? usage.cacheReadTokens) ?? 0;
  const cacheWriteTokens =
    nonNegativeIntegerValue(usage.cachedWriteTokens ?? usage.cacheWriteTokens) ?? 0;
  const explicitHitRate = numberValue(usage.cacheHitRate ?? usage.hitRate);
  return {
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    latestHitRate:
      explicitHitRate !== undefined
        ? Math.max(0, explicitHitRate)
        : inputTokens > 0
          ? cacheReadTokens / inputTokens
          : null,
    // UI å±•ç¤ºçš„æ˜¯ agent/app åè®®è¿”å›žçš„å‘½ä¸­çŽ‡ï¼›provider æ²¡ç›´æŽ¥ç»™æ—¶ï¼Œ
    // åœ¨ adapter ä¾§æŒ‰ provider usage å½’ä¸€åŒ–ä¸€æ¬¡ï¼Œé¿å…å„ UI å…¥å£é‡å¤ç†è§£ token å­—æ®µã€‚
    hitRate:
      explicitHitRate !== undefined
        ? Math.max(0, explicitHitRate)
        : inputTokens > 0
          ? cacheReadTokens / inputTokens
          : null,
  };
}

function usageFromPayload(value: unknown): ZCodeUsage | undefined {
  const usage = asRecord(value);
  if (Object.keys(usage).length === 0) {
    return undefined;
  }
  const inputTokens = numberValue(usage.inputTokens ?? usage.input) ?? 0;
  const outputTokens = numberValue(usage.outputTokens ?? usage.output) ?? 0;
  const reasoningTokens = numberValue(usage.reasoningTokens ?? usage.reasoning);
  const cachedInputTokens = numberValue(usage.cachedReadTokens ?? usage.cacheReadTokens);
  const cachedWriteInputTokens = numberValue(usage.cachedWriteTokens ?? usage.cacheWriteTokens);
  const inputSideTokens =
    inputTokens > 0 ? inputTokens : (cachedInputTokens ?? 0) + (cachedWriteInputTokens ?? 0);
  const totalTokens =
    numberValue(usage.totalTokens ?? usage.total) ?? inputSideTokens + outputTokens;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cachedInputTokens,
    cachedWriteInputTokens,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isAskUserQuestionToolName(value: string | undefined): boolean {
  return value === ASK_USER_QUESTION_TOOL_NAME;
}

function isExitPlanModeToolName(value: string | undefined): boolean {
  return value === EXIT_PLAN_MODE_TOOL_NAME;
}

function isUserInputBackedPermissionToolName(value: string | undefined): boolean {
  return isAskUserQuestionToolName(value) || isExitPlanModeToolName(value);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonNegativeIntegerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function positiveIntegerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function timelineStatusValue(value: unknown): ZCodeTimelineStatus | undefined {
  return value === "started" ||
    value === "retrying" ||
    value === "skipped" ||
    value === "completed" ||
    value === "failed" ||
    value === "interrupted"
    ? value
    : undefined;
}

function timelineTriggerValue(value: unknown): ZCodeTimelineTrigger | undefined {
  return value === "manual" ||
    value === "auto" ||
    value === "reactive" ||
    value === "partial" ||
    value === "session_memory"
    ? value
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function turnSteerSourceValue(value: unknown): ZCodeTurnSteerSource | undefined {
  return value === "plan_approval_feedback" || value === "workflow_refine_feedback"
    ? value
    : undefined;
}

function turnSteerCommandKindValue(value: unknown): ZCodeTurnSteerCommandKind | undefined {
  return value === "sendGoalCommand" || value === "sendText" || value === "compact"
    ? value
    : undefined;
}
