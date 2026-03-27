'use strict'

function resolveDeterministicOutboundText({
  candidates = [],
  stripToolProtocolAndJsonNoise,
  hasUsefulVisibleResult,
  stripFalseDeliveredClaims,
  channel = '',
  hasImages = false,
  hasFiles = false,
  explicitErrorText = ''
} = {}) {
  const sanitize = (text) => {
    const raw = String(text || '').trim()
    if (!raw) return ''
    const cleaned = String(stripToolProtocolAndJsonNoise(raw, { dropJsonEnvelope: true }) || '').trim()
    if (!cleaned) return ''
    return hasUsefulVisibleResult(cleaned) ? cleaned : ''
  }

  const firstUseful = Array.isArray(candidates)
    ? candidates.map(sanitize).find(Boolean) || ''
    : ''
  const err = String(explicitErrorText || '').trim()
  const base = firstUseful || err || (
    hasImages
      ? '截图已发至当前会话。'
      : (hasFiles ? '文件已发至当前会话。' : '任务已执行完成，但未生成可展示的文本结果。')
  )
  return String(stripFalseDeliveredClaims(base, {
    hasImages: !!hasImages,
    hasFiles: !!hasFiles,
    channel: String(channel || '')
  }) || base).trim()
}

module.exports = { resolveDeterministicOutboundText }
