'use strict'

const path = require('path')
const fs = require('fs')
const { getAppRootPath } = require('../app-root')

/**
 * @typedef {object} AgentProfileResolved
 * @property {string} id
 * @property {string} [description]
 * @property {string} [prompt]
 * @property {string[]} [tools_allow] — 若非空则仅保留这些工具名（精确匹配 function.name）
 * @property {string[]} [tools_deny]
 * @property {string} [model]
 * @property {number} [max_turns] — 映射到 orchestrator maxToolIterations
 * @property {boolean} [inherit_identity]
 */

const BUILTIN = {
  executor: {
    id: 'executor',
    description: '通用执行：与默认子 Agent 相近，不额外裁剪工具。',
    tools_allow: null,
    tools_deny: [],
    model: null,
    max_turns: 0,
    inherit_identity: false,
    prompt: ''
  },
  read_only_fast: {
    id: 'read_only_fast',
    description: '只读探索：禁止直接写仓库与 git 变更。',
    tools_allow: null,
    tools_deny: [
      'file_operation',
      'apply_patch',
      'git_operation',
      'web_apps_create',
      'webapp_studio_invoke',
      'install_skill'
    ],
    model: null,
    max_turns: 48,
    inherit_identity: false,
    prompt: '优先用只读方式（搜索、读文件）完成任务；若必须写入，请在回复中说明需由主会话或 executor 执行。'
  },
  coordinator: {
    id: 'coordinator',
    description: '编排：仅含委派、列表与读类工具；嵌套 sessions_spawn 需 maxSpawnDepth≥2 且仅本 profile 的子会话可再 spawn（见 agent-orchestration-redesign §3.3）。',
    tools_allow: [
      'sessions_spawn',
      'sessions_subagent_poll',
      'verify_provider_model',
      'list_configured_models',
      'list_providers_and_models',
      'read_app_log',
      'analyze_project',
      'query_command_log',
      'sessions_list',
      'sessions_history',
      'file_operation',
      'get_skill',
      'memory_search',
      'memory_get',
      'artifact_search',
      'web_fetch',
      'web_search',
      'read_lessons_learned',
      'user_confirmation',
      'feishu_doc_capability',
      'feishu_bitable_capability',
      'feishu_sheets_capability',
      'stop_current_task'
    ],
    tools_deny: [],
    model: null,
    max_turns: 64,
    inherit_identity: false,
    prompt: '你是子任务编排角色：拆分步骤、委派执行（sessions_spawn）、汇总结果；不要冒充主会话对用户做最终渠道承诺。嵌套委派前确认子会话为 coordinator 且配置允许深度≥2。'
  }
}

function parseSimpleFrontmatter(raw) {
  const text = String(raw || '')
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/)
  if (!m) return { meta: {}, body: text.trim() }
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/)
    if (!kv) continue
    const k = kv[1].trim()
    let v = kv[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    meta[k] = v
  }
  return { meta, body: m[2].trim() }
}

function parseList(val) {
  if (!val || typeof val !== 'string') return []
  return val
    .split(/[,，]/)
    .map((x) => String(x || '').trim())
    .filter(Boolean)
}

/**
 * @param {string} projectPath
 * @param {string} profileId
 * @returns {AgentProfileResolved | null}
 */
function loadProfileFromDisk(projectPath, profileId) {
  const id = String(profileId || '').trim()
  if (!id) return null
  const safe = id.replace(/[^a-zA-Z0-9_\-]/g, '')
  if (safe !== id) return null
  const fname = `${safe}.md`
  const candidates = []
  const pp = String(projectPath || '').trim()
  if (pp && pp !== '__main_chat__' && path.isAbsolute(pp)) {
    candidates.push(path.join(pp, '.openultron', 'agents', fname))
  }
  candidates.push(getAppRootPath('agents', fname))
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const raw = fs.readFileSync(p, 'utf-8')
      const { meta, body } = parseSimpleFrontmatter(raw)
      return {
        id: meta.name || safe,
        description: meta.description || '',
        prompt: body,
        tools_allow: meta.tools_allow ? parseList(meta.tools_allow) : null,
        tools_deny: meta.tools_deny ? parseList(meta.tools_deny) : [],
        model: meta.model ? String(meta.model).trim() : null,
        max_turns: meta.max_turns ? parseInt(meta.max_turns, 10) : 0,
        inherit_identity: meta.inherit_identity === 'true' || meta.inherit_identity === true
      }
    } catch (_) {
      continue
    }
  }
  return null
}

/**
 * @param {string} profileId
 * @param {string} projectPath
 * @returns {AgentProfileResolved | null}
 */
function resolveAgentProfile(profileId, projectPath) {
  const id = String(profileId || '').trim()
  if (!id) return null
  if (BUILTIN[id]) {
    return { ...BUILTIN[id] }
  }
  return loadProfileFromDisk(projectPath, id)
}

/**
 * @param {object[]} tools
 * @param {AgentProfileResolved | null} profile
 * @returns {object[]}
 */
function filterToolsByProfile(tools, profile) {
  if (!profile || !Array.isArray(tools)) return tools
  const allow = profile.tools_allow && profile.tools_allow.length > 0 ? new Set(profile.tools_allow) : null
  const deny = new Set((profile.tools_deny || []).map((x) => String(x).trim()).filter(Boolean))
  return tools.filter((t) => {
    const name = String(t?.function?.name || '').trim()
    if (!name) return false
    if (deny.has(name)) return false
    if (allow && !allow.has(name)) {
      if (profile.id === 'coordinator' && /^mcp__chrome[-_]devtools__/.test(name)) return true
      return false
    }
    return true
  })
}

function isProfileAllowed(profileId, allowedList) {
  const id = String(profileId || '').trim()
  if (!id) return true
  const list = Array.isArray(allowedList) ? allowedList : ['*']
  if (list.includes('*')) return true
  return list.includes(id)
}

module.exports = {
  BUILTIN_PROFILES: BUILTIN,
  resolveAgentProfile,
  filterToolsByProfile,
  isProfileAllowed,
  loadProfileFromDisk,
  parseSimpleFrontmatter
}
