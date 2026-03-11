/**
 * Telegram 会话映射：每个 chat_id 当前对应的 sessionId（支持 /new 切新会话）
 * 持久化到 <appRoot>/telegram-current-sessions.json
 */
const path = require('path')
const fs = require('fs')
const { getAppRootPath } = require('../app-root')

const STATE_PATH = getAppRootPath('telegram-current-sessions.json')

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

function getOrCreateCurrentSessionId(chatId) {
  const state = readState()
  let sessionId = state[chatId]
  if (sessionId) return sessionId
  sessionId = `telegram-${sanitizeChatId(chatId)}-${Date.now()}`
  state[chatId] = sessionId
  writeState(state)
  return sessionId
}

function newSessionForChat(chatId) {
  const sessionId = `telegram-${sanitizeChatId(chatId)}-${Date.now()}`
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
