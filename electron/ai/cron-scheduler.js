/**
 * 定时任务调度器：读取 <appRoot>/cron.json，按 cron 表达式或简单周期触发任务
 * 任务类型：heartbeat（执行 HEARTBEAT.md 清单）、command（执行 shell 命令）、feishu_refresh_token（刷新飞书 user_access_token）
 */
const path = require('path')
const fs = require('fs')
const { getAppRootPath, getAppRoot } = require('../app-root')

const CRON_JSON_PATH = getAppRootPath('cron.json')
const DEFAULT_CONFIG = { tasks: [] }
let tickTimer = null
let runHeartbeatFn = null

function getConfig() {
  try {
    if (fs.existsSync(CRON_JSON_PATH)) {
      const raw = fs.readFileSync(CRON_JSON_PATH, 'utf-8')
      const data = JSON.parse(raw)
      return { tasks: Array.isArray(data.tasks) ? data.tasks : [] }
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_CONFIG
}

function setConfig(data) {
  const dir = path.dirname(CRON_JSON_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const out = { tasks: Array.isArray(data.tasks) ? data.tasks : [] }
  fs.writeFileSync(CRON_JSON_PATH, JSON.stringify(out, null, 2), 'utf-8')
  try {
    const fd = fs.openSync(CRON_JSON_PATH, 'r')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
  } catch (e) {
    console.warn('[Cron] setConfig fsync failed:', e.message)
  }
}

/**
 * 简单 cron 匹配：仅支持 分 时 日 月 周 五段；支持 *、整数 N、步长（如 分 用 * /2 表示每 2 分钟）
 * 返回当前时间是否匹配该 cron 表达式（精度到分钟）
 */
function cronMatch(schedule, now) {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length < 5) return false
  const min = now.getMinutes()
  const hour = now.getHours()
  const day = now.getDate()
  const month = now.getMonth() + 1
  const week = now.getDay() // 0 = Sunday

  function matchField(str, value, max) {
    if (str === '*') return true
    if (/^\d+$/.test(str)) return value === parseInt(str, 10)
    const m = str.match(/^\*\/(\d+)$/)
    if (m) return value % parseInt(m[1], 10) === 0
    return false
  }

  return (
    matchField(parts[0], min, 59) &&
    matchField(parts[1], hour, 23) &&
    matchField(parts[2], day, 31) &&
    matchField(parts[3], month, 12) &&
    matchField(parts[4], week, 6)
  )
}

function id() {
  return `cron-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function listTasks() {
  return getConfig().tasks
}

function addTask(task) {
  const config = getConfig()
  const t = {
    id: task.id || id(),
    name: task.name || '未命名',
    schedule: task.schedule || '0 9 * * *',
    type: task.type || 'heartbeat',
    enabled: task.enabled !== false,
    command: task.command || '',
    lastRun: null,
    lastResult: null
  }
  config.tasks.push(t)
  setConfig(config)
  if (t.type === 'feishu_refresh_token') {
    try {
      const appLogger = require('../app-logger').logger
      appLogger.info('[Cron] addTask 已写入 cron.json', { path: CRON_JSON_PATH, taskId: t.id, totalTasks: config.tasks.length })
    } catch (_) {}
  }
  return t
}

function updateTask(taskId, updates) {
  const config = getConfig()
  const idx = config.tasks.findIndex((t) => t.id === taskId)
  if (idx < 0) return null
  const t = config.tasks[idx]
  if (updates.name !== undefined) t.name = updates.name
  if (updates.schedule !== undefined) t.schedule = updates.schedule
  if (updates.type !== undefined) t.type = updates.type
  if (updates.enabled !== undefined) t.enabled = updates.enabled
  if (updates.command !== undefined) t.command = updates.command
  config.tasks[idx] = t
  setConfig(config)
  return t
}

function removeTask(taskId) {
  if (taskId == null || String(taskId).trim() === '') return false
  const idStr = String(taskId).trim()
  const config = getConfig()
  const before = config.tasks.length
  config.tasks = config.tasks.filter((t) => String(t.id).trim() !== idStr)
  if (config.tasks.length === before) return false
  setConfig(config)
  // 再次从磁盘读取并确认已删除，避免写入未落盘或路径不一致导致仍被 tick 执行
  const after = getConfig()
  if (after.tasks.some((t) => String(t.id).trim() === idStr)) {
    const again = after.tasks.filter((t) => String(t.id).trim() !== idStr)
    setConfig({ tasks: again })
  }
  return true
}

function setLastRun(taskId, result) {
  const config = getConfig()
  const t = config.tasks.find((x) => x.id === taskId)
  if (!t) return
  t.lastRun = new Date().toISOString()
  t.lastResult = result
  setConfig(config)
}

async function runTask(task, opts = {}) {
  const { execSync } = require('child_process')
  if (task.type === 'heartbeat') {
    if (typeof runHeartbeatFn === 'function') {
      await runHeartbeatFn()
      setLastRun(task.id, 'ok')
      return { success: true, message: 'Heartbeat 已执行' }
    }
    setLastRun(task.id, 'no runner')
    return { success: false, message: 'Heartbeat 执行器未注册' }
  }
  if (task.type === 'command' && task.command) {
    try {
      const cwd = getAppRoot()
      execSync(task.command, { encoding: 'utf-8', timeout: 300000, cwd })
      setLastRun(task.id, 'ok')
      return { success: true, message: '命令已执行' }
    } catch (e) {
      const msg = (e.stderr || e.message || '').toString().trim()
      setLastRun(task.id, `error: ${msg.slice(0, 200)}`)
      return { success: false, message: msg || e.message }
    }
  }
  if (task.type === 'feishu_refresh_token') {
    try {
      const feishuNotify = require('./feishu-notify')
      await feishuNotify.refreshUserAccessToken()
      setLastRun(task.id, 'ok')
      return { success: true, message: '飞书 User Token 已刷新' }
    } catch (e) {
      const msg = (e && e.message) ? String(e.message).slice(0, 200) : 'unknown'
      setLastRun(task.id, `error: ${msg}`)
      return { success: false, message: msg }
    }
  }
  setLastRun(task.id, 'skip')
  return { success: false, message: '未知任务类型或缺少 command' }
}

function tick() {
  const now = new Date()
  const config = getConfig()
  for (const task of config.tasks) {
    if (!task.enabled) continue
    if (!cronMatch(task.schedule, now)) continue
    const lastRun = task.lastRun ? new Date(task.lastRun) : null
    if (lastRun && lastRun.getTime() > now.getTime() - 60000) continue
    runTask(task).catch((e) => {
      setLastRun(task.id, `error: ${e.message}`)
      console.warn('[Cron] 任务执行失败:', task.name, e.message)
    })
  }
}

function start(runHeartbeat) {
  runHeartbeatFn = runHeartbeat
  if (tickTimer) return
  tick()
  tickTimer = setInterval(tick, 60 * 1000)
  console.log('[Cron] 调度器已启动，每 1 分钟检查一次')
}

function stop() {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  runHeartbeatFn = null
}

module.exports = {
  getConfig,
  setConfig,
  listTasks,
  addTask,
  updateTask,
  removeTask,
  runTask,
  start,
  stop,
  CRON_JSON_PATH
}
