# 主–子 Agent 编排方案

## 0. 定位：一种可选范式，不是「唯一最优」

**没有**放之四海皆准的最优编排。**任务类型、延迟预算、失败代价、合规与观测要求**不同，最佳结构也不同。本文前半部分描述的是 OpenUltron 上 **一种偏产品化的默认路径**（强约束「**对用户只保留一个承诺面**」），便于与 envelope、IM 渠道、审计对齐；**不等于**在学术或工程上优于所有其他范式。

下文 **§2.1–§2.2** 仍保留 OpenClaw / Claude Code 与 OpenUltron 的**概念对照**；**Claude Code / OpenClaw 的实现细节**见独立文档 [`claude-code-openclaw-orchestration-internals.md`](../claude-code-openclaw-orchestration-internals.md)。**§2a** 列出 **其他编排范式**；**§2b** 中 **§2b.1** 为本仓库实现，**§2b.2** 指向上游专文。若数据证明「主合成一轮」成本或延迟不可接受，应 **回退或并行试验** 其他模式（见 §2a 末尾）。

**全文主干**描述的是「**主 Agent 分发 → 子 Agent 执行 → 主 Agent 汇总 → 触达用户**」这一 **候选** 目标架构，并映射到 OpenUltron 现有能力（`orchestrator`、`sessions_spawn`、execution envelope、渠道管线）；**不**排斥在同一产品中为不同入口或配置采用 §2a 中的其它结构。

关联文档：

- [`MESSAGE-CONTRACT.md`](../MESSAGE-CONTRACT.md)（消息与 envelope）
- [`agent-capability-routing.md`](./agent-capability-routing.md)（能力路由与交付）
- [`agent-cognitive-architecture-plan.md`](./agent-cognitive-architecture-plan.md)（认知层总计划）
- [`agent-orchestration-redesign.md`](./agent-orchestration-redesign.md)（**对比 Claude Code / OpenClaw 后的 OpenUltron 重设计与 P0–P2**）

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| **单一用户承诺面** | 用户看到的最终说明、成功/失败、附件列表，**只由主 Agent 会话**对外给出；避免多段 raw 子输出直接拼接给用户。 |
| **执行隔离** | 子 Agent 在独立会话/上下文中长链路执行，避免主会话被探索性命令、中间噪声塞满。 |
| **可验证交付** | 子任务结果优先走 **结构化 envelope**（成功、错误码、产物、摘要），主 Agent 做 **校验与叙事**，而非仅信自然语言。 |
| **可观测与限深** | 委派深度、并行度、超时可在运行时配置并记录（对齐 OpenClaw 的 depth / 隔离会话思路）。 |

**非目标（本阶段不强行做）**：分布式跨机调度、与主产品无关的通用工作流引擎。

---

## 2. 行业参考（抽象模式，非逐 API 对齐）

### 2a. 其他编排范式与参考（不必采用「主必汇总」）

下列均为业界常见抽象，**可与「主→子→主→用户」并存或替代**，按场景选用。

| 范式 | 核心思想 | 适用 | 代价/风险 |
|------|-----------|------|-----------|
| **单 Agent + 强工具** | 不分叉会话，靠工具/MCP/脚本完成副作用 | 简单自动化、低延迟、调试路径短 | 上下文易被长轨迹污染；复杂任务易触顶 |
| **流水线（Pipeline）** | A→B→C 固定阶段，每阶段专用 prompt/工具 | 编译、发布、评测等阶段清晰任务 | 不灵活；上游错会级联 |
| **对等 / 移交（Peer / Handoff）** | 无唯一「主」；Agent 间互相移交会话或共享 channel | 客服转专家、多角色接力 | 用户侧易出现多风格；需统一审计策略 |
| **生成–批评（Generator–Critic）** | 一实例产出、另一实例只审阅/打分/拒稿 | 质量敏感写作、安全策略 | 两轮模型调用；可能来回迭代 |
| **黑板 / 共享事实（Blackboard）** | 多工作者往共享结构写状态，调度器或规则决定下一步 | 研究、多源信息聚合 | 需强 schema；否则难调试 |
| **图/状态机编排** | 显式节点、边、条件（如 LangGraph、Temporal + LLM） | 复杂分支、可回放、企业集成 | 工程量大；过度设计小任务 |
| **角色班组（Crew / Debate）** | 多角色并行提方案再合并（CrewAI、多 Agent 辩论类 demo） | 头脑风暴、方案对比 | 合并策略难；易冗长 |
| **人在回路（HITL）** | 关键步骤必须人工批准再继续 | 高危操作、合规发布 | 实时性差 |

