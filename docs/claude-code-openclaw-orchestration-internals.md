# Claude Code 与 OpenClaw：子 Agent / 编排如何实现

本文仅说明 **Anthropic Claude Code** 与 **OpenClaw** 在公开文档中的**运行机制**（会话、工具、回传、深度限制等），**不涉及** OpenUltron 仓库实现。文档与 CLI 行为随版本变化，以官方为准。

**官方入口**

- Claude Code Subagents：<https://docs.anthropic.com/en/docs/claude-code/sub-agents>  
- OpenClaw Sub-agents：<https://docs.openclaw.ai/tools/subagents>  
- OpenClaw 文档索引：<https://docs.openclaw.ai/llms.txt>

---

## 1. Claude Code：子 Agent 如何实现

### 1.1 定义从哪里来（配置面）

- **Markdown + YAML frontmatter**：`name`、`description`（必填）以及 `tools`、`model`、`maxTurns`、`memory`、`mcpServers` 等（可选）。  
- **存放位置与优先级**（高优先级覆盖低）：托管设置 → `--agents` 当前会话 → 项目 `.claude/agents/` → 用户 `~/.claude/agents/` → 插件 `agents/`。  
- **启动时加载**：子 Agent 定义在 **会话启动时** 加载；手动新增文件后需重启会话或通过 `/agents` 立即加载。  
- **CLI 一次性注入**：`claude --agents '{ "id": { "description", "prompt", "tools", "model" } }'`，仅当次会话有效。

### 1.2 运行时：和「主会话」是什么关系

- **独立上下文窗口**：每个子 Agent 在 **自己的上下文** 里跑，系统侧主要注入 **该子 Agent 的 prompt（frontmatter + 正文）** 与 **环境信息（如工作目录）**，**不是**把整段主会话 Claude Code 系统提示原样复制进去（文档明确：子 Agent 不继承完整主会话 system）。  
- **谁决定「何时委派」**：主对话里的 Claude 根据各子 Agent 的 **description** 匹配任务并发起委派。  
- **内置子 Agent**（示例）：**Explore**（只读、Haiku）、**Plan**（只读、计划前调研）、**General-purpose**（读写兼备）等，各有 **工具集合与模型** 预设。  
- **工具限制**：`tools` 白名单或 `disallowedTools` 黑名单；未限制时子 Agent 可继承主会话可用工具（含 MCP）。可对子 Agent **单独挂 `mcpServers`**（含内联 MCP，仅子 Agent 连接）。  
- **委派机制（产品内）**：通过 **Agent 工具**（v2.1.63 起由 **Task** 工具更名而来，`Task(...)` 仍可作为别名）调用指定类型的子 Agent；主 Agent 的 `tools` 里可写 `Agent(worker, researcher)` 等形式 **限制可 spawn 的类型**。  
- **子 Agent 不能再 spawn 子 Agent**：文档写明 **子 Agent 定义里 `Agent(...)` 不生效**——即 **子 Agent 不能继续派生子 Agent**（与「单层委派」一致，避免无限嵌套；计划模式等通过 Explore/Plan 等只读子 Agent 消化）。

### 1.3 与「多会话协作」的边界

- **Subagents**：文档强调在同一 **session** 内委派，结果回到当前会话。  
- **Agent teams**：若需要 **多会话并行、Agent 之间通信**，文档指向 **agent teams** 另文，**不是**同一套 subagent 机制。

### 1.4 其它实现相关选项（节选）

- **`maxTurns`**：子 Agent 最大 agentic 轮数。  
- **`background`**：是否默认以后台任务跑。  
- **`isolation: worktree`**：在临时 **git worktree** 里跑，与主工作区隔离。  
- **`memory`**：user/project/local 等持久记忆范围。  
- **模型解析顺序**（文档所列）：环境变量 `CLAUDE_CODE_SUBAGENT_MODEL` → 单次调用的 `model` 参数 → frontmatter `model` → 主会话模型。

---

## 2. OpenClaw：子 Agent 如何实现

### 2.1 会话与标识（隔离面）

- **后台运行**：子 Agent 从一次已有 Agent run 中 **spawn**，在 **独立 session** 中执行；会话键形状含 **`agent::subagent:`**（嵌套时可为 **`agent::subagent::subagent:`** 等）。  
- **与主 run 的关系**：并行跑慢任务、长工具链，**不阻塞**主会话；每个子 run 作为 **background task** 被跟踪。

### 2.2 如何创建：工具与命令

- **工具 `sessions_spawn`**（核心）：  
  - 启动子 Agent run（`deliver: false`，全局队列 lane：`subagent`）。  
  - 跑完后有 **announce 步骤**，向 **请求方会话** 投递完成说明。  
  - **非阻塞**：立即返回 **`{ status: "accepted", runId, childSessionKey }`**（文档语义）。  
  - 常用参数：`task`（必填）、`model`、`thinking`、`runTimeoutSeconds`、`thread`、`mode`（`run` | `session`）、`cleanup`、`sandbox`、`agentId` 等。  
