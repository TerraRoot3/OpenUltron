# 智能体认知层架构 — 盘点、计划与优先级

本文档把「角色 / 记忆 / 上下文 / 压缩 / 总结 / 学习 / 反馈 / 验证」及架构、模块、扩展性、冗余、消息贯穿、Hook 等维度**系统化记录**，并给出**可执行的优先级与切片**。与下列文档对齐阅读：

- `docs/OPTIMIZATION-ROADMAP.md` — 工程与产品级 P0–P3 总览  
- `docs/plans/agent-self-evolution-roadmap.md` — 记忆治理与进化闭环（A–E 阶段）  
- `docs/plans/agent-capability-routing.md` — 能力与投递路由  
- `docs/MAIN-PROCESS-MODULARIZATION.md` — 主进程模块化与 IPC 边界  

---

## 一、分维度盘点

### 1. 角色（Role）

| 现状 | 主要落点 |
|------|----------|
| 身份与偏好由多段拼装 | `electron/ai/orchestrator.js`（`memParts`：`MEMORY.md`、`SOUL`、`IDENTITY`、lessons 等） |
| 前端再拼一层 | `src/components/ai/ChatPanel.vue`（`buildSystemPrompt`：技能列表、`AGENT.md`、`/` 技能等） |
| 措辞与安全 | `electron/ai/identity-wording.js` |

**优化方向**  
- 建立**单一「角色快照」构建入口**（建议主进程）：输入 `{ projectPath, channel, flags }`，输出有序、限长的 system 块列表；Vue 层仅展示相关 UI 文案，**避免规则双写**。  
- 分层：`static persona`（长期） / `session overlay` / `channel overlay`（飞书/TG 差异），便于测试与 A/B。

---

### 2. 记忆（Memory）

| 现状 | 说明 |
|------|------|
| 碎片记忆 | `electron/ai/memory-store.js`、`memory_*` 工具、编排层**自动提取**（已节流，见 `orchestrator.js` `_shouldRunAutoMemoryExtract`） |
| 经验教训 | `lesson_save`、`evolve-from-session`（`ai-history-ipc.js`）、`consolidate_lessons_learned` |
| 文件型偏好 | 各类 `*.md`（全局/项目） |

**优化方向**  
- **语义路由**：在编排或轻量规则层区分「事实偏好 → memory_save」「可复用踩坑 → lesson_save」，减少模型误选。  
- **去重与合并**：向量/关键词合并或按体积/时间触发 consolidate；蒸馏侧已有「勿重复 lessons」，可扩展到碎片记忆侧策略。  
- **可观测**：写入统一带 `source`、`runId`、`channel`（evolve/runId 已部分对齐，可扩展到 `memory_save`/自动提取日志）。

---

### 3. 上下文（Context）与消息贯穿

| 现状 | 说明 |
|------|------|
| 主路径 | IPC → `Orchestrator.startChat` → 工具循环 → `ai-chat-complete` |
| 渠道 | `chat.message.received` → IM pipeline → 落盘 → `chat.session.completed` → `channels-session-completed-send.js` |
| 消息扩展字段 | `_hideInUI`、`_uiKey`、工具 JSON 内 `envelope` 等 |

**优化方向**  
- **内部 Message 契约**：JSDoc typedef 或短规范文档（role、content、tool_calls、可选 `meta` / `envelope` / UI 字段），新字段进 `meta` 优于顶层泛滥。  
- **清洗与解析单点化**：继续把「最终 assistant 文本」「sessions_spawn 解析」收拢到 `inbound-message-text` 等模块，避免 Gateway 与 IM 各写一套分支。  
- **EventBus**：`electron/core/events.js` 中 `emit` 与异步 handler 的语义已注释；若引入多 listener 的「上下文 hook」，优先 **`emitAsync` + 有序中间件** 或显式 pipeline。

---

### 4. 压缩（Compression）

| 现状 | `electron/ai/context-compressor.js` |
|------|-------------------------------------|
| 阈值、cooldown、`minCompressSavingsTokens`、OpenRouter 软预算 | 已较成熟 |
| 压缩前记忆刷新 | `flushMemoryBeforeCompress`，默认关闭（编排未接 executeTool 时收益有限） |

**优化方向**  
- 文档化 **「压缩摘要」vs `ChatPanel` 会话延续 `carrySummaryForNextSession`** 的适用场景，避免产品/实现混淆。  
- 可选：压缩批次打 `compression_id` 日志，供事后抽样评估「是否丢关键信息」。

---

### 5. 总结（Summary）

| 类型 | 位置/触发 |
|------|-----------|
| 压缩摘要 | 压缩逻辑写入 system 前缀 `[对话摘要…]` |
| 新会话延续 | `ChatPanel.vue` `carrySummaryForNextSession` |
| 列表/历史摘要 | 对话列表、渠道 `/history` 等 |

**优化方向**  
- 日志与配置统一前缀或枚举：`summary_kind: compress | session_handoff | conversation_list`。  
- 多类「短摘要」若需降本，可统一走小模型/低 `max_tokens`（与 `generateText` 可选参数策略对齐）。

