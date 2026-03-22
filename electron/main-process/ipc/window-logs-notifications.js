/**
 * 低耦合 IPC：调试日志、日志文件、窗口 chrome、刷新信号、系统通知、本地 API 端口查询。
 * 依赖通过参数注入，避免 require main.js。
 */

/**
 * @param {object} deps
 * @param {(ch: string, fn: Function) => void} deps.registerChannel
 * @param {() => string} deps.getLogPath
 * @param {(lines?: number) => string} deps.readTail
 * @param {(lines?: number) => string} deps.getForAi
 * @param {typeof import('electron').BrowserWindow} deps.BrowserWindow
 * @param {typeof import('electron').Notification} deps.SystemNotification
 * @param {() => import('electron').BrowserWindow | null | undefined} deps.getMainWindow
 * @param {() => number | null} deps.getApiServerPort
 */
function registerWindowLogsAndNotificationsIpc (deps) {
  const {
    registerChannel,
    getLogPath,
    readTail,
    getForAi,
    BrowserWindow,
    SystemNotification,
    getMainWindow,
    getApiServerPort
  } = deps

  function getMainOrFocusedWindow () {
    return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  }

  registerChannel('log-to-frontend', async (event, message) => {
    console.log(`🔍 前台调试: ${message}`)
    return true
  })

  registerChannel('logs-get-path', () => getLogPath())
  registerChannel('logs-read-tail', (event, lines) => readTail(lines == null ? 2000 : lines))
  registerChannel('logs-get-for-ai', (event, lines) => getForAi(lines == null ? 500 : lines))

  registerChannel('window-minimize', async () => {
    const window = getMainOrFocusedWindow()
    if (window) window.minimize()
    return { success: !!window }
  })
  registerChannel('window-close', async () => {
    const window = getMainOrFocusedWindow()
    if (window) window.close()
    return { success: !!window }
  })
  registerChannel('toggle-maximize', async (event) => {
    try {
      const window = getMainOrFocusedWindow()
      if (!window) {
        return { success: false, error: 'No window found' }
      }
      if (window.isMaximized()) {
        window.unmaximize()
        return { success: true, maximized: false }
      }
      window.maximize()
      return { success: true, maximized: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  registerChannel('send-refresh-on-focus', async (event) => {
    try {
      const mainWindow = getMainWindow()
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('refresh-on-focus')
      }
      return true
    } catch (error) {
      console.error('❌ 发送刷新事件失败:', error.message)
      return false
    }
  })

  registerChannel('notify-refresh-complete', async (event) => {
    try {
      const mainWindow = getMainWindow()
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('refresh-complete')
      }
      return true
    } catch (error) {
      console.error('❌ 发送刷新完成事件失败:', error.message)
      return false
    }
  })

  registerChannel('show-system-notification', async (event, payload = {}) => {
    try {
      if (!SystemNotification.isSupported()) {
        return { success: false, error: '当前系统不支持原生通知' }
      }
      const title = String(payload.title != null ? payload.title : 'OpenUltron').slice(0, 200)
      const body = String(payload.body != null ? payload.body : '').slice(0, 500)
      const n = new SystemNotification({
        title: title || 'OpenUltron',
        body,
        silent: payload.silent === true
      })
      n.show()
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  registerChannel('get-api-base-url', () => {
    const port = getApiServerPort()
    return {
      url: port ? `http://127.0.0.1:${port}` : null,
      port: port || null
    }
  })
}

module.exports = { registerWindowLogsAndNotificationsIpc }
