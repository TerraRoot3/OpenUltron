/**
 * 系统通知能力：在桌面显示原生通知（标题 + 正文）。
 * 见 EXTENSIBILITY-DESIGN.md 4.1、Phase 3.1。
 */
const { Notification } = require('electron')

async function showInvoke(args) {
  const title = args && args.title != null ? String(args.title) : '通知'
  const body = args && args.body != null ? String(args.body) : ''
  try {
    if (!Notification.isSupported()) {
      return { success: false, error: '当前系统不支持原生通知' }
    }
    const n = new Notification({
      title: title || '通知',
      body: body || '',
      silent: args && args.silent === true
    })
    n.show()
    return { success: true, data: { title: n.title, body: n.body, tip: '系统通知已弹出' } }
  } catch (e) {
    return { success: false, error: e.message || String(e) }
  }
}

module.exports = {
  id: 'notify',
  configKey: 'hardware.notify',
  methods: [
    {
      name: 'show',
      description: '在桌面显示一条系统原生通知（标题与正文）',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '通知标题，可选，默认「通知」' },
          body: { type: 'string', description: '通知正文，可选' },
          silent: { type: 'boolean', description: '是否静音，可选' }
        },
        required: []
      },
      invoke: showInvoke
    }
  ]
}
