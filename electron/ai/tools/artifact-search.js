const artifactRegistry = require('../artifact-registry')

const definition = {
  description: '检索会话产物库（本地文件、截图、飞书云文档/表格引用）。默认优先当前会话，按时间倒序返回，避免找错文件。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索关键词（文件名、路径、URL、token片段）' },
      kinds: {
        type: 'array',
        description: '可选类型过滤，如 image/file/feishu_doc/feishu_sheet/feishu_bitable',
        items: { type: 'string' }
      },
      limit: { type: 'number', description: '返回条数，默认 20，最大 100' },
      session_id: { type: 'string', description: '可选：指定会话ID。不传时默认当前会话。' },
      chat_id: { type: 'string', description: '可选：指定聊天ID。session_id 缺失时生效。' }
    },
    required: []
  }
}

async function execute(args = {}, context = {}) {
  try {
    const sessionId = String(args.session_id || context.sessionId || '').trim()
    const chatId = String(args.chat_id || context.feishuChatId || context.remoteId || '').trim()
    const query = String(args.query || '').trim()
    const kinds = Array.isArray(args.kinds) ? args.kinds.map((x) => String(x || '').trim()).filter(Boolean) : []
    const limit = Number.isFinite(Number(args.limit)) ? Number(args.limit) : 20
    const rows = artifactRegistry.searchArtifacts({
      sessionId,
      chatId,
      kinds,
      query,
      limit
    })
    return { success: true, count: rows.length, artifacts: rows }
  } catch (error) {
    return { success: false, error: error.message || String(error) }
  }
}

module.exports = { definition, execute }

