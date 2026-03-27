const { resolveDeterministicOutboundText } = require('./outbound-result-text')

describe('outbound-result-text', () => {
  const deps = {
    stripToolProtocolAndJsonNoise: (text) => String(text || '').trim(),
    hasUsefulVisibleResult: (text) => {
      const t = String(text || '')
      if (!t.trim()) return false
      if (/我现在开始执行|开始操作中/.test(t)) return false
      return true
    },
    stripFalseDeliveredClaims: (text) => String(text || '')
  }

  it('picks the first useful candidate', () => {
    const text = resolveDeterministicOutboundText({
      ...deps,
      candidates: ['我现在开始执行', '已完成，产物路径：/tmp/a.png'],
      channel: 'feishu'
    })
    expect(text).toBe('已完成，产物路径：/tmp/a.png')
  })

  it('falls back to deterministic placeholder when no useful result', () => {
    const text = resolveDeterministicOutboundText({
      ...deps,
      candidates: ['我现在开始执行', '开始操作中'],
      channel: 'feishu'
    })
    expect(text).toBe('任务已执行完成，但未生成可展示的文本结果。')
  })

  it('prefers artifact placeholder when images/files exist', () => {
    const imgText = resolveDeterministicOutboundText({
      ...deps,
      candidates: ['我现在开始执行'],
      channel: 'feishu',
      hasImages: true
    })
    const fileText = resolveDeterministicOutboundText({
      ...deps,
      candidates: ['我现在开始执行'],
      channel: 'feishu',
      hasFiles: true
    })
    expect(imgText).toBe('截图已发至当前会话。')
    expect(fileText).toBe('文件已发至当前会话。')
  })
})
