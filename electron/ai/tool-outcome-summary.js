/**
 * 从会话消息中抽取工具失败摘要，供会话蒸馏等使用（与 execution-envelope 错误码语义对齐）
 */
const { normalizeErrorCode } = require('./execution-envelope')

function parseToolContent(msg) {
  let raw = msg && msg.content
  if (raw == null) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  const s = typeof raw === 'string' ? raw : String(raw)
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function toolCallIdToNameMap(messages) {
  const map = new Map()
  if (!Array.isArray(messages)) return map
  for (const m of messages) {
    if (!m || m.role !== 'assistant') continue
    const tcs = m.tool_calls || m.toolCalls || []
    for (const tc of tcs) {
      const id = tc.id || tc.tool_call_id
      const name = (tc.function && tc.function.name) || tc.name || ''
      if (id) map.set(String(id), String(name || 'tool'))
    }
  }
  return map
}

function isToolFailure(obj) {
  if (!obj || typeof obj !== 'object') return false
  if (obj.envelope && obj.envelope.success === false) return true
  if (obj.success === false) return true
  if (obj.success === true) return false
  if (typeof obj.error === 'string' && obj.error.trim()) return true
  if (obj.error && typeof obj.error === 'object') return true
  return false
}

function extractFailureCode(obj) {
  if (!obj || typeof obj !== 'object') return normalizeErrorCode('')
  if (obj.error && typeof obj.error === 'object' && obj.error.code) {
    return String(obj.error.code).trim() || normalizeErrorCode('')
  }
  if (obj.envelope && obj.envelope.error && obj.envelope.error.code) {
    return String(obj.envelope.error.code).trim() || normalizeErrorCode('')
  }
  const msg =
    typeof obj.error === 'string'
      ? obj.error
      : obj.error && typeof obj.error === 'object' && obj.error.message
        ? String(obj.error.message)
        : ''
  return normalizeErrorCode(msg)
}

function extractFailureMessage(obj) {
  if (!obj) return ''
  if (typeof obj.error === 'string') return obj.error.slice(0, 400)
  if (obj.error && typeof obj.error === 'object' && obj.error.message) {
    return String(obj.error.message).slice(0, 400)
  }
  if (obj.envelope && obj.envelope.error && obj.envelope.error.message) {
    return String(obj.envelope.error.message).slice(0, 400)
  }
  return ''
}

/**
 * @param {Array} messages - 与会话落库格式一致（含 role:tool / tool_calls）
 * @param {{ maxItems?: number, maxChars?: number }} opts
 * @returns {string} 多行文本，无失败时为空串
 */
function summarizeToolFailuresFromMessages(messages, opts = {}) {
  const maxItems = Number(opts.maxItems) > 0 ? Number(opts.maxItems) : 12
  const maxChars = Number(opts.maxChars) > 0 ? Number(opts.maxChars) : 2400
  if (!Array.isArray(messages) || messages.length === 0) return ''
  const idToName = toolCallIdToNameMap(messages)
  const rows = []
  for (const m of messages) {
    if (!m || m.role !== 'tool') continue
    const obj = parseToolContent(m)
    if (!obj || !isToolFailure(obj)) continue
    const tid = String(m.tool_call_id || m.toolCallId || '').trim()
    const name = idToName.get(tid) || 'tool'
    const code = extractFailureCode(obj)
    let msg = extractFailureMessage(obj).replace(/\s+/g, ' ').trim()
    if (!msg && typeof obj.result === 'string') msg = obj.result.replace(/\s+/g, ' ').trim().slice(0, 280)
    rows.push(`- ${name} [${code}] ${msg}`)
    if (rows.length >= maxItems) break
  }
  let out = rows.join('\n')
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}…`
  return out
}

module.exports = {
  summarizeToolFailuresFromMessages,
  extractFailureCode,
  isToolFailure
}
