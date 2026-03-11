/**
 * 屏幕截屏能力：截取应用内置浏览器窗口当前页面。
 * 复用 browser-window-manager，见 EXTENSIBILITY-DESIGN.md 4.1、4.3。
 */
const path = require('path')
const fs = require('fs')
const { getAppRootPath } = require('../../app-root')
const browserManager = require('../../ai/browser-window-manager')

async function captureInvoke(args, context) {
  try {
    const win = await browserManager.getWindow()
    const wc = win.webContents
    const img = await wc.capturePage()
    const pngBuffer = img.toPNG()
    const screenshotDir = getAppRootPath('screenshots')
    fs.mkdirSync(screenshotDir, { recursive: true })
    const filename = `screenshot-${Date.now()}.png`
    const filepath = path.join(screenshotDir, filename)
    fs.writeFileSync(filepath, pngBuffer)
    const resourceUrl = `local-resource://screenshots/${filename}`
    return {
      success: true,
      data: {
        file_path: filepath,
        file_url: resourceUrl,
        url: wc.getURL(),
        tip: `截图已保存。应用内展示：![截图](${resourceUrl})。飞书会话中会由系统自动发到当前会话。`
      }
    }
  } catch (e) {
    return { success: false, error: e.message || String(e) }
  }
}

module.exports = {
  id: 'screen',
  configKey: 'hardware.screen',
  methods: [
    {
      name: 'capture',
      description: '截取应用内置浏览器窗口当前页面的截图',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      invoke: captureInvoke
    }
  ]
}