**开源 / 产品参考（补充 OpenClaw、Claude Code）**（仅作范式线索，版本以各项目为准）：

- **LangGraph / LangChain**：图结构、检查点、人机节点——适合「可回放工作流」而非单一主会话叙事。  
- **Microsoft AutoGen / AgentChat**：多 Agent 对话与群聊模式——**不一定**有单一汇总者。  
- **CrewAI**：角色 + 任务 DAG——强调分工与顺序，汇总方式可配置。  
- **SWE-bench / 各类 coding agent**：常见模式是 **单循环 + 工具** 或 **计划→执行→测试** 短流水线，未必引入独立子会话。  
- **企业 RAG / copilot**：往往 **单会话 + 检索/工具**，子 Agent 仅在高阶场景出现。

**何时「主必汇总」可能不是最优？**

- **极低延迟**（秒级回复）：多一轮主合成可能不可接受，可改为 **结构化子输出直出 + 模板包装**（仍由程序校验 envelope，而非再跑一轮大模型）。  
- **子任务输出已用户可读且已带 envelope**：可增加开关 **「信任子摘要直出」**（与强主汇总互斥，需产品明确风险）。  
- **审查类任务**：更适合 **Critic** 或 **双人对抗**，而非同一主 Agent 既派活又当唯一作者。

**OpenUltron 建议**：把本文 §3 的「硬规则」视为 **默认产品策略**；长期保留 **配置位**（例如：仅 IM 强制主汇总、桌面会话允许子摘要直通、或低延迟路径走程序拼装）。

### 2b. 实现机制：各系统「如何实现」（工程视角）

下面说明 **落地时具体机制**（进程/会话/API/数据结构），避免只有抽象形容词。外部项目以 **公开文档与常见开源形态** 归纳，细节随版本会变，以各仓库为准。

#### 2b.1 OpenUltron（本仓库，可对照阅读代码）

| 环节 | 实现要点 |
|------|-----------|
| **触发** | 主会话中模型发起 **工具调用** `sessions_spawn`（定义在 `electron/ai/tools/sessions-spawn.js`）。 |
| **派发入口** | `createSessionsSpawnTool(runSubChat)`：`runSubChat` 由 `createSubagentDispatch`（`electron/main-process/subagent-dispatch.js`）注入。 |
| **子会话 ID** | `runSubChat` 内生成 **`sub-${Date.now()}-${随机}`**，与主会话 `sessionId` 完全隔离。 |
| **internal 路径** | `runByInternalSubAgent` 组装 `messages`（system 含 `buildSubAgentDeliveryPrompt`：禁止直接发 IM、要求最终自然语言说明等），调用 **`aiOrchestrator.startChat({ sessionId: subSessionId, tools: getToolsForSubChat(...) })`**，即与主会话 **同一套 Orchestrator 循环**（多轮 tool），但 **工具列表裁剪**（子会话工具集可少于主会话）。 |
| **external 路径** | `runByExternalSubAgent` 将任务拼成 **单条大 prompt**，`runCliCommand` 调 **外部可执行文件**（如 Codex CLI），从 **stdout/stderr** 收结果；可多条 `runArgBuilders` / 环境变体重试。 |
| **回传到主会话** | 工具 `execute` **return** 的 JSON（`success`、`message`、`envelope`、`result`、`sub_session_id`…）由编排器写入 **主会话消息列表** 中对应 **tool** 消息；主会话 **下一轮**模型请求会带上该 tool 结果。 |
| **Envelope** | `buildExecutionEnvelope`（`electron/ai/execution-envelope.js`）统一结构化；`ingestEnvelopeArtifacts` 可把产物登记进 artifact 体系。 |
| **递归限制** | `context.sessionId` 以 `sub-` 开头时 **拒绝再次** `sessions_spawn`（代码内显式判断）。 |
| **IM 渠道** | 飞书等入站走 `im-channel-message-pipeline.js`：`aiGateway.runChat` 完成后再 **从消息 delta 抽 assistant 文本**、与子 spawn 摘要合并规则、`resolveDeterministicOutboundText` 等——与「主会话为出口」强相关。 |

**一句话**：OpenUltron 的子 Agent = **第二次 `startChat`（新 sessionId）或外部 CLI**，结果 = **主会话里一条 tool 结果 JSON**，主模型再读它继续说话。

#### 2b.2 Claude Code 与 OpenClaw（上游产品，非 OpenUltron 实现）

二者在公开文档中的**具体机制**（会话键、`sessions_spawn` / `Agent` 工具、Announce 回灌、嵌套深度、并发 lane、子 Agent 工具策略等）已**单独成文**，避免与本仓库混在一节里写不全：

