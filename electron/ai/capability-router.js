function detectRequestedExternalRuntime(text = '') {
  const t = String(text || '').toLowerCase()
  if (!t) return ''
  // 仅在“明确指定执行引擎”时触发外派，避免把任务正文里的产品名误判为 runtime 指令
  if (/(?:用|走|指定|切到|改用|让|调用)\s*codex|use\s+codex|with\s+codex|runtime\s*[:=]\s*external:codex/.test(t)) return 'external:codex'
  if (/(?:用|走|指定|切到|改用|让|调用)\s*claude|use\s+claude|with\s+claude|runtime\s*[:=]\s*external:claude/.test(t)) return 'external:claude'
  if (/(?:用|走|指定|切到|改用|让|调用)\s*(?:gateway\s*cli|网关\s*助手)|use\s+gateway|runtime\s*[:=]\s*external:gateway_cli/.test(t)) return 'external:gateway_cli'
  if (/(?:用|走|指定|切到|改用|让|调用)\s*opencode|use\s+opencode|with\s+opencode|runtime\s*[:=]\s*external:opencode/.test(t)) return 'external:opencode'
  return ''
}

/**
 * 与 detectCapability 规则对齐的多路信号，用于日志与后续路由对照（不改变主 capability 判定顺序）
 * @returns {string[]}
 */
function computeCapabilitySignals(text = '') {
  const t = String(text || '').toLowerCase()
  if (!t) return []
  const signals = []
  if (/(飞书|feishu).*(文档|doc|docx|写|改|润色|重写|周报|报告|会议纪要)|((写|改|润色|重写).*(飞书|文档|docx?))/.test(t)) {
    signals.push('docs')
  }
  if (/(多维表格|bitable)/.test(t)) signals.push('bitable')
  if (/(记录|字段|数据表)/.test(t)) signals.push('bitable_records')
  if (/(表格|sheet|sheets|电子表格|单元格)/.test(t)) signals.push('sheets')
  if (/(截图|screenshot|网页|打开页面|浏览器)/.test(t)) signals.push('browser')
  if (/(打包|zip|压缩|发文件|发送文件|下载文件|导出)/.test(t)) signals.push('artifact')
  const ext = detectRequestedExternalRuntime(text)
  if (ext) signals.push(`runtime:${ext}`)
  return signals
}

function detectCapability(text = '') {
  const t = String(text || '').toLowerCase()
  if (!t) return 'general'
  if (/(飞书|feishu).*(文档|doc|docx|写|改|润色|重写|周报|报告|会议纪要)|((写|改|润色|重写).*(飞书|文档|docx?))/.test(t)) return 'docs'
  // 多维表格含「表格」字样，须先于普通电子表格规则匹配
  if (/(多维表格|bitable)/.test(t)) return 'bitable'
  if (/(表格|sheet|sheets|电子表格|单元格)/.test(t)) return 'sheets'
  if (/(记录|字段|数据表)/.test(t)) return 'bitable'
  if (/(截图|screenshot|网页|打开页面|浏览器)/.test(t)) return 'browser'
  if (/(打包|zip|压缩|发文件|发送文件|下载文件|导出)/.test(t)) return 'artifact'
  return 'general'
}

/**
 * @param {{ text?: string, runtime?: string }} input
 * @param {{ info?: (tag: string, payload: object) => void }} [logger] - 传入 appLogger 时写结构化 RouteDecision 日志（D2）
 */
function resolveCapabilityRoute(input = {}, logger) {
  const text = input.text != null ? String(input.text) : ''
  const runtime = input.runtime != null ? String(input.runtime) : ''
  const requestedRuntime = String(runtime || '').trim().toLowerCase()
  const explicitExternal = detectRequestedExternalRuntime(text)
  const capability = detectCapability(text)
  const capabilitySignals = computeCapabilitySignals(text)
  let executionMode = 'internal'
  if (requestedRuntime) executionMode = requestedRuntime
  else if (explicitExternal) executionMode = explicitExternal
  else executionMode = 'internal'

  const deliveryPolicy = capability === 'artifact' || capability === 'browser' ? 'auto_send' : 'defer'
  const riskLevel = capability === 'docs' || capability === 'bitable' ? 'confirm_required' : 'safe'
  const result = {
    capability,
    capabilitySignals,
    executionMode,
    deliveryPolicy,
    riskLevel,
    explicitExternal: !!explicitExternal,
    externalRuntime: explicitExternal || ''
  }
  if (logger && typeof logger.info === 'function') {
    try {
      logger.info('[CapabilityRoute]', {
        capability: result.capability,
        capabilitySignals: result.capabilitySignals,
        executionMode: result.executionMode,
        deliveryPolicy: result.deliveryPolicy,
        riskLevel: result.riskLevel,
        explicitExternal: result.explicitExternal,
        externalRuntime: result.externalRuntime || undefined,
        runtimeArg: runtime.slice(0, 120),
        textLen: text.length,
        textPreview: text.slice(0, 200)
      })
    } catch (_) {}
  }
  return result
}

module.exports = {
  detectRequestedExternalRuntime,
  detectCapability,
  computeCapabilitySignals,
  resolveCapabilityRoute
}
