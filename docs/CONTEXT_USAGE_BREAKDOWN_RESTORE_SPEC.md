# Context usage breakdown 冷恢复恢复规格（Context windows breakdown restore）

## 背景与问题

Composer 工具条的「Context windows」面板（`packages/ui/src/chat-input-toolbar/contextUsage.tsx`）
在 web / docker 部署上曾长期只显示「Today's balance」。经运行时取证（V4 snapshot 订阅探针 +
浏览器实测）确认：

- snapshot 的 `usage.contextWindow`（usedTokens / maxTokens / cache）在冷恢复与 live 两条路径上都正确到达 web UI；
- 唯独 `usage.breakdown`（System tools / Messages / Skills / … 的构成占比）只在 live `ModelComplete` 事件里存在；
- CLI 的 session event store 是 `InMemorySessionEventStore`（`apps/zcode-cli/packages/contracts/src/events/in-memory-session-event-store.ts`），
  CLI 进程重启后事件全部丢失；`transcript-hydration` 合成的 ModelComplete 是零用量占位，
  因此冷恢复永远拿不到 breakdown，面板只剩汇总条 + cache 命中率。

## 产品规则

1. 面板展示条件不变：`usage.contextWindow` 需 `used > 0 && size > 0`（`getRenderableTaskUsage`）。
2. breakdown 是**最后一次 main_turn 模型请求的本地估算构成**（`buildContextUsageSnapshot`，估算口径
   `zcode.estimateTokens.v1`）。冷恢复重建的必须是**当时持久化的事实**，禁止用当前运行时重新估算
   （`latestContextBuildResult` 在新进程里不存在，重新估算只能得到残缺结果），也禁止合成默认分母。
3. breakdown 候选必须与当前恢复出的 `used`（以及已知的 `contextWindow`）对齐才允许挂载——
   复用 `applyContextUsageBreakdown` 既有护栏，防止把旧分支 / sidecar / 压缩前的构成挂到当前 meter。
4. 事件候选（in-memory event store）仍然优先；仅当事件不可用（冷恢复）时才回落到持久化候选。

## 状态所有者与接口

- **写入侧（唯一所有者：core runtime）**：`step-finish` part 增加可选字段
  `contextUsage: { used, contextWindow?, breakdown[] }`，在持久化每个模型步骤收尾事实时一并写入
  （`turn-step-finish.ts`、`turn-stop.ts`）。仅 `querySource === "main_turn"` 且
  `result.contextUsageBreakdown` 非空时写入；error carrier（零用量）不写。
- **读取侧（bootstrap 协议层）**：`resolveSessionContextUsage` 在事件候选缺席时，从
  active 分支消息的 `step-finish` parts 里取**最新**一条 breakdown 候选
  （`latestContextUsageBreakdownFromParts`），经同一 `applyContextUsageBreakdown` 护栏合并。
  parts 候选不回填 `contextWindow`——恢复早期 runtime projection 的分母可能是 session 默认值
  （200000）而非 registry 真值，used 同源等值已是足够的对齐护栏；legacy snapshot 与
  V4 usage seed 两条路径自动同时受益。
- **V4 种子合并（product-projection.seedUsage）**：`touchedByEvent` 分支只保护**容量分母**
  不被恢复种子覆盖；种子携带的 `cache` / `breakdown` 请求事实与分母正交，按
  “事件已有则保留、否则用种子补回”合并，不得整键丢弃。
- **wire 契约（packages/shared）**：`zcodeMessagePartSchema` 的 `step-finish` 分支扩展上述可选字段；
  旧会话数据没有该字段，行为不变。

## 验收场景

1. **冷恢复（本次缺陷）**：完成若干 turn → 重启 CLI/容器 → 只读订阅该 session →
   V4 snapshot `usage.contextWindow.breakdown` 非空，面板出现完整 breakdown 行。
2. **live 行为不回归**：运行中的 turn 仍由 ModelComplete 事件提供 breakdown，事件候选优先。
3. **护栏**：part 里 breakdown 的 `used` 与当前恢复出的 `used` 不一致（例如 rewind/compact 后
   换了分支）时，不得挂载 breakdown。
4. **旧数据兼容**：没有 `contextUsage` 字段的 step-finish part 解析行为与升级前完全一致。
