/**
 * 缩减发给 LLM 的 tools 定义体积（description + JSON Schema 冗余项），减轻 prompt 与 OpenRouter 等额度压力。
 * 不修改注册表中的原始定义，每次请求单独克隆瘦身。
 */

const DEFAULT_SLIM_OPTS = {
  maxDescriptionChars: 400,
  stripSchemaExamples: true,
  maxPropertyDescriptionChars: 90
}

function shouldSlimToolDefinitions(apiBaseUrl, slimMode) {
  const mode = String(slimMode || 'openrouter').toLowerCase()
  if (mode === 'never' || mode === 'off' || mode === 'false') return false
  if (mode === 'always' || mode === 'on' || mode === 'true') return true
  // openrouter（默认）
  return /openrouter\.ai/i.test(String(apiBaseUrl || ''))
}

/**
 * 递归裁剪 schema：去掉 example(s)、缩短 description 字段
 */
function slimSchemaNode(node, opts, depth = 0) {
  if (node == null) return node
  if (depth > 48) return node
  if (Array.isArray(node)) {
    return node.map((x) => slimSchemaNode(x, opts, depth + 1))
  }
  if (typeof node !== 'object') return node

  const out = {}
  for (const [k, v] of Object.entries(node)) {
    if (opts.stripSchemaExamples && (k === 'examples' || k === 'example')) {
      continue
    }
    if (k === 'description' && typeof v === 'string' && opts.maxPropertyDescriptionChars > 0) {
      const maxP = opts.maxPropertyDescriptionChars
      out[k] = v.length > maxP ? `${v.slice(0, maxP)}…` : v
      continue
    }
    out[k] = slimSchemaNode(v, opts, depth + 1)
  }
  return out
}

/**
 * @param {Array} tools - OpenAI tools 格式 { type, function: { name, description, parameters } }
 * @param {object} toolDefConfig - mergeToolDefinitions 结果
 * @param {string} apiBaseUrl
 * @returns {Array}
 */
function slimToolsForChat(tools, toolDefConfig, apiBaseUrl) {
  const list = Array.isArray(tools) ? tools : []
  const cfg = { ...DEFAULT_SLIM_OPTS, ...(toolDefConfig && typeof toolDefConfig === 'object' ? toolDefConfig : {}) }
  const slimMode = cfg.slimMode
  if (!shouldSlimToolDefinitions(apiBaseUrl, slimMode)) {
    return list
  }

  const maxD = Number(cfg.maxDescriptionChars)
  const maxDesc = Number.isFinite(maxD) && maxD > 0 ? maxD : DEFAULT_SLIM_OPTS.maxDescriptionChars
  const maxP = Number(cfg.maxPropertyDescriptionChars)
  const maxProp = Number.isFinite(maxP) && maxP > 0 ? maxP : DEFAULT_SLIM_OPTS.maxPropertyDescriptionChars
  const strip = cfg.stripSchemaExamples !== false

  const schemaOpts = {
    stripSchemaExamples: strip,
    maxPropertyDescriptionChars: maxProp
  }

  return list.map((t) => {
    const fn = t && t.function ? t.function : {}
    const name = fn.name || ''
    let desc = typeof fn.description === 'string' ? fn.description : ''
    if (desc.length > maxDesc) {
      desc = `${desc.slice(0, maxDesc)}…`
    }
    let parameters = fn.parameters
    if (parameters && typeof parameters === 'object' && (strip || maxProp > 0)) {
      try {
        parameters = slimSchemaNode(JSON.parse(JSON.stringify(parameters)), schemaOpts, 0)
      } catch (_) {
        parameters = fn.parameters
      }
    }
    return {
      type: t.type || 'function',
      function: {
        ...fn,
        name,
        description: desc,
        parameters: parameters != null ? parameters : fn.parameters
      }
    }
  })
}

module.exports = {
  shouldSlimToolDefinitions,
  slimToolsForChat,
  DEFAULT_SLIM_OPTS
}
