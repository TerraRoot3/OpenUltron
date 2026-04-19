// 工具：专用发送飞书「文件/图片」消息
const fs = require('fs')
const path = require('path')
const feishuNotify = require('../feishu-notify')
const { logger: appLogger } = require('../../app-logger')
const artifactRegistry = require('../artifact-registry')

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
/** 飞书 IM：mp4 上传类型对应 msg_type=media（视频），不能用 file 消息，否则会报 upload type 与 message type 不匹配 */
const VIDEO_EXTS = new Set(['.mp4'])

const definition = {
  description: `向飞书会话发送「文件 / 图片 / 视频」消息，按扩展名自动选消息类型：
- 图片（png/jpg/jpeg/gif/webp/bmp）→ 图片消息；
- 视频 mp4 → **视频消息**（与飞书 media 接口一致，勿与「普通文件」混用）；
- 其它扩展名 → 普通文件消息。

在飞书内与机器人对话时，不传 chat_id 会自动发往当前会话。`,
  parameters: {
    type: 'object',
    properties: {
      chat_id: {
        type: 'string',
        description: '飞书会话 chat_id（可选；在飞书会话中不传则自动发往当前会话）'
      },
      file_path: {
        type: 'string',
        description: '本地文件绝对路径（图片或任意其它文件）'
      },
      file_name: {
        type: 'string',
        description: '显示用的文件名（可选；默认取文件名）'
      }
    },
    required: ['file_path']
  }
}

async function execute(args = {}, context = {}) {
  const chatId = String(args.chat_id || '').trim() || String(context?.feishuChatId || '').trim()
  const rawPath = String(args.file_path || '').trim()
  const displayName = String(args.file_name || '').trim()

  if (!rawPath) return { success: false, message: 'file_path 不能为空' }
  if (!path.isAbsolute(rawPath)) return { success: false, message: `file_path 必须是绝对路径：${rawPath}` }
  if (!fs.existsSync(rawPath)) return { success: false, message: `文件不存在：${rawPath}` }
  const st = fs.statSync(rawPath)
  if (!st.isFile()) return { success: false, message: `路径不是文件：${rawPath}` }

  const ext = path.extname(rawPath).toLowerCase()
  const fileName = displayName || path.basename(rawPath)

  appLogger?.info?.('[FeishuFileTool] feishu_send_file_message 调用', {
    has_chat_id: !!chatId,
    path: rawPath,
    file_name: fileName,
    ext
  })

  let res
  if (IMAGE_EXTS.has(ext)) {
    const buf = fs.readFileSync(rawPath)
    if (!buf || buf.length === 0) {
      return { success: false, message: '图片文件为空，无法发送' }
    }
    res = await feishuNotify.sendMessage({
      chat_id: chatId || undefined,
      image_base64: buf.toString('base64'),
      image_filename: fileName
    })
  } else if (VIDEO_EXTS.has(ext)) {
    res = await feishuNotify.sendMessage({
      chat_id: chatId || undefined,
      media_file_path: rawPath,
      media_file_name: fileName
    })
  } else {
    res = await feishuNotify.sendMessage({
      chat_id: chatId || undefined,
      file_path: rawPath,
      file_name: fileName
    })
  }

  if (res?.success) {
    try {
      await artifactRegistry.registerFile({
        kind: IMAGE_EXTS.has(ext) ? 'image' : 'file',
        source: 'feishu_tool',
        sessionId: context?.sessionId || '',
        messageId: '',
        path: rawPath
      })
    } catch (_) {}
  }

  return {
    success: !!res?.success,
    message: res?.success
      ? (VIDEO_EXTS.has(ext) ? '视频发送成功' : (IMAGE_EXTS.has(ext) ? '图片发送成功' : '文件发送成功'))
      : (res?.message || '发送失败'),
    message_id: res?.message_id || ''
  }
}

module.exports = { definition, execute }

