// 工具：向 Telegram 发送文本/语音（支持 audio_text 内置 TTS）
const telegramNotify = require('../telegram-notify')
const artifactRegistry = require('../artifact-registry')
const { logger: appLogger } = require('../../app-logger')

const definition = {
  description: '向 Telegram 发送消息。支持 text 文本与语音消息（audio_file_path 或 audio_text 内置 TTS）。',
  parameters: {
    type: 'object',
    properties: {
      chat_id: {
        type: 'string',
        description: 'Telegram chat_id（必填）'
      },
      text: {
        type: 'string',
        description: '发送文本（可选）'
      },
      audio_file_path: {
        type: 'string',
        description: '发送语音：本地语音文件路径（推荐 ogg/opus）'
      },
      audio_text: {
        type: 'string',
        description: '发送语音：待合成文本（使用内置 TTS）'
      },
      audio_voice: {
        type: 'string',
        description: 'TTS 音色 shortName 或别名（可选）'
      },
      audio_lang: {
        type: 'string',
        description: 'TTS 语言（可选，如 zh-CN）'
      },
      audio_rate: {
        type: 'string',
        description: 'TTS 语速（可选，如 +10%）'
      },
      audio_volume: {
        type: 'string',
        description: 'TTS 音量（可选，如 +10%）'
      },
      audio_pitch: {
        type: 'string',
        description: 'TTS 音调（可选，如 -50Hz）'
      },
      audio_caption: {
        type: 'string',
        description: '语音附带说明（可选）'
      }
    },
    required: ['chat_id']
  }
}

async function execute(args = {}, context = {}) {
  const artifactIds = []
  try {
    const p = String(args.audio_file_path || '').trim()
    if (p) {
      const rec = artifactRegistry.registerFileArtifact({
        path: p,
        kind: 'audio',
        source: 'telegram_tool',
        channel: 'telegram',
        sessionId: String(context.sessionId || ''),
        runSessionId: String(context.runSessionId || ''),
        messageId: '',
        chatId: String(args.chat_id || ''),
        role: 'assistant'
      })
      if (rec && rec.artifactId) artifactIds.push(rec.artifactId)
    }
  } catch (e) {
    appLogger?.warn?.('[TelegramTool] 产物入库失败', { error: e.message || String(e) })
  }
  const result = await telegramNotify.sendMessage(args)
  try {
    if (result && result.success && result.message_id && context.sessionId && artifactIds.length > 0) {
      artifactRegistry.bindArtifactsToMessage({
        sessionId: String(context.sessionId || ''),
        messageId: String(result.message_id),
        role: 'assistant',
        artifactIds
      })
    }
  } catch (e) {
    appLogger?.warn?.('[TelegramTool] 产物绑定消息失败', { error: e.message || String(e) })
  }
  return result
}

module.exports = { definition, execute }
