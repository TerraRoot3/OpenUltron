/**
 * 主动停掉当前任务：子 Agent 分析用户消息后若判断需要中止当前执行（如用户说「别做了」「停」），可调用此工具立即停止当前会话的 AI 运行。
 */

const definition = {
  description: '立即停止当前正在执行的任务（当前会话的 AI 运行）。当用户明确要求「别做了」「停」「取消」等时调用，调用后当前任务会中止，不再继续执行后续步骤。',
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: '可选。停止原因，便于日志或回复用户（如「用户要求停止」）' }
    },
    required: []
  }
}

function createStopCurrentTaskTool(stopChat) {
  if (typeof stopChat !== 'function') {
    return {
      definition,
      execute: async () => ({ success: false, error: 'stop_current_task 未配置（缺少 stopChat）' })
    }
  }

  async function execute(args, context = {}) {
    const sessionId = context.sessionId
    if (!sessionId) {
      return { success: false, error: '无法获取当前会话 ID' }
    }
    try {
      stopChat(sessionId)
      return { success: true, message: '已停止当前任务' }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  }

  return { definition, execute }
}

module.exports = { definition, createStopCurrentTaskTool }
