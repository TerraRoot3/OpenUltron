/**
 * 主窗口 Chat 首条 system 中**仅保留**父级传入的补充说明（如应用工作室模板、页面级 props）。
 * 当前日期、技能细则、项目 AGENT.md、应用边界等均由主进程 `orchestrator` memParts 注入（M5）。
 */

/**
 * @param {object} [opts]
 * @param {boolean} [opts.studioSandboxMode] 预留；与主进程沙箱提示配合，不改变拼接逻辑
 * @param {string} [opts.parentSystemPrompt]
 * @returns {string|undefined}
 */
export function buildRendererSystemSupplement(opts = {}) {
  const parent = String(opts.parentSystemPrompt || '').trim()
  return parent || undefined
}
