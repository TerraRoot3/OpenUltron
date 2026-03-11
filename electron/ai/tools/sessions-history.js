/**
 * 读取指定会话的历史消息（transcript），供 AI 了解另一会话的上下文。
 */
const conversationFile = require('../conversation-file')

const definition = {
  description: '读取指定会话的完整对话历史（消息列表）。需提供 sessionId；projectPath 不传时默认为 __main_chat__。返回 messages 数组（role + content）。',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: '会话 ID' },
      projectPath: { type: 'string', description: '可选。项目路径，如 __feishu__、__gateway__', default: '__main_chat__' }
    },
    required: ['sessionId']
  }
}

async function execute(args, context = {}) {
  const { sessionId, projectPath = '__main_chat__' } = args || {}
  if (!sessionId || String(sessionId).trim() === '') {
    return { success: false, error: '缺少 sessionId' }
  }
  try {
    const ctxProjectPath = context.projectPath && String(context.projectPath).trim() ? String(context.projectPath).trim() : ''
    const targetProjectPath = projectPath && String(projectPath).trim() ? String(projectPath).trim() : (ctxProjectPath || '__main_chat__')
    if (ctxProjectPath && targetProjectPath !== ctxProjectPath) {
      return { success: false, error: `禁止跨项目会话读取：当前 ${ctxProjectPath}，目标 ${targetProjectPath}` }
    }
    const projectKey = conversationFile.hashProjectPath(targetProjectPath)
    const conv = conversationFile.loadConversation(projectKey, String(sessionId).trim())
    if (!conv) {
      return { success: true, sessionId, projectPath: targetProjectPath, messages: [], message: '会话不存在或已删除' }
    }
    const messages = (conv.messages || []).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : (m.content && Array.isArray(m.content) ? m.content.map(c => c && c.text).filter(Boolean).join('') : '')
    }))
    return {
      success: true,
      sessionId: conv.id,
      projectPath: conv.projectPath || targetProjectPath,
      title: conv.title || '',
      updatedAt: conv.updatedAt || '',
      messages,
      messageCount: messages.length
    }
  } catch (e) {
    return { success: false, error: e.message || String(e) }
  }
}

module.exports = { definition, execute }
