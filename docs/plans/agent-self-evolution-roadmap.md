# 智能体自我进化 — 分步优化清单

与 `docs/plans/agent-capability-routing.md`、`docs/OPTIMIZATION-ROADMAP.md` 对齐：先契约与可观测，再记忆治理与闭环评估。按阶段顺序做，完成一项勾一项。

---

## 阶段 A — 记忆质量（低成本、立竿见影）

| # | 项 | 状态 | 说明 |
|---|----|------|------|
| A1 | 会话蒸馏时注入已有 LESSONS，并要求不重复追加 | [x] | `evolveFromSession` 提示词内带知识库摘要 + 「无新内容则 []」 |
| A2 | 知识库体积上限与尾部摘要策略 | [x] | 蒸馏侧尾部最多 6000 字（`EVOLVE_EXISTING_LESSONS_MAX_CHARS`）；会话注入若需单独限长可再改 orchestrator |
| A3 | 可选：定时/手动「整理 LESSONS」技能或 IPC | [x] | `consolidate_lessons_learned` 工具 + `ai-consolidate-lessons-learned` IPC；写回前备份 `memory/knowledge/.backups/` |

---

## 阶段 B — 与 Run / 工具失败对齐（智能体可归因）

| # | 项 | 状态 | 说明 |
|---|----|------|------|
| B1 | `evolve` 日志与 `runId`（若当次会话可取得）同记 | [x] | 主会话 `lastCompletedRunId` → `evolveFromSession`；IM 渠道 `triggerAutoEvolveFromSession` 传 `String(runId)`；蒸馏 prompt 与 `appLogger` 带 `runId` |
| B2 | 工具/MCP 统一 `error.code` 进入命令或工具摘要 | [x] | `execute_command` 失败写入 `command-execution-log` 的 `errorCode`（`execution-envelope.normalizeErrorCode`）；`getExecutionSummary` 增加 `byErrorCode`；`query_command_log` 的 summary 自动带出 |
| B3 | 蒸馏 prompt 引用「本会话工具失败摘要」 | [x] | `tool-outcome-summary.summarizeToolFailuresFromMessages` 解析 `role:tool` JSON；进化 prompt 注入「工具失败摘要」+ 命令 `error.code` 分布 |

---

## 阶段 C — 编排与交付（主/子 Agent）

| # | 项 | 状态 | 说明 |
|---|----|------|------|
| C1 | `sessions-spawn` 完成路径强制 `Execution Envelope` | [x] | `runSubChat` 成功/失败/超时路径均在返回体上附带 `envelope`（与 `buildExecutionEnvelope` 一致）；工具侧仍会用字段重算 envelope，行为对齐 |
| C2 | Feishu 等渠道投递与 envelope 对齐 | [x] | `extractLatestSessionsSpawnResult` 在 `envelope.success===false` 时优先摘要/错误码，避免用乐观 `result` 误导飞书/IM 最终文案 |
| C3 | Artifact Hub 单一真相源持续推进 | [x] | `artifacts.parent_run_id` 迁移；`ingestEnvelopeArtifacts` 统一消费 envelope 产物；`sessions_spawn` 成功/异常路径入库；聊天 base64 图带 `parentRunId` |

---

## 阶段 D — 评估与路由

| # | 项 | 状态 | 说明 |
|---|----|------|------|
| D1 | 简单离线指标：重复命令次数、同错误码重复率 | [x] | `command-execution-log/SUMMARY.md` 增加「失败 error.code 分布」「重复失败命令≥2」；`query_command_log` 描述指向该汇总 |
| D2 | Capability Router：启发式 → 可测决策日志 | [x] | `resolveCapabilityRoute(..., appLogger)` 输出 `[CapabilityRoute]` 结构化字段（capability、executionMode、deliveryPolicy、riskLevel、textPreview 等） |
| D3 | 可选：小模型/分类路由复杂意图 | [x] | 先做启发式多信号：`computeCapabilitySignals` + `[CapabilityRoute].capabilitySignals`（与主 `capability` 对照，供后续分类器/小模型训练）；真正 LLM 路由按需再加 |

---

## 阶段 E — 长程与策略（可选增强）

| # | 项 | 状态 | 说明 |
|---|----|------|------|
| E1 | 项目级持久任务清单（跨会话） | [x] | 系统提示引导多步任务写入项目 **AGENT.md**（轻量约定，非强制落盘工具） |
| E2 | 高风险/用户否决后的策略教训通道 | [x] | 系统提示引导 **lesson_save** 使用 category **`策略`** 记录禁止项与适用范围 |

---

## 建议执行顺序

1. **A1 → A2**（记忆侧，改动面小）  
2. **B1 → B2 → B3**（与现有 `runId`、错误分类路线衔接）  
3. **C1 → C2**（与 P0 编排一致）  
4. **D1**（验证进化是否减少重复失败）  
5. **A3、D2、E\*** 按产品与带宽排期  

---

## 更新方式

完成某项后，将表格中对应 `[ ]` 改为 `[x]`，并在提交说明或 PR 中引用本文件章节号（如「完成 A1」）。
