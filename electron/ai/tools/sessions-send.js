/**
 * 向指定会话追加一条消息（系统或用户角色），实现 Agent 间消息传递。对方打开该会话时会看到该条消息。
 */
const conversationFile = require('../conversation-file')

const definition = {
  description: '向指定会话追加一条消息（作为 user 或 system），实现跨会话/Agent 通知。需提供 sessionId、content；projectPath 不传时默认为 __main_chat__。role 可选：user（默认，显示为一条用户消息）或 system。',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: '目标会话 ID' },
      content: { type: 'string', description: '消息正文' },
      projectPath: { type: 'string', description: '可选。项目路径', default: '__main_chat__' },
      role: { type: 'string', description: '可选。user 或 system', default: 'user', enum: ['user', 'system'] }
    },
    required: ['sessionId', 'content']
  }
}

async function execute(args, context = {}) {
  const { sessionId, content, projectPath = '__main_chat__', role = 'user' } = args || {}
  if (!sessionId || String(sessionId).trim() === '') {
    return { success: false, error: '缺少 sessionId' }
  }
  if (content === undefined || content === null) {
    return { success: false, error: '缺少 content' }
  }
  const r = role === 'system' ? 'system' : 'user'
  try {
    const ctxProjectPath = context.projectPath && String(context.projectPath).trim() ? String(context.projectPath).trim() : ''
    const targetProjectPath = projectPath && String(projectPath).trim() ? String(projectPath).trim() : (ctxProjectPath || '__main_chat__')
    if (ctxProjectPath && targetProjectPath !== ctxProjectPath) {
      return { success: false, error: `禁止跨项目会话写入：当前 ${ctxProjectPath}，目标 ${targetProjectPath}` }
    }
    const projectKey = conversationFile.hashProjectPath(targetProjectPath)
    const conv = conversationFile.loadConversation(projectKey, String(sessionId).trim())
    if (!conv) {
      return { success: false, error: '目标会话不存在，请先用 sessions_list 确认 sessionId 与 projectPath' }
    }
    const messages = [...(conv.messages || []), { role: r, content: String(content) }]
    conversationFile.saveConversation(projectKey, {
      id: conv.id,
      title: conv.title,
      projectPath: conv.projectPath || targetProjectPath,
      apiBaseUrl: conv.apiBaseUrl,
      feishuChatId: conv.feishuChatId,
      createdAt: conv.createdAt,
      updatedAt: new Date().toISOString(),
      messages
    })
    return { success: true, sessionId: conv.id, projectPath: conv.projectPath || targetProjectPath, role: r, message: '已追加一条消息' }
  } catch (e) {
    return { success: false, error: e.message || String(e) }
  }
}

module.exports = { definition, execute }
