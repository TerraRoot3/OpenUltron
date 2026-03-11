// 工具：查询命令执行日志（按命令聚合的目录/文件、成功失败统计），供 AI 后续进化时参考
const commandExecutionLog = require('../command-execution-log')

const definition = {
  description: '查询当前项目下已执行过的命令聚合结果：查看过哪些目录和文件、成功/失败统计。用于避免重复查看、辅助后续操作与进化。不返回具体输出内容，仅返回路径与统计。',
  parameters: {
    type: 'object',
    properties: {
      projectPath: { type: 'string', description: '项目路径（可选，不传则用当前会话项目）' },
      query: {
        type: 'string',
        enum: ['viewed_paths', 'summary', 'both'],
        description: 'viewed_paths=仅返回查看过的目录与文件列表；summary=仅返回执行成功/失败统计；both=两者都返回。默认 both'
      }
    },
    required: []
  }
}

async function execute(args, context = {}) {
  const projectPath = (args && args.projectPath) || context.projectPath || ''
  const query = (args && args.query) || 'both'
  try {
    const viewed = commandExecutionLog.getViewedPaths(projectPath)
    const summary = commandExecutionLog.getExecutionSummary(projectPath)
    if (query === 'viewed_paths') {
      return {
        success: true,
        directories: viewed.directories,
        files: viewed.files,
        summary: viewed.summary
      }
    }
    if (query === 'summary') {
      return { success: true, ...summary }
    }
    return {
      success: true,
      directories: viewed.directories,
      files: viewed.files,
      executionSummary: summary
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

module.exports = { definition, execute }
