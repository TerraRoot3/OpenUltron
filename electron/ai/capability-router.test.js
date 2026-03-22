const {
  detectRequestedExternalRuntime,
  detectCapability,
  resolveCapabilityRoute
} = require('./capability-router')

describe('capability-router', () => {
  it('detectRequestedExternalRuntime only on explicit phrasing', () => {
    expect(detectRequestedExternalRuntime('用 codex 写页面')).toBe('external:codex')
    expect(detectRequestedExternalRuntime('use codex for this')).toBe('external:codex')
    expect(detectRequestedExternalRuntime('compare codex and gpt')).toBe('')
    expect(detectRequestedExternalRuntime('用 claude 总结')).toBe('external:claude')
    expect(detectRequestedExternalRuntime('runtime: external:opencode')).toBe('external:opencode')
  })

  it('detectCapability classifies by keywords', () => {
    expect(detectCapability('帮我在飞书写周报文档')).toBe('docs')
    expect(detectCapability('读一下 sheet1 单元格')).toBe('sheets')
    expect(detectCapability('多维表格 bitable 查询')).toBe('bitable')
    expect(detectCapability('打开网页截图')).toBe('browser')
    expect(detectCapability('打包 zip 发我')).toBe('artifact')
    expect(detectCapability('随便聊聊')).toBe('general')
  })

  it('resolveCapabilityRoute merges runtime and policies', () => {
    const r = resolveCapabilityRoute({ text: '用 codex 跑一下', runtime: '' })
    expect(r.executionMode).toBe('external:codex')
    expect(r.explicitExternal).toBe(true)
    expect(r.capability).toBe('general')

    const r2 = resolveCapabilityRoute({ text: '飞书写文档', runtime: 'internal' })
    expect(r2.executionMode).toBe('internal')
    expect(r2.capability).toBe('docs')
    expect(r2.riskLevel).toBe('confirm_required')
    expect(r2.deliveryPolicy).toBe('defer')

    const r3 = resolveCapabilityRoute({ text: '导出文件下载', runtime: '' })
    expect(r3.deliveryPolicy).toBe('auto_send')
  })
})
