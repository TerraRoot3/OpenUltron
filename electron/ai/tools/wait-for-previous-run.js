/**
 * 等待前边的任务完成：子 Agent 若判断当前请求依赖前一个任务的结果（如用户说「等刚才那个做完再说」「做完上一步再继续」），可先调用此工具等待前边的 run 完成，再继续执行。
 */

const definition = {
  description: '等待同一会话中「前边」正在执行的任务全部完成后再返回。当用户的新消息依赖前一个任务的结果时调用（如「等刚才那个做完再说」「做完上一步再继续」）；调用会阻塞直到前边的 run 完成，然后当前子 Agent 可继续执行。若无前边任务则立即返回。',
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: '可选。等待原因（如「用户要求等前一步完成」）' }
    },
    required: []
  }
}

function createWaitForPreviousRunTool(waitForPreviousRuns) {
  if (typeof waitForPreviousRuns !== 'function') {
    return {
      definition,
      execute: async () => ({ success: false, error: 'wait_for_previous_run 未配置' })
    }
  }

  async function execute(args, context = {}) {
    const sessionId = context.sessionId
    if (!sessionId) {
      return { success: false, error: '无法获取当前 run 的 sessionId' }
    }
    try {
      const waited = Number(await waitForPreviousRuns(sessionId) || 0)
      if (waited <= 0) {
        return { success: false, error: '当前上下文没有需要等待的前序任务' }
      }
      return { success: true, waited, message: `已等待 ${waited} 个前序任务完成，可继续` }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  }

  return { definition, execute }
}

module.exports = { definition, createWaitForPreviousRunTool }
