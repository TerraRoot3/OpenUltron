# 技能包与 ClawHub 兼容说明

OpenUltron 按 **Agent Skills / SKILL.md** 约定加载技能，并与 **ClawHub** 等来源的 ZIP 包对齐。

## 目录与优先级

- **用户级**：`~/.openultron/skills/<技能名>/`（主目录）
- **工作区**：`<项目>/skills/<技能名>/`（若存在，与配置中的 `skills.load.extraDirs` 等一起参与索引；优先级低于用户级目录的规则见 `openultron.json` 与 orchestrator 注入说明）
- **备份 ZIP**：`backup-ipc` 导出的技能包兼容 ClawHub 等常见目录结构（整包备份）

## SKILL.md 格式

- 可选 **YAML frontmatter**（`---` 包裹），正文为 Markdown。
- 常用 frontmatter 键：`name`、`description`、`metadata`（可为单行 JSON）。`metadata` 用于上游门控（如厂商命名空间）；解析逻辑见 `electron/ai/skill-pack.js`。
- 无 frontmatter 时，整文件视为正文。

## ClawHub 安装

- 远程源在配置里 `type: clawhub`（或 URL 含 `clawhub.ai`）时，`install-skill` / `get-skill` 走 ClawHub 搜索与 ZIP 下载。
- ZIP 解压后须存在 **`SKILL.md`**（通常在以技能名命名的子目录内）；否则安装会报错提示结构不符。

## 配置相关

- `skills.sources[]`：远程技能源列表。
- `skills.load.extraDirs[]`：额外技能根目录（绝对路径），用于 monorepo 或自定义技能集合。
