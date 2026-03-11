/**
 * 停掉前边的任务：子 Agent 分析用户消息后若判断用户要求停止前一个任务（如「别做了」「停掉刚才的」），可调用此工具停止同一渠道上先于当前 run 的任务。
 */

const definition = {
  description: '停止同一会话中「前边」正在执行的任务（先于当前子 Agent 启动的那些 run）。当用户明确要求「别做了」「停掉刚才的」「取消前一个」等时调用；调用后前边的任务会中止，当前子 Agent 继续执行。不要用来停自己，只停前边的。',
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: '可选。停止原因，便于日志或回复用户（如「用户要求停止前一个任务」）' }
    },
    required: []
  }
}

function createStopPreviousTaskTool(stopPreviousRunsForChannel) {
  if (typeof stopPreviousRunsForChannel !== 'function') {
    return {
      definition,
      execute: async () => ({ success: false, error: 'stop_previous_task 未配置' })
    }
  }

  async function execute(args, context = {}) {
    const sessionId = context.sessionId
    if (!sessionId) {
      return { success: false, error: '无法获取当前 run 的 sessionId' }
    }
    try {
      const affected = Number(stopPreviousRunsForChannel(sessionId) || 0)
      if (affected <= 0) {
        return { success: false, error: '当前上下文没有可停止的前序任务' }
      }
      return { success: true, affected, message: `已停止 ${affected} 个前序任务` }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  }

  return { definition, execute }
}

module.exports = { definition, createStopPreviousTaskTool }
