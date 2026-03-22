# 附件统一摄入（主会话 + 飞书）

## 目标

主聊天与飞书入站的文件/图片走**同一套**校验、落盘与注入逻辑，让模型稳定拿到可读上下文，并统一限制：

- 单文件 **20MB**
- 单轮合计 **100MB**

## 非目标

全格式语义解析（如复杂 PDF/DOCX 深度抽取）、跨会话对象存储优化、本阶段新增 Telegram/钉钉专属逻辑（可后续复用同一模块）。

## 架构

- **模块**：`electron/ai/attachment-ingest.js`（主进程）
- **入站**：主会话上传（renderer → IPC）、飞书附件（适配器下载 → ingest）
- **存储**：`~/.openultron/workspace/attachments/<sessionId>/` + 侧车 `meta.json`
- **流程**：校验大小 → 落盘 → 按 mime 分类（文本抽取 / 图片视觉或降级 / 二进制仅元数据）→ 将规范化块并入用户消息 → 进入现有 `orchestrator` 流程

## 注入块（概念字段）

`attachment_id`、`source`（`main` | `feishu`）、`kind`、`name`、`mime`、`size_bytes`、`local_path`、`status`（`ok` | `degraded` | `failed`）、可选 `extracted_text` / `vision_text` / `error`。

## 安全

文件名消毒、防路径穿越、只写入附件根目录、不执行附件内容、抽取文本需截断以防撑爆上下文。

## 实现状态

核心逻辑以仓库内 **`electron/ai/attachment-ingest.js`** 为准；UI 与渠道接线以对应 IPC / 飞书适配器实现为准。验收：主会话与飞书均能带附件对话，超限与失败有明确提示，纯文本会话无回归。
