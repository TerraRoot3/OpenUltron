'use strict'

/**
 * 注册 `chat.session.completed`：出站产物登记、会话侧记忆、经 chatChannelRegistry 发送；失败时飞书兜底文案。
 */
function registerChannelsSessionCompletedSend(deps) {
  const {
    eventBus,
    chatChannelRegistry,
    registerArtifactsFromItems,
    rememberSessionArtifacts,
    appLogger,
    feishuNotify
  } = deps

  const seenCompletions = new Map()
  const COMPLETION_DEDUPE_TTL_MS = 24 * 1000
  const COMPLETION_MAX_CACHE = 240

  function canonicalId(raw) {
    return String(raw || '').trim().replace(/\s+/g, '')
  }

  function canonicalArtifactFingerprint(list) {
    if (!Array.isArray(list)) return ''
    return Array.from(new Set(list
      .map((i) => {
        if (!i || typeof i !== 'object') return canonicalId(i)
        return canonicalId(i.path || i.base64?.slice(0, 36) || '')
      })
      .filter(Boolean)))
      .sort()
      .join(',')
  }

  function pruneCompletionDedupeCache(now = Date.now()) {
    if (seenCompletions.size <= COMPLETION_MAX_CACHE) return
    for (const [k, ts] of seenCompletions.entries()) {
      if (now - ts > COMPLETION_DEDUPE_TTL_MS) seenCompletions.delete(k)
      if (seenCompletions.size <= COMPLETION_MAX_CACHE) break
    }
  }

  function completionFingerprint(binding, outPayload) {
    const channel = String(binding?.channel || '').trim()
    const canonicalSessionId = canonicalSessionIdForCompletion(binding)
    const messageId = String(binding?.messageId || binding?.message_id || '').trim()
    const text = String(outPayload?.text || '').replace(/\\s+/g, ' ').trim().slice(0, 1200)
    const images = canonicalArtifactFingerprint(outPayload?.images)
    const files = canonicalArtifactFingerprint(outPayload?.files)
    return `${channel}|${canonicalSessionId}|${messageId}|${text}|${images}|${files}`
  }

  function canonicalSessionIdForCompletion(binding) {
    const sid = canonicalId(binding?.sessionId || '')
    const runSessionId = canonicalId(binding?.runSessionId || '')
    const runId = canonicalId(binding?.runId || '')
    const pick = runSessionId || runId || sid
    if (!pick) return ''
    const marker = '-run-'
    const idx = pick.indexOf(marker)
    if (idx < 0) return pick
    const suffix = pick.slice(idx + marker.length)
    return suffix || pick
  }

  async function handleChatSessionCompleted(payload) {
    const { binding, payload: outPayload } = payload || {}
    if (!binding || !binding.channel) return
    const dedupeKey = completionFingerprint(binding, outPayload)
    const now = Date.now()
    const lastSeen = seenCompletions.get(dedupeKey) || 0
    if (now - lastSeen < 3000) return
    seenCompletions.set(dedupeKey, now)
    pruneCompletionDedupeCache(now)
    if (binding.sessionId && outPayload && (Array.isArray(outPayload.images) || Array.isArray(outPayload.files))) {
      try {
        const reg = registerArtifactsFromItems({
          images: Array.isArray(outPayload.images) ? outPayload.images : [],
          files: Array.isArray(outPayload.files) ? outPayload.files : [],
          context: {
            source: `${binding.channel}_outbound`,
            channel: binding.channel,
            sessionId: String(binding.sessionId || ''),
            runSessionId: '',
            messageId: '',
            chatId: String(binding.remoteId || ''),
            role: 'assistant'
          }
        })
        outPayload.images = reg.images
        outPayload.files = reg.files
      } catch (e) {
        appLogger?.warn?.('[ArtifactRegistry] register outbound payload failed', { error: e.message || String(e) })
      }
    }
    try {
      if (binding.sessionId && outPayload && (Array.isArray(outPayload.images) || Array.isArray(outPayload.files))) {
        rememberSessionArtifacts(binding.sessionId, outPayload)
      }
    } catch (_) {}
    const adapter = chatChannelRegistry.get(binding.channel)
    if (adapter && adapter.send) {
      const maxAttempts = 2
      let lastErr = null
      for (let i = 1; i <= maxAttempts; i++) {
        try {
          const res = await adapter.send(binding, outPayload || {})
          if (res && res.success === false) {
            throw new Error(res.message || res.textMessage || 'channel_send_failed')
          }
          return
        } catch (e) {
          lastErr = e
          appLogger?.warn?.('[ChatChannel] send failed', {
            channel: binding.channel,
            attempt: i,
            maxAttempts,
            remoteId: String(binding.remoteId || ''),
            error: e?.message || String(e)
          })
          if (i < maxAttempts) {
            await new Promise((r) => setTimeout(r, 900))
          }
        }
      }
      if (binding.channel === 'feishu') {
        try {
          const chatId = String(binding.remoteId || '').trim()
          if (chatId) {
            await feishuNotify.sendMessage({
              chat_id: chatId,
              text: `系统提示：本次结果同步到飞书失败（${String(lastErr?.message || '未知错误').slice(0, 160)}）。请稍后重试。`
            })
          }
        } catch (_) {}
      }
      console.error('[ChatChannel] send failed:', lastErr?.message || String(lastErr || 'unknown'))
    }
  }

  eventBus.on('chat.session.completed', handleChatSessionCompleted)
}

module.exports = { registerChannelsSessionCompletedSend }
