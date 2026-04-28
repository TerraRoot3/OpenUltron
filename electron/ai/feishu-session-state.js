/**
 * 飞书会话与主会话的映射：每个 chat_id 当前对应的 sessionId。
 * 仅允许用户显式发送 /new 时切新会话，不允许基于上下文长度或任务语义自动轮转。
 * 持久化到 <appRoot>/feishu-current-sessions.json
 */
const path = require('path')
const fs = require('fs')
const { getAppRootPath } = require('../app-root')

const STATE_PATH = getAppRootPath('feishu-current-sessions.json')

function readState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = fs.readFileSync(STATE_PATH, 'utf-8')
      const data = JSON.parse(raw)
      return typeof data === 'object' && data !== null ? data : {}
    }
  } catch (e) { /* ignore */ }
  return {}
}

function writeState(state) {
  const dir = path.dirname(STATE_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8')
}

/**
 * 获取某 chat 当前使用的 sessionId；若不存在则创建并返回新 sessionId
 */
function getOrCreateCurrentSessionId(chatId) {
  const state = readState()
  let sessionId = state[chatId]
  if (sessionId) return sessionId
  sessionId = `feishu-${sanitizeChatId(chatId)}-${Date.now()}`
  state[chatId] = sessionId
  writeState(state)
  return sessionId
}

/**
 * /new：为当前 chat 创建新会话并设为当前
 */
function newSessionForChat(chatId) {
  const sessionId = `feishu-${sanitizeChatId(chatId)}-${Date.now()}`
  const state = readState()
  state[chatId] = sessionId
  writeState(state)
  return sessionId
}

function sanitizeChatId(chatId) {
  return String(chatId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)
}

module.exports = {
  getOrCreateCurrentSessionId,
  newSessionForChat,
  readState
}
