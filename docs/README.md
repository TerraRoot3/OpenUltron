# 文档索引

根目录 [README.md](../README.md) 负责产品介绍与快速开始；**技术设计与路线图**集中在本目录，按主题选读即可。

---

## 智能体、编排与消息

| 文档 | 说明 |
|------|------|
| [plans/agent-cognitive-architecture-plan.md](./plans/agent-cognitive-architecture-plan.md) | 认知层总览：角色/记忆/上下文/压缩/学习/验证；**§九** 为分阶段落地状态表 |
| [MESSAGE-CONTRACT.md](./MESSAGE-CONTRACT.md) | 对话消息与 `meta`、工具结果与 envelope、EventBus 约定 |
| [plans/agent-capability-routing.md](./plans/agent-capability-routing.md) | 能力路由、执行信封、渠道投递（目标与落地状态） |
| [OPTIMIZATION-ROADMAP.md](./OPTIMIZATION-ROADMAP.md) | 工程与产品向 P0–P3 优先级；与上列文档交叉引用 |

---

## 主进程与 IPC

| 文档 | 说明 |
|------|------|
| [MAIN-PROCESS-MODULARIZATION.md](./MAIN-PROCESS-MODULARIZATION.md) | 拆分原则、目录约定、按域分组、风险与检查清单 |
| [MAIN-PROCESS-REMAINING-PLAN.md](./MAIN-PROCESS-REMAINING-PLAN.md) | **已迁模块表**与**剩余阶段**（Gateway 装配、飞书入站大段、bootstrap 等） |

---

## 远程接入与模型线路

| 文档 | 说明 |
|------|------|
| [GATEWAY-WEBSOCKET.md](./GATEWAY-WEBSOCKET.md) | 本地 Gateway WebSocket：`runId`、事件字段 |
| [OPENAI-CODEX-AND-CHAT-COMPLETIONS.md](./OPENAI-CODEX-AND-CHAT-COMPLETIONS.md) | Codex / Responses 与 Chat Completions 差异 |

---

## Web 沙箱应用

| 文档 | 说明 |
|------|------|
| [WEB-APPS-SANDBOX-DESIGN.md](./WEB-APPS-SANDBOX-DESIGN.md) | 安全模型、manifest、依赖与整体设计 |
| [WEB-APPS-IPC-REFERENCE.md](./WEB-APPS-IPC-REFERENCE.md) | IPC / HTTP 接口 |
| [WEB-APPS-INSTALL-ERRORS.md](./WEB-APPS-INSTALL-ERRORS.md) | 安装错误码 |
| [WEB-APPS-IMPLEMENTATION-CHECKLIST.md](./WEB-APPS-IMPLEMENTATION-CHECKLIST.md) | MVP 各 Phase 勾选与实现备注（与上设计文档对齐） |
| [manifest-web-app-mvp.schema.json](./manifest-web-app-mvp.schema.json) | MVP `manifest` JSON Schema |

---

## 技能与 MCP 扩展

| 文档 | 说明 |
|------|------|
| [SKILLS-PACK-COMPAT.md](./SKILLS-PACK-COMPAT.md) | 技能目录、`SKILL.md`、ClawHub ZIP、相关配置项 |

---

## 专项计划（`plans/`）

详见 [plans/README.md](./plans/README.md)（飞书验收、附件摄入等）。