---

### 6. 学习（Learning）与进化

| 现状 | `docs/plans/agent-self-evolution-roadmap.md` A–E 与代码（evolve、tool-outcome-summary、execution-envelope）已对齐 |

**优化方向**  
- 触发策略除时间/条数外，增加 **高价值信号**（如同 `error.code` 连续失败、用户明确「记下来」）再蒸馏或提示 `lesson_save`。  
- 与 skills 闭环：`install_skill` 写回率可通过工具成功路径日志度量。

---

### 7. 反馈（Feedback）

| 现状 | `user_confirmation`、渠道发送失败重试与飞书兜底 |

**优化方向**  
- 可选：隐式反馈事件（重试、截断、点赞/点踩）进本地日志或匿名统计，支撑质量迭代。  
- 「用户拒绝确认」结构化进入策略类 `lesson_save`（与 roadmap E2 一致）。

---

### 8. 验证（Validation）

| 层级 | 现状 |
|------|------|
| 配置/模型 | `ai-verify-model-ipc.js` |
| 运行时 | 编排循环检测、工具 `non_retryable`、`execution-envelope` |
| 渠道 | 出站 `send` 重试 |

**优化方向**  
- 文档化验证分层：L1 配置可用 → L2 单轮工具契约 → L3 多轮不循环 → L4 渠道投递。  
- 主会话与子 Agent **统一 envelope 字段集**（`subagent-dispatch` 已挂 envelope，保持单一真相）。

---

## 二、项目架构与模块划分

**优势**  
- `electron/main-process/ai-core-stack-bootstrap.js` 集中装配 Orchestrator、MCP、Gateway、IM、history IPC、skills runtime；扩展点 `executor-registry`、`hardware-registry`、`chatChannelRegistry` 清晰。  
- 会话存储、命令日志、Artifact 与编排逐步解耦。

**优化方向**  
- **拆分 bootstrap**：按域拆为多个 `registerXxx(deps)` 小文件，bootstrap 仅负责依赖汇总与注册顺序。  
- **数据流总览**：补一页「主会话 vs IM vs Gateway」序列图或步骤表（可放在本文档附录或 `MAIN-PROCESS-MODULARIZATION.md` 链出）。

---

## 三、冗余逻辑与收敛点

| 区域 | 说明 | 建议 |
|------|------|------|
| 技能说明 | `ChatPanel` 大段规则 + `orchestrator` `getSkillsForPrompt` 注入 | 收敛到单一构建函数 |
| 预加载/API | `browserPolyfill.js` vs `preload.js` IPC 封装差异 | 统一契约，薄封装 |
| 记忆写入 | 自动提取、压缩前 flush（默认关）、工具保存、evolve | 产品优先级说明 + 共用节流/去重工具函数 |

---

## 四、扩展性：消息、Skills、Context / Skills Hook

| 主题 | 现状 | 目标形态 |
|------|------|----------|
| 消息扩展 |  ad-hoc 字段 | 契约化 `meta` + 文档 |
| Skills | 磁盘 `SKILL.md` + 索引 + `get_skill` | 保持；若需「代码型插件」，再引入生命周期 |
| Context Hook | 仅 `CoreEvent` 四种 | 扩展事件名或 `emitAsync` + 中间件：`buildMessages = hooks.reduce(...)` |

**Event 类型参考**（`electron/core/events.js`）：`chat.message.received`、`chat.session.completed`、`chat.session.error`、`chat.typing`。新增前需评估与 `emit`/`emitAsync` 语义。

---

## 五、补充维度（易遗漏）

1. **成本与配额**：多通道 + 后台蒸馏/自动提取并发时的 token/请求预算（全局队列或按 `projectPath` 限流）。  
2. **隐私与合规**：命令、路径、IM 内容落盘与红脱敏清单（已有 `redactSensitiveText` 等，可成表）。  
3. **多 workspace 策略**：`projectPath` 为轴；若存在「全局覆盖项目」需显式优先级。  
4. **可测试性**：编排中抽出纯函数（是否压缩、capability 路由输入输出）扩展现有 Vitest 覆盖。  
5. **统一降级**：API 超时、无 tools、MCP 不可用时的单一降级路径，避免各处重复 catch。

---

## 六、完整执行计划与优先级

以下优先级与 `OPTIMIZATION-ROADMAP.md` 的 P0–P3 **并行存在**：本节侧重**认知层与上下文管线**；工程拆 main、沙箱等仍以总路线图为准。

### P0 — 高优先级（减少漂移与不可维护性）

| ID | 项 | 产出/验收 |
|----|----|-----------|
| C0-1 | **System prompt / 角色块单一构建源** | 主进程函数 + ChatPanel 改为调用或消费同构结果；技能规则只维护一处 |
| C0-2 | **内部 Message 契约文档 + 推荐字段** | `docs/` 短文或 JSDoc；新扩展优先 `meta` |
| C0-3 | **EventBus 异步语义决策** | 文档明确；新 hook 必须用 `emitAsync` 或 pipeline，避免依赖 `emit` 的 Promise 边角 |

