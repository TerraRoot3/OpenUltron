/**
 * 命令执行单独存储：不写入对话消息，仅用于按命令聚合查看过的目录/文件，并供 AI 工具查询以支持后续进化。
 * 历史消息里只在「进行中」展示命令执行情况，保存时剥离。
 */
const path = require('path')
const fs = require('fs')
const { getAppRootPath } = require('../app-root')

const LOG_FILE = getAppRootPath('command-execution-log.json')
const MAX_ENTRIES_PER_PROJECT = 2000

function hashProjectKey(projectPath) {
  if (!projectPath) return '__general__'
  let h = 0
  for (let i = 0; i < projectPath.length; i++) {
    h = (Math.imul(31, h) + projectPath.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(16).padStart(8, '0')
}

/** 从命令字符串中尽量提取可能涉及的文件/目录路径（用于聚合） */
function extractPathsFromCommand(command, cwd) {
  const dirs = new Set()
  const files = new Set()
  if (cwd) dirs.add(cwd)
  if (!command || typeof command !== 'string') return { directories: [...dirs], files: [...files] }
  // 常见模式：cat path, grep x path, head/tail -n path, ls path, find path, cd path
  const tokens = command.split(/\s+/).filter(Boolean)
  const pathLike = /^[./~]|\.(js|ts|vue|json|md|py|html|css|mjs|cjs)$/i
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '-n' || t === '-c' || t === '-A' || t === '-B' || t === '-l') continue
    const normalized = t.replace(/^['"]|['"]$/g, '')
    if (normalized.includes('/') || pathLike.test(normalized)) {
      if (/\.(js|ts|vue|json|md|py|html|css|mjs|cjs)$/i.test(normalized)) {
        files.add(normalized)
      } else {
        dirs.add(normalized)
      }
    }
  }
  return { directories: [...dirs], files: [...files] }
}

function readLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const raw = fs.readFileSync(LOG_FILE, 'utf-8')
      const data = JSON.parse(raw)
      return typeof data === 'object' && data !== null ? data : { byProject: {} }
    }
  } catch (e) { /* ignore */ }
  return { byProject: {} }
}

function writeLog(data) {
  const dir = path.dirname(LOG_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(LOG_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * 追加一条执行记录（成功/失败），并根据命令聚合目录与文件
 */
function append(projectPath, sessionId, payload) {
  const key = hashProjectKey(projectPath)
  const data = readLog()
  if (!data.byProject[key]) {
    data.byProject[key] = { entries: [], projectPath: projectPath || '' }
  }
  const proj = data.byProject[key]
  const entry = {
    toolName: payload.toolName,
    command: payload.command,
    cwd: payload.cwd,
    success: payload.success === true,
    exitCode: payload.exitCode,
    ts: Date.now(),
    sessionId: payload.sessionId || sessionId
  }
  proj.entries.unshift(entry)
  if (proj.entries.length > MAX_ENTRIES_PER_PROJECT) {
    proj.entries = proj.entries.slice(0, MAX_ENTRIES_PER_PROJECT)
  }
  proj.lastUpdated = new Date().toISOString()
  writeLog(data)
}

/**
 * 按命令聚合：查看过哪些目录、哪些文件（去重）
 */
function getViewedPaths(projectPath) {
  const key = hashProjectKey(projectPath)
  const data = readLog()
  const proj = data.byProject[key]
  if (!proj || !proj.entries.length) {
    return { directories: [], files: [], summary: { total: 0, success: 0, failed: 0 } }
  }
  const dirs = new Set()
  const files = new Set()
  let success = 0
  let failed = 0
  for (const e of proj.entries) {
    if (e.success) success++
    else failed++
    if (e.toolName === 'execute_command' && (e.cwd || e.command)) {
      const { directories, files: f } = extractPathsFromCommand(e.command, e.cwd)
      directories.forEach(d => dirs.add(d))
      f.forEach(fi => files.add(fi))
    }
  }
  return {
    directories: [...dirs],
    files: [...files],
    summary: { total: proj.entries.length, success, failed }
  }
}

/**
 * 执行统计：总数、成功/失败、按工具名聚合
 */
function getExecutionSummary(projectPath) {
  const key = hashProjectKey(projectPath)
  const data = readLog()
  const proj = data.byProject[key]
  if (!proj || !proj.entries.length) {
    return { total: 0, success: 0, failed: 0, byTool: {} }
  }
  const byTool = {}
  let success = 0
  let failed = 0
  for (const e of proj.entries) {
    if (!byTool[e.toolName]) byTool[e.toolName] = { total: 0, success: 0, failed: 0 }
    byTool[e.toolName].total++
    if (e.success) {
      success++
      byTool[e.toolName].success++
    } else {
      failed++
      byTool[e.toolName].failed++
    }
  }
  return {
    total: proj.entries.length,
    success,
    failed,
    byTool
  }
}

module.exports = {
  append,
  getViewedPaths,
  getExecutionSummary,
  extractPathsFromCommand
}
