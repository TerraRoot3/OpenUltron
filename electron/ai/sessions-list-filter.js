function isRunSessionId(id) {
  return /-run-\d+$/.test(String(id || ''))
}

function normalizeRootSessionId(id) {
  return String(id || '').replace(/-run-\d+$/, '')
}

function sourceGroupKey(session) {
  const source = session && session.source ? String(session.source) : ''
  const rawId = session && session.id ? String(session.id) : ''
  const id = normalizeRootSessionId(rawId)
  if (source === 'feishu') {
    const m = id.match(/^feishu-(.+)-\d+$/)
    return `feishu:${m ? m[1] : id}`
  }
  if (source === 'telegram') {
    const m = id.match(/^telegram-(.+)-\d+$/)
    return `telegram:${m ? m[1] : id}`
  }
  return `${source}:${id}`
}

// 主会话只展示一条（最新）；飞书/Telegram 按 chat 聚合，每个 chat 只展示一条；
// 其中 -run- 子会话不应出现在会话列表（它们是执行中间态）
function filterSessionsList(raw) {
  let mainSeen = false
  const groupSeen = new Set()
  return (Array.isArray(raw) ? raw : []).filter((s) => {
    if (!s || typeof s !== 'object') return false
    if (s.source === 'main') {
      if (mainSeen) return false
      mainSeen = true
      return true
    }
    if ((s.source === 'feishu' || s.source === 'telegram') && isRunSessionId(s.id)) {
      return false
    }
    const key = sourceGroupKey(s)
    if (groupSeen.has(key)) return false
    groupSeen.add(key)
    return true
  })
}

module.exports = {
  filterSessionsList,
  isRunSessionId,
  normalizeRootSessionId,
  sourceGroupKey
}