### P1 — 中优先级（质量与可观测）

| ID | 项 | 产出/验收 |
|----|----|-----------|
| C1-1 | 记忆写入 **source/runId/channel** 字段在日志与落盘上对齐 | 便于排查「这条从哪来」 |
| C1-2 | **压缩摘要 vs 会话延续摘要** 产品/开发说明 | 写入本文档或用户向 FAQ |
| C1-3 | **summary_kind / 日志前缀** 统一 | 排查时一眼区分摘要类型 |
| C1-4 | 轻量 **记忆路由提示**（事实 vs lesson） | 编排层注释或薄启发式，减少误用工具 |

### P2 — 中低优先级（架构与健康度）

| ID | 项 | 产出/验收 |
|----|----|-----------|
| C2-1 | **ai-core-stack-bootstrap 分文件 register* ** | 单文件行数下降、依赖显式 |
| C2-2 | **数据流一页**（主会话 / IM / Gateway） | 序列图或步骤表链入本文档 |
| C2-3 | **browserPolyfill 与 preload 契约对齐** | 减少双实现差异 |
| C2-4 | evolve/蒸馏 **高价值信号触发** 设计（可选实现） | 设计文档 + 小步 PR |

### P3 — 长期 / 可选

| ID | 项 | 说明 |
|----|----|------|
| C3-1 | 隐式反馈与质量指标 | 本地聚合，隐私可控 |
| C3-2 | 压缩质量抽样（compression_id） | 离线评估用 |
| C3-3 | 正式 **context.before_llm / session.after_turn** 插件协议 | 在 EventBus 或中间件层落地 |
| C3-4 | 全局成本与限流 | 与供应商账号策略联动 |

---

## 七、建议实施顺序（跨 P0–P2）

1. **C0-2**（契约）→ **C0-1**（单源 prompt）→ **C0-3**（事件语义），三者降低后续改动风险。  
2. 并行：**C1-2**、**C1-3**（文档与日志，低成本）。  
3. **C1-1**、**C1-4**（记忆可观测与路由）。  
4. **C2-1**–**C2-3**（工程卫生）。  
5. **C2-4**、**C3-*** 按带宽与数据需求排期。

---

## 八、更新方式

- 完成某项：在本文件对应表格行追加「✅ 完成日期 + PR/提交说明」。  
- 大方向变更：先改本节与关联 `docs/plans/*`，再在一行内同步 `docs/OPTIMIZATION-ROADMAP.md` 的引用。  
- 与自我进化路线重叠的条目（记忆、evolve、envelope）：以 `agent-self-evolution-roadmap.md` 为执行清单，**本文档作为架构总览与优先级索引**。

---

## 九、分阶段落地（文档 → 实现）与状态

**消息契约（C0-2）** 正文：**`docs/MESSAGE-CONTRACT.md`**。

| 阶段 | 内容 | 验收 | 状态 |
|------|------|------|------|
| **M1** | `src/shared/prompt/renderer-system-supplement.js`：`ChatPanel` 组装入参；**M5 后**该文件仅透传 `parentSystemPrompt` | 与 M5 衔接 | ✅ 已落地 |
| **M2** | `docs/MESSAGE-CONTRACT.md` + `events.js` 注释与本文互链 | 新扩展字段约定明确 | ✅ 已落地 |
| **M3** | 记忆可观测：`memory_save` / `lesson_save` 成功时结构化日志（`runId`、`channel`、`projectPath` 摘要）；自动碎片提取成功时带 `runId`；`memory_save` 工具落盘 `source: manual` | `appLogger` 可检索 `[AI][Memory]` | ✅ 已落地 |
| **M4** | 编排层 **记忆工具选用** 短提示（`memory_save` vs `lesson_save`） | 注入于 `orchestrator` memParts | ✅ 已落地 |
| **M5** | 主进程注入 **当前日期**、**技能后续+git 规则**、**项目 `.gitManager/AGENT.md`**；渲染端 supplement 缩为仅 `parentSystemPrompt` | token 下降；主会话/飞书/网关共用 orchestrator | ✅ 已落地 |
| **M6** | `ai-core-register-late-tools.js` 承载 sessions_spawn / consolidate / list / verify / stop 等注册 | bootstrap 行数减少 | ✅ 已落地 |
| **M7** | `chat.session.completed` 与 `chat.message.received` 使用 **`emitAsync` + await**（IM pipeline、Gateway 飞书回发、三渠道 adapter） | 多 handler 时全部执行完毕 | ✅ 已落地 |
| **M8** | 循环检测注入消息同时写 **`meta.hideInUI`**；列表过滤识别 `meta.hideInUI`（保留 `_hideInUI` 兼容） | 与 `MESSAGE-CONTRACT` 一致 | ✅ 已落地 |

**说明**：M1 曾将大段规则放入 `src/shared`；**M5** 起以 **orchestrator memParts 为唯一正文来源**，shared 仅透传父级 `systemPrompt`。进一步删掉 memParts 与 `prompts/*.md` 的语义重叠属后续优化（非 M5 范围）。
