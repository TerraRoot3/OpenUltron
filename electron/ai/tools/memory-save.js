// 工具：保存记忆（新建或更新），保存后异步缓存 embedding
const { saveMemory, cacheEmbeddingForMemory } = require('../memory-store')

let _getAIConfig = null

const definition = {
  description: '保存一条记忆到记忆库（新建或更新已有记忆）。适合存储：用户偏好、项目配置、重要结论、常见问题的解决方案等值得跨会话记住的信息。',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string', description: '记忆内容，不超过 200 字，简洁明了' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '分类标签（如 ["preference", "tech-stack", "project-config"]）'
      },
      project_path: {
        type: 'string',
        description: '关联项目路径（不填表示全局记忆，适合跨项目的用户偏好）'
      },
      id: { type: 'string', description: '更新时传入已有记忆的 id；新建时不传' }
    },
    required: ['content']
  }
}

async function execute(args, ctx = {}) {
  const { content, tags = [], project_path, id } = args
  if (!content?.trim()) return { success: false, error: '缺少 content 参数' }
  try {
    const memory = saveMemory({
      content: content.trim(),
      tags,
      projectPath: project_path || null,
      id: id || null,
      source: 'manual'
    })
    try {
      const { logger: appLogger } = require('../app-logger')
      appLogger?.info?.('[AI][Memory] memory_save', {
        memoryId: memory.id,
        runId: String(ctx.runId || '').slice(0, 48),
        channel: ctx.channel || 'main',
        projectPathSlice: String(project_path || ctx.projectPath || '').slice(0, 160)
      })
    } catch (_) { /* ignore */ }
    // 异步缓存 embedding（不阻塞响应）
    if (_getAIConfig) {
      const apiConfig = _getAIConfig()?.config
      cacheEmbeddingForMemory(memory.id, apiConfig).catch(() => {})
    }
    return { success: true, memory, message: id ? '记忆已更新' : '记忆已保存' }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function createMemorySaveTool(getAIConfig) {
  _getAIConfig = getAIConfig
  return { definition, execute }
}

module.exports = { definition, execute, createMemorySaveTool }