- **[`docs/claude-code-openclaw-orchestration-internals.md`](../claude-code-openclaw-orchestration-internals.md)**

#### 2b.3 LangGraph（LangChain 生态）

| 环节 | 实现要点 |
|------|-----------|
| **核心抽象** | `StateGraph`：**状态类型（TypedDict 等）** + **节点函数** + **边（含条件边）**；`compile()` 得到可执行对象。 |
| **节点里做什么** | 每个节点是普通函数：可调用 **一次 LLM**、**工具**、或 **纯代码**；多轮对话被拆成 **多节点或多轮同一节点**。 |
| **持久与回放** | 可选 **checkpointer**：把状态存 SQLite/Redis 等，支持 **人机中断后续跑**。 |
| **与 OpenUltron Orchestrator 差异** | OpenUltron 是 **while 循环 + 工具** 的单会话编排；LangGraph 是 **显式图 + 状态机**，更适合 **分支、审批、可回放流程**。 |

#### 2b.4 CrewAI

| 环节 | 实现要点 |
|------|-----------|
| **核心抽象** | `Agent`（角色+工具+LLM）+ `Task`（描述+期望输出）+ `Crew`（`kickoff()`）。 |
| **进程** | `Process.sequential`：任务链式执行；`hierarchical`：**经理 Agent** 拆任务再分派。 |
| **结果** | 前一任务输出可作为下一任务 `context`，最终 `crew.kickoff()` 聚合。 |

#### 2b.5 Microsoft AutoGen / AgentChat（概念级）

| 环节 | 实现要点 |
|------|-----------|
| **核心抽象** | 多个 **可对话 Agent** + **聊天模式**（如群聊、轮流发言、自定义 speaker selection）。 |
| **实现** | 每条消息是 **带 sender 的结构化消息**；路由层决定 **下一个谁说话**，**不一定**有「父汇总」节点。 |

#### 2b.6「单 Agent + 强工具」（无子会话）

| 环节 | 实现要点 |
|------|-----------|
| **机制** | **仅一个** `sessionId` + **一个** `startChat` 循环；不调用 `sessions_spawn`。 |
| **副作用** | 全靠 **MCP / execute_command / file_operation** 等工具在同一上下文里完成。 |
| **在 OpenUltron** | 即默认 `orchestrator` 路径；适合简单问答与短自动化。 |

---

### 2.1 OpenClaw（多 Agent / Sub-agents）

