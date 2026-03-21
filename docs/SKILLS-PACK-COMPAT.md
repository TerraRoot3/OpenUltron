# OpenUltron 与外部技能包（AgentSkills / ClawHub）

说明本应用如何加载 **`SKILL.md` 技能包**、目录优先级及与常见上游格式的差异。

## 1. 目录与优先级

| 常见上游约定 | OpenUltron |
|-------------|------------|
| Workspace 下 `skills/` | 当前聊天 **`projectPath/skills`**（`projectPath` 为真实绝对路径且非 `__feishu__` 等占位） |
| 用户级 managed 目录 | **`~/.openultron/skills`** |
| 额外目录（低优先级） | **`openultron.json` → `skills.load.extraDirs`**（绝对路径数组） |
| 同名技能文件夹 | **workspace 覆盖 managed，managed 覆盖 extraDirs**（extra 数组中越靠前优先级越低） |

将技能包放到 **`~/.openultron/skills/<id>/`** 或 **`项目/skills/<id>/`**，且含 **`SKILL.md`** 即可。

## 2. SKILL.md

- 与 [AgentSkills](https://agentskills.io/) 一致的 frontmatter + 正文。
- **`metadata`** 可为单行 JSON；门控信息常见于 **`clawdbot`** 或与上游工具链文档一致的命名空间键。
- **门控**：`requires.bins` / `anyBins` / `requires.env`；**`always: true`** 时跳过门控。
- **`disable-model-invocation: true`**：不进入模型侧自动技能列表，仍可用 **`get_skill`** 或 **`/`**。
- **`{baseDir}`**：在 **`get_skill` 返回内容**中替换为技能目录绝对路径。

## 3. `openultron.json` 示例

```json
{
  "skills": {
    "sources": [
      { "name": "ClawHub", "url": "https://clawhub.ai/", "enabled": true, "type": "clawhub" }
    ],
    "load": { "extraDirs": ["/path/to/shared-skills"] },
    "entries": {
      "weather-1.0.0": { "enabled": false }
    }
  }
}
```

**`skills.entries.<key>.enabled: false`**：按目录 **id**、frontmatter **`name`** 或门控元数据里的 **`skillKey`** 匹配。

## 4. 安装与 ZIP

- **ClawHub**：`get_skill` `list_remote` + `install_skill` `install_from_remote`（`type: clawhub`）。
- **ZIP**：导入/导出均支持 **`skills/<id>/` 整目录**（含子目录资源）。

## 5. 未实现的上游能力

| 项目 | 说明 |
|------|------|
| 宿主 **hooks** 目录 | 不执行；技能内 `hooks/` 仅当普通文件。 |
| **Bundled** 与安装包绑定技能 | 以本应用 **`BUILTIN_SKILLS`** 与磁盘 `skills/` 为准。 |
| 每轮 **`skills.entries` env/apiKey 注入** | 未做进程级按轮注入。 |
| **`requires.config` 读宿主 JSON** | 未解析；可后续对接 `openultron.json` 路径。 |
| **`command-dispatch: tool`** | 仍为 **`get_skill`** + 模型或 **`/`** 注入。 |
| **插件挂载 skills** | 无。 |
| **目录热监视** | 依赖 **`ai-skills-changed`** 与 UI 重新拉取。 |

## 6. 外部网关 CLI（子 Agent）

若使用 **`sessions_spawn`** 的 **`runtime=external:gateway_cli`**，主进程会按 **`OPENULTRON_GATEWAY_CLI`** 环境变量（或默认探测 **`claw`**）查找可执行文件。请在本机 shell 或启动脚本中把该变量设为实际 CLI 名称。

## 7. 参考

- [AgentSkills](https://agentskills.io/)
- [ClawHub](https://clawhub.com)
