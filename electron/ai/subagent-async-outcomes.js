'use strict'

/** 异步 sessions_spawn 的结果缓存（供 sessions_subagent_poll） */
const MAX_ENTRIES = 200
/** @type {Map<string, object>} */
const outcomes = new Map()

function pruneIfNeeded() {
  while (outcomes.size > MAX_ENTRIES) {
    const k = outcomes.keys().next().value
    outcomes.delete(k)
  }
}

/**
 * @param {string} subSessionId
 * @param {{ parentSessionId?: string, parentRunId?: string, taskPreview?: string }} meta
 */
function markPending(subSessionId, meta = {}) {
  pruneIfNeeded()
  const id = String(subSessionId || '').trim()
  if (!id) return
  outcomes.set(id, {
    state: 'running',
    startedAt: Date.now(),
    parentSessionId: meta.parentSessionId || '',
    parentRunId: meta.parentRunId || '',
    taskPreview: meta.taskPreview || ''
  })
}

/**
 * @param {string} subSessionId
 * @param {object} out — runSubChat 完整返回
 */
function complete(subSessionId, out) {
  pruneIfNeeded()
  const id = String(subSessionId || '').trim()
  if (!id) return
  const ok = !!(out && out.success !== false && !out.error)
  outcomes.set(id, {
    state: ok ? 'completed' : 'failed',
    finishedAt: Date.now(),
    result: out || {}
  })
}

/**
 * @param {string} subSessionId
 */
function poll(subSessionId) {
  const id = String(subSessionId || '').trim()
  if (!id) {
    return { status: 'unknown', error: '缺少 sub_session_id' }
  }
  const o = outcomes.get(id)
  if (!o) {
    return { status: 'unknown', error: '未找到该 sub_session_id（可能未使用 wait_for_result=false、已过期或已清理）' }
  }
  if (o.state === 'running') {
    return {
      status: 'running',
      started_at: o.startedAt,
      parent_session_id: o.parentSessionId || undefined,
      parent_run_id: o.parentRunId || undefined,
      task_preview: o.taskPreview || undefined
    }
  }
  const r = o.result || {}
  return {
    status: o.state,
    success: !!(r && r.success !== false),
    result: r.result,
    error: r.error,
    envelope: r.envelope,
    sub_session_id: r.subSessionId != null ? String(r.subSessionId) : id,
    command_logs: r.commandLogs,
    runtime: r.runtime,
    attempted_runtimes: r.attemptedRuntimes,
    /** 完整 runSubChat 返回，供工具层兜底 */
    fullOut: r
  }
}

function resetForTests() {
  outcomes.clear()
}

module.exports = {
  markPending,
  complete,
  poll,
  resetForTests
}
