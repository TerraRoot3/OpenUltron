/**
 * 查询异步 sessions_spawn（wait_for_result=false）的后台子 Agent 状态与结果。
 */

const { buildExecutionEnvelope } = require('../execution-envelope')

const definition = {
  description: '查询异步派发的子 Agent 状态。仅当 sessions_spawn 使用 wait_for_result=false 时有效；running 时轮询直至 completed/failed。',
  parameters: {
    type: 'object',
    properties: {
      sub_session_id: { type: 'string', description: 'sessions_spawn 返回的 sub_session_id' }
    },
    required: ['sub_session_id']
  }
}

function createSessionsSubagentPollTool() {
  return {
    definition,
    execute: async (args = {}) => {
      const { poll } = require('../subagent-async-outcomes')
      const sid = String(args.sub_session_id || args.subSessionId || '').trim()
      if (!sid) {
        return { success: false, error: '缺少 sub_session_id' }
      }
      const polled = poll(sid)
      if (polled.status === 'unknown') {
        return { success: false, error: polled.error || '未知 sub_session_id', ...polled }
      }
      if (polled.status === 'running') {
        return {
          success: true,
          status: 'running',
          message: '子 Agent 仍在运行，请稍后再次调用本工具。',
          ...polled
        }
      }
      const full = polled.fullOut && typeof polled.fullOut === 'object' ? polled.fullOut : {}
      const envelope = polled.envelope || full.envelope || buildExecutionEnvelope(full, full.runtime || 'internal')
      return {
        success: !!(polled.success !== false && full.success !== false),
        status: polled.status,
        message: envelope.summary,
        envelope,
        result: full.result,
        error: full.error,
        sub_session_id: full.subSessionId || polled.sub_session_id || sid,
        command_logs: full.commandLogs,
        runtime: full.runtime
      }
    }
  }
}

module.exports = { definition, createSessionsSubagentPollTool }
