// 工具：向飞书会话发送消息（文本 / 图片 / 富文本）
const feishuNotify = require('../feishu-notify')

const definition = {
  description: '向飞书群或会话发送消息。支持四种类型：text 纯文本、image 图片（可传 image_key 或 image_base64）、file 文件（可传 file_key+file_name 或 file_path 本地路径自动上传）、post 富文本。当用户是在飞书里与机器人对话时，不传 chat_id 会自动发往当前会话。用户要求「截图发给我」时，只需调用 webview_control 的 take_screenshot，系统会自动把截图发到当前飞书会话，无需再调本工具发图。需先配置 app_id、app_secret，机器人需加入目标群。',
  parameters: {
    type: 'object',
    properties: {
      chat_id: {
        type: 'string',
        description: '飞书群/会话 ID（可选）。用户在飞书内对话时不传则自动发往当前会话；其他场景不传则用配置的 default_chat_id'
      },
      text: {
        type: 'string',
        description: '发送纯文本时必填'
      },
      image_key: {
        type: 'string',
        description: '发送图片时：飞书图片 image_key（若已有）。与 image_base64 二选一'
      },
      image_base64: {
        type: 'string',
        description: '发送图片时：图片 base64 字符串，将自动上传后发送。与 image_key 二选一'
      },
      image_filename: {
        type: 'string',
        description: '使用 image_base64 时的文件名，用于识别格式，如 image.png'
      },
      file_key: {
        type: 'string',
        description: '发送文件时：飞书文件 file_key（若已通过上传接口获得）。与 file_path 二选一'
      },
      file_name: {
        type: 'string',
        description: '发送文件时：显示的文件名，与 file_key 搭配使用；使用 file_path 时可省略（自动取文件名）'
      },
      file_path: {
        type: 'string',
        description: '发送文件时：本地文件路径，将先上传再发送；与 file_key 二选一'
      },
      post_title: {
        type: 'string',
        description: '发送富文本时的标题（post 格式）'
      },
      post_content: {
        type: 'array',
        description: '富文本内容。每项为一段，段内为元素数组。元素：{ tag: "text", text: "..." } 或 { tag: "a", href: "url", text: "链接文字" }。例：[ [{ tag: "text", text: "第一段" }], [{ tag: "a", href: "https://example.com", text: "链接" }] ]',
        items: { type: 'array', items: { type: 'object', properties: { tag: { type: 'string' }, text: { type: 'string' }, href: { type: 'string' } } } }
      }
    },
    required: []
  }
}

function buildPostPayload(title, content) {
  if (!content || !Array.isArray(content)) {
    return { zh_cn: { title: title || '通知', content: [[{ tag: 'text', text: '无内容' }]] } }
  }
  const paragraphs = content.map((para) => {
    if (!Array.isArray(para)) return [{ tag: 'text', text: String(para) }]
    return para.map((el) => {
      if (el && el.tag === 'a') {
        return { tag: 'a', href: el.href || '', text: el.text || '' }
      }
      return { tag: 'text', text: el && el.text != null ? String(el.text) : String(el) }
    })
  })
  return { zh_cn: { title: title || '通知', content: paragraphs } }
}

async function execute(args) {
  const { chat_id, text, image_key, image_base64, image_filename, file_key, file_name, file_path, post_title, post_content } = args || {}

  const opts = { chat_id: chat_id && chat_id.trim() ? chat_id.trim() : undefined }

  if (post_title != null || (post_content && post_content.length > 0)) {
    opts.post = buildPostPayload(post_title, post_content)
  } else if (image_key || image_base64) {
    opts.image_key = image_key && image_key.trim() ? image_key.trim() : undefined
    opts.image_base64 = image_base64 || undefined
    opts.image_filename = image_filename || 'image.png'
  } else if (file_key || file_path) {
    opts.file_key = file_key && file_key.trim() ? file_key.trim() : undefined
    opts.file_name = file_name && file_name.trim() ? file_name.trim() : undefined
    opts.file_path = file_path && file_path.trim() ? file_path.trim() : undefined
  } else if (text != null) {
    opts.text = String(text)
  }

  const result = await feishuNotify.sendMessage(opts)
  return result
}

module.exports = { definition, execute }
