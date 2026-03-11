// 工具：请求用户确认
// 危险操作前暂停 Agent 循环，等待用户确认

const definition = {
  description: '在执行危险操作（git push、部署、删除文件等）前请求用户确认。支持带输入框的确认弹框，用户可直接编辑内容（如 commit message）后提交。用户确认后继续，拒绝则终止',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: '需要确认的操作描述' },
      severity: { type: 'string', enum: ['info', 'warning', 'danger'], description: '严重程度，默认 warning' },
      input_default: { type: 'string', description: '可选。若提供此字段，弹框会显示一个可编辑的输入框，预填此内容（如 commit message）。用户编辑后点确认，返回的 user_input 即为用户最终输入的内容。' },
      allow_push: { type: 'boolean', description: '可选。为 true 时弹框额外显示「确认并推送」按钮，用户点击后返回 push_after_commit=true，AI 应在提交后立即执行 git push。用于 git commit 确认弹框。' }
    },
    required: ['message']
  }
}

const { ipcMain } = require('electron')
const confirmationManager = require('../confirmation-manager')
const feishuNotify = require('../feishu-notify')
let ipcBridgeReady = false

function ensureIpcBridge() {
  if (ipcBridgeReady) return
  try { ipcMain.removeHandler('ai-chat-confirm-response') } catch (_) {}
  ipcMain.handle('ai-chat-confirm-response', async (_event, data = {}) => {
    const ok = confirmationManager.resolveById(data.confirmId, {
      confirmed: data.confirmed,
      user_input: data.userInput || '',
      push_after_commit: data.pushAfterCommit || false,
      message: data.confirmed ? '用户已确认' : '用户已拒绝'
    })
    return { success: ok }
  })
  ipcBridgeReady = true
}

function shouldRequireManualConfirm(message = '', allowPush = false) {
  if (allowPush) return true
  const m = String(message || '').toLowerCase()
  if (!m) return false
  const riskyHints = [
    'git push', 'push 到远端', '推送到远端', 'push to remote',
    'git commit', '提交代码', 'commit',
    'rm -rf', '删除文件', '删除目录', 'delete',
    'deploy', '发布', 'release', '打 tag', 'tag '
  ]
  return riskyHints.some(k => m.includes(k))
}

async function execute(args, context) {
  const { message, severity = 'warning', input_default, allow_push } = args
  const { sender, sessionId, channel, remoteId, feishuChatId } = context || {}
  const normalizedChannel = String(channel || (feishuChatId ? 'feishu' : 'main'))
  const normalizedRemoteId = String(remoteId || feishuChatId || '')
  const canSend = !!(sender && typeof sender.send === 'function' && !(typeof sender.isDestroyed === 'function' && sender.isDestroyed()))
  ensureIpcBridge()

  // 默认自动通过确认，避免工具链卡死；仅高风险操作走人工确认
  if (!shouldRequireManualConfirm(message, !!allow_push)) {
    return { confirmed: true, user_input: input_default || '', push_after_commit: false, message: '低风险操作自动确认通过' }
  }

  if (normalizedChannel !== 'feishu' && !canSend) {
    return { confirmed: false, user_input: '', push_after_commit: false, message: '无可用 UI 通道，已拒绝操作' }
  }

  const req = confirmationManager.createRequest({
    sessionId,
    channel: normalizedChannel,
    remoteId: normalizedRemoteId,
    message,
    severity,
    inputDefault: input_default || '',
    allowPush: !!allow_push
  })

  if (normalizedChannel === 'feishu' && normalizedRemoteId) {
    try {
      await feishuNotify.sendMessage({
        chat_id: normalizedRemoteId,
        text: `请求确认：${message}\n请直接回复「确认」或「取消」。`
      })
    } catch (e) {
      return { confirmed: false, user_input: '', push_after_commit: false, message: `飞书确认请求发送失败：${e.message}` }
    }
    return confirmationManager.wait(req.confirmId, 60 * 60 * 1000)
  }

  try {
    sender.send('ai-chat-confirm-request', {
      sessionId,
      confirmId: req.confirmId,
      message,
      severity,
      inputDefault: input_default || null,
      allowPush: allow_push || false
    })
  } catch (e) {
    confirmationManager.resolveById(req.confirmId, { confirmed: false, message: `确认请求发送失败：${e.message}` })
  }
  return confirmationManager.wait(req.confirmId, 10 * 60 * 1000)
}

module.exports = { definition, execute }
