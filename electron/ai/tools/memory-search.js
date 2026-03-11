// 工具：记忆搜索（支持向量语义搜索 + 关键词 fallback）
const { searchMemoriesSemantic } = require('../memory-store')

// getAIConfig 在注册时注入
let _getAIConfig = null

const definition = {
  description: '在记忆库中搜索与当前任务相关的历史信息（用户偏好、项目配置、重要结论等）。支持语义搜索。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词或语义描述（如 "用户偏好 pnpm"、"数据库配置" 等）' },
      project_path: { type: 'string', description: '关联项目路径（可选，填写后优先返回该项目的记忆）' },
      limit: { type: 'number', description: '返回条数，默认 10，最大 20' }
    },
    required: ['query']
  }
}

async function execute(args) {
  const { query, project_path, limit = 10 } = args
  const limitNum = Math.min(limit, 20)
  try {
    const apiConfig = _getAIConfig ? (_getAIConfig()?.config || null) : null
    const results = await searchMemoriesSemantic(query, project_path || null, limitNum, apiConfig)
    const memories = results || []
    if (!memories.length) return { success: true, memories: [], message: '未找到相关记忆' }
    return { success: true, memories }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function createMemorySearchTool(getAIConfig) {
  _getAIConfig = getAIConfig
  return { definition, execute }
}

module.exports = { definition, execute, createMemorySearchTool }
