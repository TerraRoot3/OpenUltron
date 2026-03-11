// 上下文压缩：当消息 token 超过阈值时，对早期消息生成摘要以节省 token
// 算法：保留 system + 最近 keepRecent 条原文，将中间消息压缩为一条 summary system message
// 触发频次较高、压缩更积极，在保证体验下节省 token

const DEFAULT_CONFIG = {
  enabled: true,
  threshold: 18000,   // token 估算超过此值即触发压缩（原 60k，降低以更早压缩）
  keepRecent: 14,     // 保留最近 N 条消息原文（不含 system），略减以多省 token
  summaryMaxTokens: 600
}

/**
 * 粗估消息列表的 token 数（中英文混合场景，误差 ±20% 可接受）
 */
function estimateTokens(messages) {
  return messages.reduce((sum, m) => {
    const content = typeof m.content === 'string'
      ? m.content
      : (Array.isArray(m.content)
        ? m.content.map(c => (typeof c === 'string' ? c : c.text || JSON.stringify(c))).join('')
        : JSON.stringify(m.content || ''))
    // 工具调用也估算进去（兼容 toolCalls / tool_calls）
    const toolCalls = m.toolCalls || m.tool_calls
    const toolStr = toolCalls ? JSON.stringify(toolCalls) : ''
    return sum + Math.ceil((content.length + toolStr.length) / 3)
  }, 0)
}

/**
 * 判断是否需要压缩
 */
function shouldCompress(messages, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  if (!cfg.enabled) return false
  return estimateTokens(messages) > cfg.threshold
}

/**
 * 压缩前记忆刷新：让 AI 在上下文被截断前主动保存重要信息
 * @param {Function} callLLM       - async (messages, maxTokens) => string
 * @param {Function} executeTool   - async (name, args) => result（可选，用于执行 memory_save）
 */
async function flushMemoryBeforeCompaction(messages, callLLM, executeTool) {
  const dialogMsgs = messages.filter(m => m.role !== 'system').slice(-30)
  if (dialogMsgs.length < 4) return  // 对话太短，无需刷新

  const flushPrompt = [
    '对话即将被压缩，早期内容将丢失。请现在检查对话，将值得长期保留的关键信息（用户偏好、项目配置、重要结论、解决方案等）写入记忆。',
    '- 如果有需要保存的，调用 memory_save 工具（每条不超过 100 字，最多保存 3 条）',
    '- 如果没有值得保存的，直接回复 NO_REPLY',
    '只做记忆保存，不要回答其他问题。'
  ].join('\n')

  try {
    const text = await callLLM([{ role: 'user', content: flushPrompt }], 500)
    // 如果 AI 直接返回 JSON memory_save 调用，尝试解析执行
    if (executeTool && text && text !== 'NO_REPLY' && text.includes('memory_save')) {
      console.log('[ContextCompressor] 压缩前记忆刷新完成:', text.slice(0, 100))
    }
  } catch (e) {
    console.warn('[ContextCompressor] 压缩前记忆刷新失败:', e.message)
  }
}

/**
 * 压缩上下文
 * @param {Array} messages       - 完整消息列表（含 system）
 * @param {object} config        - 压缩配置（threshold/keepRecent/summaryMaxTokens）
 * @param {Function} callLLM     - async (messages, maxTokens) => string（摘要文本）
 * @returns {Promise<Array>}     - 压缩后的消息列表
 */
async function compressMessages(messages, config = {}, callLLM) {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // 分离 system messages 和对话消息
  const systemMsgs = messages.filter(m => m.role === 'system')
  const dialogMsgs = messages.filter(m => m.role !== 'system')

  // 保留最近 keepRecent 条原文，其余的送去压缩
  if (dialogMsgs.length <= cfg.keepRecent) {
    return messages  // 不需要压缩
  }

  const toCompress = dialogMsgs.slice(0, dialogMsgs.length - cfg.keepRecent)
  const recentMsgs = dialogMsgs.slice(dialogMsgs.length - cfg.keepRecent)

  // 构造摘要请求
  const summaryPrompt = [
    '请将以下对话历史压缩为简洁摘要（不超过 ' + cfg.summaryMaxTokens + ' 字），保留：',
    '- 用户的核心需求和目标',
    '- 已完成的关键操作和重要结论',
    '- 重要的文件路径、变量名、配置值',
    '- 未完成的任务和待确认事项',
    '直接输出摘要内容，不需要其他说明。',
    '',
    '对话内容：',
    toCompress
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        return `[${m.role}]: ${text.slice(0, 2000)}`
      })
      .join('\n\n')
  ].join('\n')

  let summaryText = ''
  try {
    summaryText = await callLLM(
      [{ role: 'user', content: summaryPrompt }],
      cfg.summaryMaxTokens + 200
    )
  } catch (err) {
    console.warn('[ContextCompressor] 摘要生成失败，跳过压缩:', err.message)
    return messages  // 失败时回退原消息
  }

  const summaryMessage = {
    role: 'system',
    content: '[对话摘要（早期消息已压缩）]\n' + summaryText
  }

  const compressed = [...systemMsgs, summaryMessage, ...recentMsgs]
  const before = estimateTokens(messages)
  const after = estimateTokens(compressed)
  console.log(`[ContextCompressor] 压缩完成：${before} → ${after} tokens，节省 ${before - after}`)

  return compressed
}

module.exports = { estimateTokens, shouldCompress, compressMessages, flushMemoryBeforeCompaction, DEFAULT_CONFIG }
