/**
 * 主窗口、应用内静态 UI 服务（生产 dist）、应用菜单
 */

/**
 * @param {{
 *   app: import('electron').App
 *   BrowserWindow: typeof import('electron').BrowserWindow
 *   Menu: typeof import('electron').Menu
 *   shell: import('electron').Shell
 *   path: import('path')
 *   fs: import('fs')
 *   isDev: boolean
 *   APP_UI_PORT: number
 *   DEV_UI_PORT: number
 *   safeLog: (...args: any[]) => void
 *   safeError: (...args: any[]) => void
 *   preloadPath: string
 *   distPath: string
 *   getMainWindow: () => import('electron').BrowserWindow | null | undefined
 *   assignMainWindow: (w: import('electron').BrowserWindow | null) => void
 *   onDidFinishLoad: () => void | Promise<void>
 * }} deps
 */
function createMainWindowController(deps) {
  const {
    app,
    BrowserWindow,
    Menu,
    shell,
    path,
    fs,
    isDev,
    APP_UI_PORT,
    DEV_UI_PORT,
    safeLog,
    safeError,
    preloadPath,
    distPath,
    getMainWindow,
    assignMainWindow,
    onDidFinishLoad
  } = deps

  let appUiServer = null

  const ensureLocalResourceMediaAllowed = (headers = {}) => {
    const keys = Object.keys(headers)
    const cspKey = keys.find((k) => k.toLowerCase() === 'content-security-policy')
    if (!cspKey) return headers

    const cspList = Array.isArray(headers[cspKey]) ? headers[cspKey] : [headers[cspKey]]
    const normalize = (value) => String(value || '').trim()
    const fixed = cspList.map((entry) => {
      const str = normalize(entry)
      if (!str) return ''
      const parts = str.split(';').map((x) => x.trim()).filter(Boolean)
      const hasMedia = parts.some((p) => p.toLowerCase().startsWith('media-src'))
      if (hasMedia) {
        return parts.map((p) => {
          if (!p.toLowerCase().startsWith('media-src')) return p
          const srcs = p.replace(/^media-src\s+/i, '').trim()
          if (/(^|\\s)local-resource:\\b/.test(srcs)) return p
          return `${p} local-resource:`
        }).join('; ')
      }
      parts.push('media-src \'self\' local-resource: data:')
      return parts.join('; ')
    }).filter(Boolean)

    return {
      ...headers,
      [cspKey]: fixed
    }
  }

  function startAppUiServer() {
    return new Promise((resolve, reject) => {
      if (appUiServer) return resolve(`http://127.0.0.1:${APP_UI_PORT}`)
      if (!fs.existsSync(distPath)) return reject(new Error('dist 目录不存在'))
      const express = require('express')
      const expressApp = express()
      expressApp.use(express.static(distPath, { index: false }))
      expressApp.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')))
      appUiServer = expressApp.listen(APP_UI_PORT, '127.0.0.1', () => {
        safeLog('App UI server:', `http://127.0.0.1:${APP_UI_PORT}`)
        resolve(`http://127.0.0.1:${APP_UI_PORT}`)
      })
      appUiServer.on('error', reject)
    })
  }

  function createMenu() {
    const mainWindow = getMainWindow()
    const template = [
      {
        label: '应用',
        submenu: [
          { label: '关于', role: 'about' },
          { type: 'separator' },
          { label: '退出' }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { label: '撤销', accelerator: 'Command+Z', role: 'undo' },
          { label: '重做', accelerator: 'Shift+Command+Z', role: 'redo' },
          { type: 'separator' },
          { label: '剪切', accelerator: 'Command+X', role: 'cut' },
          { label: '复制', accelerator: 'Command+C', role: 'copy' },
          { label: '粘贴', accelerator: 'Command+V', role: 'paste' },
          { label: '全选', accelerator: 'Command+A', role: 'selectAll' }
        ]
      },
      {
        label: '视图',
        submenu: [
          {
            label: '重新加载当前标签页',
            accelerator: 'Command+R',
            click: () => {
              console.log('⌨️ Command+R 快捷键被触发')
              const mw = getMainWindow()
              if (mw && mw.webContents) {
                console.log('📡 发送 refresh-current-tab 消息到渲染进程')
                mw.webContents.send('refresh-current-tab')
              } else {
                console.log('❌ mainWindow 或 webContents 不可用')
              }
            }
          },
          { label: '强制重新加载', accelerator: 'Command+Shift+R', role: 'forceReload' },
          { label: '切换开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
          {
            label: '打开 Webview 开发者工具',
            accelerator: 'Command+Option+I',
            click: () => {
              const mw = getMainWindow()
              if (mw && mw.webContents) {
                mw.webContents.send('open-webview-devtools')
              }
            }
          },
          { type: 'separator' },
          { label: '实际大小', accelerator: 'Command+0', role: 'resetZoom' },
          { label: '放大', accelerator: 'Command+Plus', role: 'zoomIn' },
          { label: '缩小', accelerator: 'Command+-', role: 'zoomOut' },
          { type: 'separator' },
          { label: '切换全屏', accelerator: 'Ctrl+Command+F', role: 'togglefullscreen' }
        ]
      },
      {
        label: '窗口',
        submenu: [
          { label: '最小化', accelerator: 'Command+M', role: 'minimize' },
          { label: '关闭', accelerator: 'Command+W', role: 'close' }
        ]
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '了解更多',
            click: () => {
              shell.openExternal('https://github.com/your-repo/git-manager')
            }
          }
        ]
      }
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
  }

  function createWindow(productionAppUrl) {
    let mainWindow = getMainWindow()
    if (mainWindow) {
      safeLog('窗口已存在，聚焦到现有窗口')
      mainWindow.focus()
      return
    }

    safeLog('Creating window...')
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1200,
      minHeight: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: preloadPath,
        webviewTag: true
      },
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 8, y: 8 },
      show: false
    })
    assignMainWindow(mainWindow)

    const appSession = mainWindow.webContents.session
    const isChatLikePage = (url) => {
      if (!url || typeof url !== 'string') return false
      return /\/chat(?:\?|$|\/)/i.test(url)
    }
    appSession.webRequest.onHeadersReceived((details, callback) => {
      if (details.resourceType === 'mainFrame' && isChatLikePage(details.url)) {
        callback({ responseHeaders: ensureLocalResourceMediaAllowed(details.responseHeaders || {}) })
      } else {
        callback({ responseHeaders: details.responseHeaders })
      }
    })

    if (isDev) {
      safeLog('Loading development server...')
      mainWindow.loadURL('http://localhost:' + DEV_UI_PORT)
      mainWindow.webContents.openDevTools()
    } else {
      const url = productionAppUrl || `http://127.0.0.1:${APP_UI_PORT}`
      safeLog('Loading production build from', url)
      mainWindow.loadURL(url)
    }

    mainWindow.once('ready-to-show', () => {
      safeLog('Window ready to show, showing window...')
      mainWindow.show()
    })

    mainWindow.webContents.on('did-finish-load', () => {
      safeLog('Page finished loading')
      try {
        mainWindow.webContents.executeJavaScript(`
          (() => {
            const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
            const mediaSrc = "media-src 'self' local-resource: data: blob:"
            if (!meta) {
              const created = document.createElement('meta')
              created.setAttribute('http-equiv', 'Content-Security-Policy')
              created.setAttribute('content', mediaSrc)
              document.head.appendChild(created)
              return
            }
            const content = String(meta.getAttribute('content') || '')
            if (!/media-src/i.test(content)) {
              meta.setAttribute('content', `${content}${content ? '; ' : ''}${mediaSrc}`)
            }
          })()
        `)
      } catch { /* ignore */ }
      Promise.resolve(onDidFinishLoad()).catch(e => console.warn('[Feishu] 窗口加载后启动接收失败:', e.message))
    })

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      safeError('Page failed to load:', errorCode, errorDescription, validatedURL)
      if (isDev) {
        safeLog('Retrying to load...')
        setTimeout(() => {
          const mw = getMainWindow()
          if (mw) mw.loadURL('http://localhost:' + DEV_UI_PORT)
        }, 1000)
      }
    })

    if (isDev) {
      mainWindow.webContents.on('dom-ready', () => {
        safeLog('DOM ready in development mode')
      })
    }

    mainWindow.on('close', (event) => {
      if (!app.isQuiting) {
        event.preventDefault()
        mainWindow.hide()
        safeLog('📱 窗口已隐藏到应用图标')
      }
    })

    mainWindow.on('closed', () => {
      assignMainWindow(null)
    })

    mainWindow.on('focus', () => {
      const mw = getMainWindow()
      if (mw && mw.webContents) {
        mw.webContents.send('refresh-on-focus')
      }
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      const newWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 800,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          preload: preloadPath
        },
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 8, y: 8 },
        show: false
      })

      newWindow.loadURL(url)
      newWindow.once('ready-to-show', () => {
        newWindow.show()
      })

      newWindow.on('close', (event) => {
        if (!app.isQuiting) {
          event.preventDefault()
          newWindow.hide()
          console.log('📱 新窗口已隐藏到应用图标')
        }
      })

      newWindow.on('closed', () => {})

      return { action: 'allow' }
    })

    createMenu()
  }

  function closeAppUiServer() {
    if (appUiServer) {
      appUiServer.close()
      appUiServer = null
    }
  }

  return {
    startAppUiServer,
    createWindow,
    closeAppUiServer
  }
}

module.exports = { createMainWindowController }
