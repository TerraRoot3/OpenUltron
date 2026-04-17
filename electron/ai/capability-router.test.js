const {
  detectRequestedExternalRuntime,
  detectCapability,
  computeCapabilitySignals,
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

  it('resolveCapabilityRoute logs structured decision when logger provided', () => {
    const calls = []
    const logger = {
      info: (tag, payload) => {
        calls.push({ tag, payload })
      }
    }
    resolveCapabilityRoute({ text: '打包 zip 发我', runtime: '' }, logger)
    expect(calls.length).toBe(1)
    expect(calls[0].tag).toBe('[CapabilityRoute]')
    expect(calls[0].payload.capability).toBe('artifact')
    expect(calls[0].payload.deliveryPolicy).toBe('auto_send')
  })

  it('computeCapabilitySignals collects parallel keyword hits', () => {
    expect(computeCapabilitySignals('')).toEqual([])
    const mixed = computeCapabilitySignals('飞书文档里多维表格记录导出 zip 打包')
    expect(mixed).toContain('docs')
    expect(mixed).toContain('bitable')
    expect(mixed).toContain('bitable_records')
    expect(mixed).toContain('artifact')
    const ext = computeCapabilitySignals('用 codex 写页面')
    expect(ext).toContain('runtime:external:codex')
  })

  it('resolveCapabilityRoute merges runtime and policies', () => {
    const r = resolveCapabilityRoute({ text: '用 codex 跑一下', runtime: '' })
    expect(r.executionMode).toBe('external:codex')
    expect(r.explicitExternal).toBe(true)
    expect(r.capability).toBe('general')

    const alias = resolveCapabilityRoute({ text: '先用网关 继续', runtime: 'external:gateway_cli' })
    expect(alias.executionMode).toBe('external:gateway')

    const r2 = resolveCapabilityRoute({ text: '飞书写文档', runtime: 'internal' })
    expect(r2.executionMode).toBe('internal')
    expect(r2.capability).toBe('docs')
    expect(r2.riskLevel).toBe('confirm_required')
    expect(r2.deliveryPolicy).toBe('defer')

    const r3 = resolveCapabilityRoute({ text: '导出文件下载', runtime: '' })
    expect(r3.deliveryPolicy).toBe('auto_send')
    expect(Array.isArray(r3.capabilitySignals)).toBe(true)
    expect(r3.capabilitySignals).toContain('artifact')
  })
})
