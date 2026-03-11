/**
 * 飞书 WebSocket 长连接：接收消息事件，解析后通过回调交给上层（main）处理并回发
 * 配置来自 <appRoot>/openultron.json 的 feishu 字段，与 feishu-notify 共用
 */
const openultronConfig = require('../openultron-config')

function getConfig() {
  const f = openultronConfig.getFeishu()
  return { app_id: f.app_id || '', app_secret: f.app_secret || '' }
}

let wsClient = null
let lastError = null

/**
 * 解析飞书 im.message.receive_v1 事件，提取 chat_id、文本、message_id
 * 事件结构参考：data 可能为 { message: { message_id, chat_id, content, message_type } }
 */
function parseMessageEvent(data) {
  const msg = data && (data.message || (data.data && data.data.message))
  if (!msg) return null
  const chatId = msg.chat_id || (msg.chat && msg.chat.chat_id) || msg.open_chat_id
  const messageId = msg.message_id || msg.open_message_id
  let text = ''
  const content = msg.content
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      text = (parsed && parsed.text) || content
    } catch {
      text = content
    }
  } else if (content && typeof content === 'object') {
    text = content.text || content.content || ''
  }
  text = (text || '').trim()
  if (!chatId) return null
  return { chatId, messageId, text }
}

/**
 * 启动 WebSocket 接收；onMessage(chatId, text, messageId) 由 main 注册，负责调用 AI 并回发
 * @param { (chatId: string, text: string, messageId: string) => Promise<void> } onMessage
 */
async function start(onMessage) {
  if (wsClient) return
  lastError = null
  const config = getConfig()
  if (!config.app_id || !config.app_secret) {
    lastError = '请先填写并保存 App ID、App Secret'
    console.warn('[Feishu WS]', lastError)
    throw new Error(lastError)
  }
  let lark
  try {
    lark = require('@larksuiteoapi/node-sdk')
  } catch (e) {
    lastError = '未安装飞书 SDK，请在项目根目录执行: npm install @larksuiteoapi/node-sdk'
    console.warn('[Feishu WS]', lastError)
    throw new Error(lastError)
  }
  const handleMessageEvent = async (data) => {
    console.log('[Feishu WS] 收到消息事件，data 键:', data ? Object.keys(data) : 'null')
    const parsed = parseMessageEvent(data)
    if (!parsed) {
      console.warn('[Feishu WS] 解析失败或缺少 chat_id')
      if (data && typeof data === 'object') {
        try { console.warn('[Feishu WS] 原始 data 摘要:', JSON.stringify(data).slice(0, 600)) } catch (_) {}
      }
      return
    }
    if (!parsed.text) {
      console.warn('[Feishu WS] 跳过：无文本内容（可能为非文本消息）')
      return
    }
    try {
      await onMessage(parsed.chatId, parsed.text, parsed.messageId)
      console.log('[Feishu WS] 已处理并回复')
    } catch (e) {
      console.error('[Feishu WS] onMessage error:', e)
    }
  }

  const eventHandlers = {
    'im.message.receive_v1': handleMessageEvent,
    'im.message.receive_v2': handleMessageEvent
  }
  const dispatcher = new lark.EventDispatcher({}).register(eventHandlers)

  // 飞书心跳间隔由服务端下发，通过自定义 httpInstance 在拉取连接配置时把 PingInterval 调大（秒）
  const FEISHU_WS_PING_INTERVAL_SEC = 300
  const defaultHttp = lark.defaultHttpInstance
  const wrappedHttpInstance = {
    request: async (config) => {
      const body = await defaultHttp.request(config)
      if (body?.data?.ClientConfig && config?.url && String(config.url).includes('ws/endpoint')) {
        const current = body.data.ClientConfig.PingInterval || 120
        body.data.ClientConfig.PingInterval = Math.max(current, FEISHU_WS_PING_INTERVAL_SEC)
      }
      return body
    }
  }

  try {
    wsClient = new lark.WSClient({
      appId: config.app_id,
      appSecret: config.app_secret,
      httpInstance: wrappedHttpInstance,
      logLevel: (lark.LogLevel && lark.LogLevel.info) !== undefined ? lark.LogLevel.info : 1
    })
    const startOpt = { eventDispatcher: dispatcher }
    const startResult = wsClient.start(startOpt)
    if (startResult && typeof startResult.then === 'function') await startResult
    lastError = null
    console.log('[Feishu WS] 长连接已启动')
    console.log('[Feishu WS] 若在飞书发消息后这里无「收到消息事件」日志，请检查：1) 飞书控制台-事件与回调-事件订阅-已添加事件「接收消息」 2) 应用权限-机器人-已开启接收/发送消息 3) 群里请 @ 机器人 发文本，或私聊机器人发文本')
  } catch (e) {
    lastError = e.message || String(e)
    console.warn('[Feishu WS] 启动失败:', lastError)
    wsClient = null
    throw e
  }
}

function stop() {
  if (wsClient) {
    try { wsClient.stop && wsClient.stop() } catch (_) {}
    wsClient = null
    console.log('[Feishu WS] 已停止')
  }
}

function isRunning() {
  return !!wsClient
}

function getLastError() {
  return lastError || null
}

module.exports = {
  getConfig,
  start,
  stop,
  isRunning,
  getLastError,
  parseMessageEvent
}
