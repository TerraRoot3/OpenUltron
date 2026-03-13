function detectRequestedExternalRuntime(text = '') {
  const t = String(text || '').toLowerCase()
  if (!t) return ''
  // 仅在“明确指定执行引擎”时触发外派，避免把任务正文里的产品名误判为 runtime 指令
  if (/(?:用|走|指定|切到|改用|让|调用)\s*codex|use\s+codex|with\s+codex|runtime\s*[:=]\s*external:codex/.test(t)) return 'external:codex'
  if (/(?:用|走|指定|切到|改用|让|调用)\s*claude|use\s+claude|with\s+claude|runtime\s*[:=]\s*external:claude/.test(t)) return 'external:claude'
  if (/(?:用|走|指定|切到|改用|让|调用)\s*openclaw|use\s+openclaw|with\s+openclaw|runtime\s*[:=]\s*external:openclaw/.test(t)) return 'external:openclaw'
  if (/(?:用|走|指定|切到|改用|让|调用)\s*opencode|use\s+opencode|with\s+opencode|runtime\s*[:=]\s*external:opencode/.test(t)) return 'external:opencode'
  return ''
}

function detectCapability(text = '') {
  const t = String(text || '').toLowerCase()
  if (!t) return 'general'
  if (/(飞书|feishu).*(文档|doc|docx|写|改|润色|重写|周报|报告|会议纪要)|((写|改|润色|重写).*(飞书|文档|docx?))/.test(t)) return 'docs'
  if (/(表格|sheet|sheets|电子表格|单元格)/.test(t)) return 'sheets'
  if (/(多维表格|bitable|记录|字段|数据表)/.test(t)) return 'bitable'
  if (/(截图|screenshot|网页|打开页面|浏览器)/.test(t)) return 'browser'
  if (/(打包|zip|压缩|发文件|发送文件|下载文件|导出)/.test(t)) return 'artifact'
  return 'general'
}

function resolveCapabilityRoute({ text = '', runtime = '' } = {}) {
  const requestedRuntime = String(runtime || '').trim().toLowerCase()
  const explicitExternal = detectRequestedExternalRuntime(text)
  const capability = detectCapability(text)
  let executionMode = 'internal'
  if (requestedRuntime) executionMode = requestedRuntime
  else if (explicitExternal) executionMode = explicitExternal
  else executionMode = 'internal'

  const deliveryPolicy = capability === 'artifact' || capability === 'browser' ? 'auto_send' : 'defer'
  const riskLevel = capability === 'docs' || capability === 'bitable' ? 'confirm_required' : 'safe'
  return {
    capability,
    executionMode,
    deliveryPolicy,
    riskLevel,
    explicitExternal: !!explicitExternal,
    externalRuntime: explicitExternal || ''
  }
}

module.exports = {
  detectRequestedExternalRuntime,
  detectCapability,
  resolveCapabilityRoute
}
