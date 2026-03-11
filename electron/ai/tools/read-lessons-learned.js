// 工具：读取知识库 LESSONS_LEARNED.md（供自进化 /evolve 等使用，避免依赖 execute_command 或 file_operation）
const { readLessonsLearned } = require('../memory-store')

const definition = {
  description: '读取知识库 LESSONS_LEARNED.md 的完整内容。用于自进化分析前了解已有教训、避免重复记录，或回答用户关于「已学到的经验」的提问。',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  }
}

async function execute() {
  try {
    const content = readLessonsLearned()
    return { success: true, content: content || '（知识库为空）' }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

module.exports = { definition, execute }
