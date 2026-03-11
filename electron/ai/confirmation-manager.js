const pending = new Map()

function createRequest({
  confirmId,
  sessionId = '',
  channel = 'main',
  remoteId = '',
  message = '',
  severity = 'warning',
  inputDefault = '',
  allowPush = false
} = {}) {
  const id = String(confirmId || `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  const req = {
    confirmId: id,
    sessionId: String(sessionId || ''),
    channel: String(channel || 'main'),
    remoteId: String(remoteId || ''),
    message: String(message || ''),
    severity: String(severity || 'warning'),
    inputDefault: String(inputDefault || ''),
    allowPush: !!allowPush,
    createdAt: Date.now(),
    resolved: false,
    _resolve: null,
    _timeout: null
  }
  pending.set(id, req)
  return req
}

function wait(confirmId, timeoutMs = 10 * 60 * 1000) {
  const id = String(confirmId || '')
  const req = pending.get(id)
  if (!req) {
    return Promise.resolve({ confirmed: false, user_input: '', push_after_commit: false, message: '确认请求不存在或已结束' })
  }
  return new Promise((resolve) => {
    req._resolve = resolve
    if (timeoutMs > 0) {
      req._timeout = setTimeout(() => {
        resolveById(id, {
          confirmed: false,
          user_input: '',
          push_after_commit: false,
          message: '确认超时，操作已取消'
        })
      }, timeoutMs)
    }
  })
}

function resolveById(confirmId, payload = {}) {
  const id = String(confirmId || '')
  const req = pending.get(id)
  if (!req || req.resolved) return false
  req.resolved = true
  if (req._timeout) clearTimeout(req._timeout)
  pending.delete(id)
  const out = {
    confirmed: !!payload.confirmed,
    user_input: String(payload.user_input || payload.userInput || ''),
    push_after_commit: !!(payload.push_after_commit || payload.pushAfterCommit),
    message: String(payload.message || (payload.confirmed ? '用户已确认' : '用户已拒绝'))
  }
  try {
    if (typeof req._resolve === 'function') req._resolve(out)
  } catch (_) {}
  return true
}

function findPendingByChannelRemote(channel, remoteId) {
  const ch = String(channel || '')
  const rid = String(remoteId || '')
  for (const req of pending.values()) {
    if (req.channel === ch && req.remoteId === rid && !req.resolved) return req
  }
  return null
}

module.exports = {
  createRequest,
  wait,
  resolveById,
  findPendingByChannelRemote
}

