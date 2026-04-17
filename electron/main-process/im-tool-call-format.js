'use strict'

function parseToolCallArgs(rawArgs) {
  if (rawArgs == null) return null
  if (typeof rawArgs === 'object') return rawArgs
  if (typeof rawArgs !== 'string') return null
  try {
    return JSON.parse(rawArgs)
  } catch (_) {
    return null
  }
}

function formatCommandFromToolCall(tc) {
  try {
    const name = String(tc?.name || '').trim() || 'unknown'
    const args = parseToolCallArgs(tc?.arguments)
    const readStr = (v) => (typeof v === 'string' ? v.trim() : '')
    if (name === 'execute_command') {
      const cmd = readStr(args?.command || args?.cmd || args?.script)
      return cmd ? `- ${cmd}` : `- 调用 ${name}`
    }
    if (name === 'file_operation') {
      const action = readStr(args?.action) || 'run'
      const target = readStr(args?.path || args?.target || '')
      return target ? `- file_operation ${action} ${target}` : `- file_operation ${action}`
    }
    if (name.startsWith('mcp__')) {
      const body = name.slice('mcp__'.length)
      const idx = body.indexOf('__')
      const pretty = idx >= 0 ? `mcp/${body.slice(0, idx)}/${body.slice(idx + 2)}` : `mcp/${body}`
      return `- ${pretty}`
    }
    if (name.startsWith('webapp__')) {
      const body = name.slice('webapp__'.length)
      const idx = body.indexOf('__')
      const pretty = idx >= 0 ? `webapp/${body.slice(0, idx)}/${body.slice(idx + 2)}` : `webapp/${body}`
      return `- ${pretty}`
    }
    if (name === 'sessions_spawn') {
      const runtimeRaw = readStr(args?.runtime || args?.provider_runtime || args?.agent_runtime)
      const runtime = runtimeRaw === 'gateway_cli' ? 'gateway' : runtimeRaw
      const role = readStr(args?.role_name || args?.role || args?.agent_role)
      const profile = readStr(args?.agent_profile || args?.profile)
      const provider = readStr(args?.provider)
      const model = readStr(args?.model || args?.model_name)
      const desc = [runtime && `runtime=${runtime}`, role && `role=${role}`, provider && `provider=${provider}`, model && `model=${model}`, profile && `profile=${profile}`].filter(Boolean)
      return `- sessions_spawn${desc.length ? ` ${desc.join(' ')}` : ''}`
    }
    if (name === 'web_apps_list') {
      return '- web_apps_list'
    }
    if (name === 'web_apps_create') {
      const n = readStr(args?.name)
      return n ? `- web_apps_create ${n}` : '- web_apps_create'
    }
    if (name === 'webapp_studio_invoke') {
      const aid = readStr(args?.app_id)
      const ver = readStr(args?.version)
      const p = readStr(args?.project_path)
      const hint = readStr(args?.app_hint)
      if (args?.create_new === true) return '- webapp_studio_invoke create_new'
      if (hint) return '- webapp_studio_invoke hint=…'
      if (aid && ver) return `- webapp_studio_invoke ${aid}@${ver}`
      if (p) return `- webapp_studio_invoke path=…`
      return '- webapp_studio_invoke'
    }
    return `- ${name}`
  } catch (_) {
    return '- 调用工具'
  }
}

module.exports = { parseToolCallArgs, formatCommandFromToolCall }
