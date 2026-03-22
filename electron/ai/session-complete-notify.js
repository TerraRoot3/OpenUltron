'use strict'

/**
 * 会话（任务）完成时的出站通知统一入口。
 * 各 IM 渠道独立判断配置后发送，新增渠道在此注册即可，避免 orchestrator 直接耦合多个 *-notify。
 */
const openultronConfig = require('../openultron-config')

const MAX_SUMMARY_LEN = 400

function extractAssistantSummary(messages, maxLen = MAX_SUMMARY_LEN) {
  const lastAssistant = [...(messages || [])].reverse().find(m => m && m.role === 'assistant')
  let summary = ''
  if (lastAssistant && lastAssistant.content) {
    if (typeof lastAssistant.content === 'string') {
      summary = lastAssistant.content.trim().slice(0, maxLen)
    } else if (Array.isArray(lastAssistant.content)) {
      summary = lastAssistant.content.map(c => (c && c.text) || '').join('').trim().slice(0, maxLen)
    }
  }
  return summary || '会话已完成'
}

async function sendFeishuComplete(summary) {
  const feishuNotify = require('./feishu-notify')
  const config = feishuNotify.getConfig()
  if (!config.notify_on_complete || !(config.default_chat_id && config.default_chat_id.trim())) return
  await feishuNotify.sendMessage({
    text: `【Git Manager 任务完成】\n${summary}`
  })
}

async function sendTelegramComplete(summary) {
  const cfg = openultronConfig.getTelegram()
  if (!cfg.notify_on_complete) return
  const chatId = String(cfg.default_chat_id || '').trim()
  if (!chatId) return
  const token = String(cfg.bot_token || '').trim()
  if (!token) return
  const telegramNotify = require('./telegram-notify')
  await telegramNotify.sendMessage({
    chat_id: chatId,
    text: `【OpenUltron 任务完成】\n${summary}`
  })
}

async function sendDingtalkComplete(summary) {
  const cfg = openultronConfig.getDingtalk()
  if (!cfg.notify_on_complete) return
  const openConversationId = String(cfg.default_chat_id || '').trim()
  const robotCode = String(cfg.default_robot_code || '').trim()
  if (!openConversationId || !robotCode) return
  const dingtalkNotify = require('./dingtalk-notify')
  await dingtalkNotify.sendMessage({
    open_conversation_id: openConversationId,
    robot_code: robotCode,
    text: `【OpenUltron 任务完成】\n${summary}`
  })
}

/**
 * 根据各平台配置异步发送任务完成摘要（互不影响）。
 * @param {any[]} messages
 */
async function sendTaskCompleteNotifications(messages) {
  const summary = extractAssistantSummary(messages)
  const tasks = [
    sendFeishuComplete(summary).catch((e) => console.warn('[Feishu] 任务完成通知发送失败:', e.message)),
    sendTelegramComplete(summary).catch((e) => console.warn('[Telegram] 任务完成通知发送失败:', e.message)),
    sendDingtalkComplete(summary).catch((e) => console.warn('[DingTalk] 任务完成通知发送失败:', e.message))
  ]
  await Promise.all(tasks)
}

module.exports = {
  extractAssistantSummary,
  sendTaskCompleteNotifications
}