公开材料中的共性（见 [OpenClaw Sub-agents 文档](https://docs.openclaw.ai/tools/subagents) 等）：**父子会话隔离**、**并行 fan-out**、**深度/孤儿护栏**、**结果回父会话**。**工程上如何实现**见 **[`claude-code-openclaw-orchestration-internals.md`](../claude-code-openclaw-orchestration-internals.md) §2**。

**可借鉴到 OpenUltron**：显式 **最大委派深度**、**并行子任务上限**、子会话 ID 可追踪；结果 **默认回主会话 tool 消息**，由主 Agent 下一轮消化（与 §2b.1 一致）。

### 2.2 Claude Code（Subagents / Agent SDK）

Anthropic 侧共性（见 [Claude Code Subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents) 等）：**子上下文隔离**、**按代理配置工具子集**、**主会话协调委派**。**工程上如何实现**见 **[`claude-code-openclaw-orchestration-internals.md`](../claude-code-openclaw-orchestration-internals.md) §1**。

**可借鉴到 OpenUltron**：`sessions_spawn` 的 `system_prompt` / `provider` / `model` 已支持差异化；进一步 **文档化「子 Agent 工具集」** 与主会话的差异（与 `WEB-APPS-SANDBOX-DESIGN` 中「子会话默认不继承 webapp 工具」一致）。

### 2.3 与 OpenUltron 的映射

| 概念 | OpenClaw / Claude Code | OpenUltron（现状或目标） |
|------|------------------------|---------------------------|
| 父代理 | 根会话 / 主 Agent | 主窗口或 IM **协调会话** 的 `orchestrator` 一轮 |
| 子代理 | Sub-agent 会话 | `sessions_spawn`、`webapp_studio_invoke` 等派生子会话 |
| 隔离 | 独立 session、独立工具 | 独立 `sessionId`、可选工具与 memory 切片 |
| 回传 | 结果推送回父会话 | tool 结果 + `envelope` / `message`，由主 Agent 下一轮读取 |
| 护栏 | 深度、超时、停止 | 可在运行时配置 **max 深度、并行数、超时**（部分已有，可统一进配置与文档） |

---

## 3. 目标运行时行为（主 → 子 → 主 → 用户）

```text
用户消息
  → 主 Agent：理解意图、是否需委派、拆任务（可并行多子）
        → 子 Agent A/B/…：执行（工具、写文件、外部 CLI 等）
        → 子结果：结构化 envelope + 简短摘要进入主会话（tool 结果）
  → 主 Agent：**判定**（成功/失败/需重试/需补充信息）、**去冲突**、**润色为对用户单一回复**
  → 渠道 / UI：**只展示主 Agent 最终轮**（或主 Agent 明确授权的附件列表）
```

**默认产品语义（可随配置收紧/放松；与 §0、§2a 一致）**：

1. **子 Agent 输出不默认等同「对用户答复」**；在默认策略下，宜经主 Agent **至少一次** 合成轮（可很短）。若启用 §2a 中的「低延迟/直出」实验路径，则由配置与风控规则约束，不在此固化。
2. **失败语义**：子 envelope `success: false` 时，**任何**对外通道均不得用成功口吻掩盖；主 Agent 或程序拼装层须与 envelope 一致。
3. **短路**：无需工具、无需委派的 **纯对话**（如概念解释、身份说明）可由主 Agent **直接** 回复用户，不强制经子 Agent。

---

## 4. 契约与主 Agent 职责（与 envelope 对齐）

子任务工具返回应继续收敛到（详见 `MESSAGE-CONTRACT.md`）：

- `envelope.success`、`envelope.summary`、`envelope.error`、`artifacts`（若有）
- 主 Agent system 或工具说明中明确：**读取 tool 结果时优先解 envelope，再读自然语言。**

主 Agent **必须**在最终回复中体现：

- 与用户问题 **对齐的结论**（成功做了什么 / 失败为什么）
- 关键产物路径或链接（若有），与 envelope 一致
- 多子任务时 **合并去重**，避免把多段重复日志贴给用户

---

## 5. 渠道与 IM 的一致性

飞书 / Telegram / 钉钉 等 **入站协调会话**：

- **默认**：最终 `text` + 附件来自 **主会话最近一轮有效 assistant**，且与 envelope 一致（与 `agent-capability-routing`、IM 管线「可见结果策略」对齐）。
- **演进**：若仍存在「子结果未经主合成即参与渠道候选」的路径，应 **收口** 到「仅主会话最终轮」或「主 Agent 显式引用子摘要后的文本」。

---

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 延迟与成本（多一轮主合成） | 主合成轮可 **限长**；子侧 **摘要优先**；简单成功用模板化短句。 |
| 主 Agent 上下文爆炸 | 子侧长日志进 artifact / 文件引用，tool 结果只保留 **摘要 + 指针**。 |
| 主 Agent 「替子编造成功」 | 以 envelope.success 为准；prompt 中写清 **禁止覆盖失败事实**。 |
| 过度委派 | 深度限制、并行上限；纯问答不委派。 |

---

## 7. 分阶段落地（建议）

### P0

1. **Prompt 与工具说明**：在主 Agent system（含协调模式）中 **写清**「子结果必经你汇总后方可对用户承诺」及 envelope 阅读顺序。
2. **渠道语义**：核对 IM 管线，确保 **默认外发** 与「主合成后」一致（与现有 `hasOutboundVisibleResult`、spawn 优先/回退逻辑一致并持续回归）。
3. **失败路径**：子 `success: false` 时主 Agent 的 **强制表述** 抽检（可用例或快照测试）。

### P1

1. **可配置护栏**：`maxSpawnDepth`、同轮最大并行子任务数、子会话默认超时（与 OpenClaw 深度思路一致，数值可按产品调）。
2. **观测**：一次用户请求链路可 log：`main_run_id → child_session_ids → envelope 摘要`，便于排障。

### P2（可选）

1. **并行 fan-out**：同一用户消息拆多 `sessions_spawn` 并行，主 Agent **合并**（需会话/registry 支持排队与合并策略）。

---

## 8. 维护规则

- 本文件描述 **一种候选目标架构与落地阶段**，**不**排斥 §2a 中的其他范式；具体字段以 `MESSAGE-CONTRACT.md` 为准。
- 若产品侧在 A/B 或配置中切换「主汇总 vs 程序直出 vs 其他编排」，应在本节或 `agent-capability-routing.md` 留 **简短决策记录**（日期、场景、结论）。
- 实现细节变更时，同步更新 [`agent-capability-routing.md`](./agent-capability-routing.md) 与认知层计划中的交叉引用。
