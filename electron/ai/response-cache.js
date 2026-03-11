/**
 * LLM 响应缓存：同一会话内，若当前用户消息与上一轮完全一致且上一轮为纯 Q&A（无工具调用），
 * 直接返回上一轮回复，不请求 API，减少重复 token。
 * 仅内存缓存，最多保留 50 个会话的上一轮，过期 10 分钟。
 */
const MAX_SESSIONS = 50
const TTL_MS = 10 * 60 * 1000 // 10 分钟

const cache = new Map() // sessionId -> { userContent, assistantContent, timestamp }

function normalizeUserContent(content) {
  if (content == null) return ''
  const s = typeof content === 'string' ? content : JSON.stringify(content)
  return s.trim()
}

function get(sessionId, currentUserContent) {
  const key = normalizeUserContent(currentUserContent)
  if (!key) return null
  const entry = cache.get(sessionId)
  if (!entry || entry.userContent !== key) return null
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(sessionId)
    return null
  }
  return entry.assistantContent
}

function set(sessionId, userContent, assistantContent) {
  const key = normalizeUserContent(userContent)
  if (!key || !assistantContent) return
  if (cache.size >= MAX_SESSIONS && !cache.has(sessionId)) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  cache.set(sessionId, {
    userContent: key,
    assistantContent,
    timestamp: Date.now()
  })
}

/**
 * 仅当上一轮是纯 Q&A（无工具调用）时才可缓存：即 last assistant message 无 tool_calls
 */
function canCacheFromMessages(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'assistant') {
      return !(m.tool_calls && m.tool_calls.length > 0)
    }
    if (m.role === 'user') return false
  }
  return false
}

function getLastUserContent(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const c = messages[i].content
      return typeof c === 'string' ? c : (c ? JSON.stringify(c) : '')
    }
  }
  return ''
}

module.exports = {
  get,
  set,
  canCacheFromMessages,
  getLastUserContent
}
