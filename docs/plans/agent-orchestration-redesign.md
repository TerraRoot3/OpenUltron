# OpenUltron 编排方案：对比 Claude Code / OpenClaw 后的重设计

本文在 [`claude-code-openclaw-orchestration-internals.md`](../claude-code-openclaw-orchestration-internals.md) 与 [`agent-orchestration-main-sub.md`](./agent-orchestration-main-sub.md) 基础上，**抽取二者可复用优点**，输出 **OpenUltron 目标方案**（产品 + 工程约束），便于评审与分阶段实现。

---

## 1. 优点抽取与采纳理由

### 1.1 来自 Claude Code

| 优点 | 说明 | OpenUltron 采纳 |
|------|------|-----------------|
| **声明式子 Agent 配置** | Markdown + frontmatter：`name`、`description`、`tools`、`model`、`maxTurns` 等，按作用域覆盖 | **目标**：工作区或用户目录下 **Agent Profile**（见 §3.2），`sessions_spawn(agent_profile=...)` 或等价参数，避免每次长传 `system_prompt` |
| **工具白名单/黑名单** | `tools` / `disallowedTools` 精确裁剪，内置 Explore/Plan（只读 + 便宜模型） | **目标**：`getToolsForSubChat` 按 **profile** 输出；提供 **内置 profile**：`read_only_fast`、`executor`、`coordinator`（见 §3.3） |
| **显式委派类型** | `Agent(worker, researcher)` 限制主会话可 spawn 的类型 | **目标**：主会话工具列表可 **限制** 可调用的子 profile 集合（配置或 `openultron.json`），防「乱 spawn」 |
| **子 Agent 不递归 spawn** | 子定义里 `Agent()` 不生效，单层委派 | **已有**：子会话禁止 `sessions_spawn`；**可选演进**：在 **显式开启 `maxSpawnDepth≥2`** 时仅允许 **coordinator profile** 再 spawn（对齐 OpenClaw，见 §3.3） |
| **子上下文不复制整套主系统提示** | 子侧只注入该 Agent 的 prompt + 环境 | **目标**：子会话 system 拼装 **瘦身**——主会话的 SOUL/IDENTITY 等 **默认不全量注入子会话**（可配置「继承哪些块」） |
| **maxTurns / 隔离工作区** | 控制子循环轮数；worktree 隔离改代码风险 | **目标**：子会话 **最大 orchestrator 轮数** 可配；长期评估 **git worktree** 类隔离（P2） |
| **模型解析顺序** | 环境 → 单次参数 → profile → 主会话 | **目标**：文档化 **子模型** 解析顺序：`sessions_spawn.model` > profile 默认 > 全局默认 |

### 1.2 来自 OpenClaw

| 优点 | 说明 | OpenUltron 采纳 |
|------|------|-----------------|
| **显式深度与 session 语义** | `maxSpawnDepth`、层级 session key、每层工具策略不同 | **目标**：会话元数据带 **`spawnDepth`**（0/1/2）；**depth 2 仅叶子**，禁止再 spawn；**depth 1 且 profile=coordinator** 才允许 `sessions_spawn`（需配置 `maxSpawnDepth≥2`） |
| **Announce 语义** | 完成态 **Status 来自运行时**，不是模型胡编；要求 **改写为用户语气**，不转发内部 metadata | **目标**：工具结果里 **envelope + `runtimeStatus`**（success / failed / timeout）**仅由程序**根据真实结束原因写入；主 Agent 侧 prompt 固定：**「用自然语言向用户说明，勿粘贴 raw JSON 调试块」**（与现有 envelope 一致并强化） |
| **非阻塞 spawn + 并发 lane** | 立即返回 runId；`subagent` lane + `maxConcurrent` | **目标**：长任务可选 **异步 spawn**（先返回 `accepted + subSessionId`，轮询或事件完成）— **P1**；短期保留同步 `runSubChat`，但增加 **全局并发上限**（防止同时开 20 个子会话打爆 API） |
| **maxChildrenPerAgent** | 单会话同时活跃子任务数上限 | **目标**：同一 `parentSessionId` 下 **活跃子任务数 ≤ N**（默认如 5，可配） |
| **级联停止** | kill 父则停子 | **目标**：用户「停止」主会话时 **注册并取消** 未完成的子 `runSessionId`（与现有 `abortedRunSessionIds` 等衔接，见 §4） |
| **子上下文注入裁剪** | 仅 `AGENTS.md` + `TOOLS.md` | **目标**：子会话 **默认不注入** 与主身份强绑定的长记忆块；仅注入 **任务相关 + TOOLS/AGENTS**（与 `subagent-dispatch` 可合并，见 §3.4） |
| **投递可靠性** | idempotency、队列、退避 | **目标**：IM 回发 **可重试**、**幂等键**（messageId）— 与现有渠道发送逻辑迭代，**P1** |

---

## 2. 重设计后的目标架构（一句话）

**主会话（depth 0）**：负责意图、选型、对外承诺；**子会话（depth 1+）**：负责执行与 **结构化 envelope**；**任意对用户的自然语言**由主会话 **或** 经程序校验的模板生成，且 **状态以运行时 envelope 为准**。

---

## 3. 方案分面说明

### 3.1 交付面：Announce 对齐（OpenClaw）