- **Slash：`/subagents spawn`**：用户侧发起后台子 Agent；完成后向 **请求方频道** 发一条 **完成更新**（与内部 `sessions_spawn` 工具流类似但偏手动场景）。  
- **其它 `/subagents`**：`list`、`kill`、`log`、`info`、`send`、`steer` 等，用于查看 transcript、元数据、杀进程等。  
- **ACP**：对 Codex / Claude Code / Gemini CLI 等，文档指向 **`sessions_spawn` + `runtime: "acp"`** 与 [ACP Agents](https://docs.openclaw.ai/tools/acp-agents)。

### 2.3 结果如何「回到主会话」（Announce）

- 子 Agent 侧跑完会走 **announce 步骤**（在 **子 session** 内执行，而非请求方 session）。  
- 若子 Agent 只回复 **`ANNOUNCE_SKIP`**，则 **不向用户侧发帖**。  
- 否则根据请求方深度：顶层请求方可能走 **带外投递**（`deliver=true`）；嵌套请求方子 Agent 可能走 **内部注入**（`deliver=false`），供 **编排型子 Agent** 在会话内合成。  
- Announce 载荷会规范化，包含：**来源、子 session、状态（来自运行时而非模型瞎编）、结果摘要、token/耗时等**；并带 **指令** 要求请求方 Agent **用正常 assistant 语气改写**，**不要**直接转发原始内部元数据。  
- **投递可靠性**：顶层会尝试直连 `agent` 投递 + idempotency；失败则队列；再失败指数退避重试。

### 2.4 深度、并发与工具策略

- **默认 `maxSpawnDepth: 1`**：子 Agent **默认不能再 spawn** 子 Agent。  
- **设为 2**：允许 **main → 编排子 Agent → worker 子子 Agent**；深度 2 为 **叶子**，**禁止**再 spawn。  
- **Session key 层级**（文档表格）：depth 0 `agent::main`；depth 1 `agent::subagent:`；depth 2 `agent::subagent::subagent:`（等）。  
- **Announce 链**：深度 2 先向父 depth-1 announce，depth-1 再向 main announce；**每一层只处理直接子级**。  
- **并发**：子 Agent 使用独立 lane **`subagent`**，并发上限 **`agents.defaults.subagents.maxConcurrent`**（默认 8）；另有 **`maxChildrenPerAgent`**（默认 5）限制单会话活跃子任务数。  
- **停止**：`/stop`、kill 子 Agent 会 **级联** 停掉下层子 Agent。  
- **工具策略（摘要）**：默认子 Agent **拿不到** 若干 **session 类工具**（如 `sessions_list`、`sessions_spawn` 等，见官方列表）；**当 `maxSpawnDepth >= 2` 时，depth-1 编排型** 可额外获得 `sessions_spawn`、`subagents` 等以管理子任务；**depth-2 叶子** 始终不能再 `sessions_spawn`。  
- **配置覆盖**：`tools.subagents.tools.allow` / `deny` 等可继续裁剪子 Agent 工具表。

### 2.5 其它实现细节（节选）

- **认证**：子 Agent 会话键对应 **`agentDir` 下 auth**；可与主 Agent auth **合并**，冲突时 **子 Agent profile 优先**（文档说明「完全隔离尚未支持」类语义）。  
- **子 Agent 上下文注入**：文档写明子 Agent **只注入 `AGENTS.md` + `TOOLS.md`**，不注入 `SOUL.md`、`IDENTITY.md` 等（与主会话区分）。  
- **自动归档**：`agents.defaults.subagents.archiveAfterMinutes`（默认 60 分钟）等；`cleanup: delete` 会在 announce 后立即归档类行为（仍保留 transcript 重命名等，见文档）。  
- **Thread 绑定**（如 Discord）：`sessions_spawn` + `thread: true` 可把后续同线程消息路由到 **同一子 session**（详见 Thread supporting channels 章节）。  
- **限制**：网关重启可能丢失 **待 announce**；子 Agent 与主进程 **共享网关进程资源**；`maxSpawnDepth` 文档给出范围 **1–5**，推荐多数场景用 **2**。

---

## 3. 二者对比（实现视角一句话）

| 维度 | Claude Code | OpenClaw |
|------|-------------|----------|
| **子身份定义** | 文件 / CLI / 插件 Markdown，frontmatter | Agent 配置 + `sessions_spawn` 参数 + 运行时 session key |
| **隔离** | 独立上下文 + 可选 worktree / memory 范围 | 独立 `agent::subagent:` 会话 + 可选 sandbox / thread 绑定 |
| **委派入口** | 主会话内 **Agent/Task 工具** 调用某类子 Agent | **`sessions_spawn` 工具** + `/subagents` 命令 |
| **嵌套** | 子 Agent **不能再 spawn**（产品规则） | **`maxSpawnDepth`** 与 **per-depth 工具策略** 显式控制 1～5 层 |
| **回传** | 结果合回 **同一会话** 继续对话 | **Announce** 管道 + 顶层/嵌套不同 `deliver` 策略 + 要求改写为用户语气 |
| **并行** | 文档侧重单会话委派；多会话见 agent teams | **lane `subagent`** + `maxConcurrent` + 非阻塞 spawn |

---

## 4. 维护说明

- 本文是对 **公开文档** 的归纳，**非** Anthropic / OpenClaw 官方声明；实现以各项目当前版本为准。  
- OpenUltron 侧如何 **抽取优点并重设计** 见 [`../plans/agent-orchestration-redesign.md`](../plans/agent-orchestration-redesign.md)。
