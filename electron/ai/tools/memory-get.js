// 工具：获取指定记忆详情
const { getMemory } = require('../memory-store')

const definition = {
  description: '获取指定 id 的记忆详情（同时更新访问统计）',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '记忆 ID（从 memory_search 结果中获取）' }
    },
    required: ['id']
  }
}

async function execute(args) {
  const { id } = args
  if (!id) return { success: false, error: '缺少 id 参数' }
  try {
    const memory = getMemory(id)
    if (!memory) return { success: false, error: `记忆 "${id}" 不存在` }
    return { success: true, memory }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

module.exports = { definition, execute }
