# Feishu Capability Acceptance Checklist (2026-03-12)

> 目标：验证飞书文档、电子表格、多维表格能力，以及主/子 Agent 路由与结果回传一致性。

## A. 主流程与路由

1. 发送：`用codex帮我写一个网页`
- 期望：走 `runtime=external:codex`（若可用），失败时回退 internal，并明确回退说明。

2. 发送：`帮我写一份飞书文档周报`
- 期望：命中 docs 能力；子 Agent 调用 `feishu_doc_capability`（不是只输出草稿）。

3. 发送：`把网页整体打包发给我`
- 期望：产物被识别并走文件发送；失败时给确定性错误（不无限重试）。

## B. 飞书文档能力

1. 创建文档
- 指令：`创建一份飞书文档，标题“项目周报-验收”，内容包含本周进展、风险、下周计划`
- 期望：
  - 返回 `document_id` / `url`
  - 飞书可打开该文档

2. 读取文档
- 指令：`读取刚才那份文档内容并给我3条摘要`
- 期望：
  - 工具执行 `action=read`
  - 返回内容摘要与来源文档标识

3. 追加内容（副本策略）
- 指令：`在刚才文档末尾追加“风险与行动项”小节`
- 期望：
  - 执行 `append_inplace`（当前实现为 copy_based）
  - 返回新文档链接（`fallback: copy_based`）

4. 改写内容（副本策略）
- 指令：`把文档改成正式语气，保留要点`
- 期望：
  - 执行 `rewrite_inplace`（当前实现为 copy_based）
  - 返回新文档链接（`fallback: copy_based`）

5. 导出并发送
- 指令：`把这份文档导出后发给我`
- 期望：
  - 执行 `export_and_send`
  - 当前会话收到导出的文件（.md）

## C. 飞书电子表格能力（Sheets）

1. 读取范围
- 指令：`读取这个表格 Sheet1!A1:C5 的内容：<spreadsheet_token>`
- 期望：
  - 执行 `feishu_sheets_capability action=read_values`
  - 返回 values 数据

2. 写入范围
- 指令：`往这个表格 Sheet1!A1:B2 写入 [["姓名","分数"],["张三",95]]：<spreadsheet_token>`
- 期望：
  - 执行 `action=write_values`
  - 飞书表格中可见写入结果

## D. 飞书多维表格能力（Bitable）

1. 列出表
- 指令：`列出这个多维表格应用下的所有表：<app_token>`
- 期望：`action=list_tables` 成功返回表列表。

2. 查询记录
- 指令：`查询这个表前10条记录：<app_token> <table_id>`
- 期望：`action=search_records` 返回记录数组。

3. 新增记录
- 指令：`在这个表新增记录，字段为 {"姓名":"李四","状态":"进行中"}：<app_token> <table_id>`
- 期望：`action=create_record` 返回 record id。

4. 更新记录
- 指令：`把这条记录状态改为“已完成”：<app_token> <table_id> <record_id>`
- 期望：`action=update_record` 成功，飞书端数据更新。

## E. 日志检查点（必须）

1. `SubAgentDispatch` 里应出现 capability 信息：
- `capability`
- `deliveryPolicy`
- `riskLevel`

2. `sessions_spawn` 工具结果应带 `envelope`，主流程可读 `envelope.summary`。

3. 失败场景不应无限重试，最终状态应一致：
- 会话状态
- 用户可见回复
- 日志终态

## F. 已知行为（当前版本）

1. `rewrite_inplace` / `append_inplace` 当前为 `copy_based` 策略（生成新文档版本），不是块级原位编辑。
2. `export_and_send` 当前导出为 Markdown 文件并发送。

