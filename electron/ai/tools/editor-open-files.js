// 工具：获取编辑器当前打开的文件列表
// 在编辑器模式下使用，可获知用户当前关注的文件，为后续操作提供上下文

const { ipcMain } = require('electron')

function createEditorOpenFilesTool(pendingRequests) {
  const definition = {
    description: '获取代码编辑器中当前打开的文件列表（包含文件路径和文件名）。在编辑器模式下使用，可了解用户当前正在查看/编辑哪些文件，为代码分析、重构、问题定位提供上下文。',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  async function execute(args, { sender }) {
    if (!sender) {
      return { success: false, error: 'editor_open_files 需要渲染进程上下文' }
    }

    return new Promise((resolve) => {
      const requestId = `editor-files-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

      const timer = setTimeout(() => {
        pendingRequests.delete(requestId)
        resolve({ success: false, files: [], error: '获取编辑器文件列表超时' })
      }, 5000)

      pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timer)
          pendingRequests.delete(requestId)
          resolve(result)
        }
      })

      if (sender && !sender.isDestroyed()) sender.send('ai-get-editor-open-files', { requestId })
    })
  }

  return { definition, execute }
}

// 主进程注册响应处理器（在 main.js 中调用此函数完成注册）
function registerEditorOpenFilesHandler(pendingRequests) {
  ipcMain.handle('ai-editor-open-files-response', (event, { requestId, files }) => {
    const pending = pendingRequests.get(requestId)
    if (pending) {
      pending.resolve({
        success: true,
        files: files || [],
        count: (files || []).length
      })
    }
    return { ok: true }
  })
}

module.exports = { createEditorOpenFilesTool, registerEditorOpenFilesHandler }