- **结构化**：`envelope` 已含 `success`、`summary`、`error`；补充约定 **`exitKind`**：`completed` | `timeout` | `aborted` | `error`（由 **subagent-dispatch / orchestrator 结束分支** 写入，不由模型填）。  
- **主模型指令**：收到 tool 结果后，**先读 envelope**，再组织用户可见句；**禁止**用成功话术覆盖 `success: false`。  
- **渠道层**：飞书等 **优先** 展示「主会话最终 assistant」；若走子摘要直出，**必须**通过 `hasOutboundVisibleResult` + envelope 校验（与现有 IM 管线一致）。

### 3.2 配置面：Agent Profile（Claude Code）

- **位置（建议）**：`~/.openultron/agents/*.md`（用户）+ 项目 `.openultron/agents/*.md`（仓库），优先级：项目 > 用户。  
- **字段**：与 Claude 对齐的最小集：`name`、`description`、`prompt`（body）、`tools_allow` / `tools_deny`、`model`、`max_turns`（映射到子 orchestrator 最大轮数）。  
- **调用**：`sessions_spawn` 增加可选 **`agent`** 或 **`profile`**；未指定时沿用当前 **字符串 + system_prompt** 模式。

### 3.3 深度与工具（OpenClaw + Claude）

| depth | 角色 | `sessions_spawn` | 典型工具策略 |
|-------|------|------------------|--------------|
| 0 | 主会话 | 允许（若配置 `maxSpawnDepth≥1`） | `getToolsForCoordinatorChat`（全量或近全量） |
| 1 | 子执行体 | **默认禁止**（当前行为） | `getToolsForSubChat` 按 profile |
| 1 | 子编排器（可选） | **仅当** `maxSpawnDepth≥2` 且 profile=`coordinator` | 仅 `sessions_spawn` + 读类工具 + 列表类 |
| 2 | 叶子 worker | **禁止** | 执行类工具，无 spawn |

- **默认**：`maxSpawnDepth = 1`（与 OpenClaw 默认一致），实现成本最低。  
- **编排模式**：仅在需要「主 → 分派 → 多 worker」时打开 `maxSpawnDepth = 2`。

### 3.4 上下文注入（Claude + OpenClaw）

- **子会话 system**：**任务 + profile.prompt + 交付规则** + **可选** `AGENTS.md` / `TOOLS.md` 摘要。  
- **默认不注入**：`USER.md` / `IDENTITY.md` 全文（除非 profile 声明 `inherit_identity: true`）。  
- **目的**：减少 token、降低子会话「冒充主身份对外发消息」的风险（与现有「禁止子发 IM」一致）。

### 3.5 并发与停止（OpenClaw）

- **全局**：`subagent.maxConcurrent`（进程内同时跑的子会话数上限）。  
- **每主会话**：`maxChildrenPerAgent`（同一主会话未完成的子任务数）。  
- **停止**：主会话 `abort` → **级联** 标记所有子 `runSessionId` aborted（完善现有 registry / pipeline）。

---

## 4. 与当前代码的映射（差距 → 工作项）

| 能力 | 现状 | 重设计目标 |
|------|------|------------|
| 子递归 | 子会话禁止 `sessions_spawn` | 保留默认；**可选** coordinator + `maxSpawnDepth=2` |
| 状态来源 | envelope 有，但部分路径仍靠模型文本 | **exitKind** 一律由运行时写 |
| Profile | 仅 `system_prompt` 字符串 | **文件化 profile** + `sessions_spawn(profile=)` |
| 并发 | 无全局 cap | **maxConcurrent + maxChildrenPerAgent** |
| 子上下文 | 已有 delivery prompt + 工具裁剪 | **显式「不注入列表」** 与配置 |
| 异步 spawn | 同步 `runSubChat` 为主 | **P1** 异步 + 查询 |

---

## 5. 分阶段落地

### P0（协议与提示，不改大结构）

1. 文档化 **模型解析顺序**、**主会话读 envelope 规则**、**禁止覆盖失败**。  
2. 在 `execution-envelope` / 子返回路径上统一 **`exitKind`**（或等价字段）。  
3. 子会话 system 拼装 **减少默认身份块**（可开关）。

### P1（配置与护栏）

1. `openultron.json`（或等价配置）：`maxSpawnDepth`、`subagent.maxConcurrent`、`maxChildrenPerAgent`、子 profile 白名单。  
2. **级联 abort** 与未完成子任务清理。  
3. **Agent Profile** MVP：单目录 `*.md` + 解析 + `sessions_spawn(agent=)`。

### P2（编排与体验）

1. `maxSpawnDepth=2` + coordinator profile + 第二层 worker。  
2. 异步 `sessions_spawn` + 完成事件。  
3. git worktree 类隔离（高风险改代码场景）。

---

## 6. 关联文档

- 上游机制归纳：[`claude-code-openclaw-orchestration-internals.md`](../claude-code-openclaw-orchestration-internals.md)  
- 主–子产品语义：[`agent-orchestration-main-sub.md`](./agent-orchestration-main-sub.md)  
- 契约：[`MESSAGE-CONTRACT.md`](../MESSAGE-CONTRACT.md)  
- 认知层总计划：[`agent-cognitive-architecture-plan.md`](./agent-cognitive-architecture-plan.md)  

---

## 7. 维护规则

- 本文是 **重设计结论**；具体字段与枚举以 `MESSAGE-CONTRACT.md` 与实现为准。  
- 实现某 P0/P1 项后，在对应规范文档更新 **真相源**，本文只保留阶段与原则。
