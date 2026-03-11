// 工具：执行 Shell 命令（主力工具）；执行结果单独写入 command-execution-log，不写入对话历史
const commandExecutionLog = require('../command-execution-log')
const executorRegistry = require('../../extensions/executor-registry')

const definition = {
  description: '在指定目录执行 shell（Bash）命令。支持：查看文件(cat/head/ls)、搜索(grep/find)、Git(git status/commit/push)、构建(npm/yarn)、执行 Bash 脚本(bash script.sh)、执行 Node.js 脚本(node script.js)等。一条命令可用 && 或 | 组合。',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'shell 命令，可用 && 或 | 组合' },
      cwd: { type: 'string', description: '工作目录（绝对路径）' },
      timeout: { type: 'number', description: '超时时间(ms)，默认 120000' },
      runtime: { type: 'string', description: '可选。执行器：shell | pwsh | fish，默认 shell' }
    },
    required: ['command', 'cwd']
  }
}

async function execute(args, context = {}) {
  const { command, cwd, timeout = 120000, runtime = 'shell' } = args
  const projectPath = context.projectPath || ''
  const sessionId = context.sessionId || ''

  if (!command || !cwd) {
    return { success: false, error: '缺少 command 或 cwd 参数' }
  }

  const executor = executorRegistry.get(runtime || 'shell')
  if (!executor || !executor.execute) {
    return { success: false, error: `未找到执行器: ${runtime}` }
  }

  const result = await executor.execute({ script: command, cwd, timeout }, context)
  try {
    commandExecutionLog.append(projectPath, sessionId, {
      toolName: 'execute_command',
      command,
      cwd,
      success: result.success,
      exitCode: result.exitCode,
      sessionId
    })
  } catch (e) { /* ignore */ }

  return {
    ...result,
    command,
    cwd
  }
}

module.exports = { definition, execute }
