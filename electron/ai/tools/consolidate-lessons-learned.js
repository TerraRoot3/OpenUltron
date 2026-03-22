const { consolidateLessonsLearned, MIN_CHARS_TO_CONSOLIDATE } = require('../lessons-consolidate')

const definition = {
  description:
    `整理知识库 LESSONS_LEARNED.md：合并重复条目、压缩赘述，写回前自动备份到 memory/knowledge/.backups/。仅在内容较长（约 ${MIN_CHARS_TO_CONSOLIDATE} 字以上）时执行；用户要求「整理经验教训」「压缩知识库」「去重 LESSONS」时使用。会消耗一次模型调用。`,
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
}

function createConsolidateLessonsTool({ getResolvedAIConfig, aiOrchestrator, appLogger } = {}) {
  return {
    definition,
    async execute() {
      try {
        const out = await consolidateLessonsLearned({ getResolvedAIConfig, aiOrchestrator, appLogger })
        if (out.skipped) {
          return { success: true, skipped: true, reason: out.reason, message: out.reason === 'too_short' ? `内容不足 ${MIN_CHARS_TO_CONSOLIDATE} 字，无需整理` : '尚无知识库文件' }
        }
        if (!out.success) {
          return { success: false, error: out.error || '整理失败', backupPath: out.backupPath }
        }
        return {
          success: true,
          message: '已整理并写回 LESSONS_LEARNED.md',
          backupPath: out.backupPath,
          bytesWritten: out.bytesWritten
        }
      } catch (e) {
        return { success: false, error: e.message || String(e) }
      }
    }
  }
}

module.exports = { definition, createConsolidateLessonsTool }
