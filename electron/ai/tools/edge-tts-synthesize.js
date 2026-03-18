// 工具：内置 Edge TTS，将文本合成为语音文件（mp3），供后续发送或使用
const path = require('path')
const fs = require('fs')
const feishuNotify = require('../feishu-notify')
const { logger: appLogger } = require('../../app-logger')
const { getWorkspaceRoot } = require('../../app-root')

const definition = {
  description: `使用内置 Edge TTS 将文本合成为语音文件（输出为 mp3）。音色可用 tts_voice_manager(list_voices) 查询，或传别名/默认音色。

生成后的文件路径可传给 feishu_send_voice_message(audio_file_path) 发送语音消息。不要使用系统命令 edge-tts，请用本工具。`,
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要合成的文本' },
      voice: {
        type: 'string',
        description: '音色 shortName（如 zh-CN-XiaoxiaoNeural）或 tts_voice_manager 配置的别名（如 女声）'
      },
      output_path: {
        type: 'string',
        description: '输出文件路径（可选）。不传则生成到工作空间 audio 目录，文件名自动生成'
      },
      lang: { type: 'string', description: '语言代码（可选，默认 zh-CN）' }
    },
    required: ['text']
  }
}

function makeOutputPath(customPath, defaultDir) {
  if (customPath && path.isAbsolute(customPath)) return customPath
  const dir = defaultDir || path.join(getWorkspaceRoot(), 'audio')
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  } catch (_) {}
  const base = `tts_${Date.now()}.mp3`
  return path.join(dir, base)
}

async function execute(args = {}, context = {}) {
  const text = args.text != null ? String(args.text).trim() : ''
  if (!text) return { success: false, message: 'text 不能为空' }

  const voice = args.voice != null ? String(args.voice).trim() : undefined
  const lang = args.lang != null ? String(args.lang).trim() : undefined
  const defaultDir = path.join(getWorkspaceRoot(), 'audio')
  const outputPath = makeOutputPath(args.output_path, defaultDir)

  appLogger?.info?.('[EdgeTtsTool] edge_tts_synthesize 调用', {
    text_len: text.length,
    voice: voice || '(默认)',
    output_path: outputPath
  })

  try {
    await feishuNotify.synthesizeEdgeTtsToMp3(text, outputPath, {
      voice: voice ? feishuNotify.resolveTtsVoice(voice) || voice : undefined,
      lang: lang || 'zh-CN'
    })
  } catch (e) {
    appLogger?.warn?.('[EdgeTtsTool] 合成失败', { error: e?.message })
    return { success: false, message: e?.message || 'TTS 合成失败', output_path: '' }
  }

  const size = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0
  return {
    success: true,
    message: '语音合成成功',
    output_path: outputPath,
    bytes: size
  }
}

module.exports = { definition, execute }
