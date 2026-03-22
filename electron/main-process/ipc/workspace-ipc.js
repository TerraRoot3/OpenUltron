/**
 * 工作区路径：默认目录、持久化 extraPaths、选择文件夹、解析路径字符串。
 */

const fs = require('fs')
const pathMod = require('path')
const os = require('os')

/** 递归搜索时跳过的目录名 */
const WORKSPACE_SEARCH_IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', '.pnpm-store', 'build', 'out',
  'coverage', '.next', 'vendor', '.svn', '.hg'
])

/**
 * @param {string} rootResolved
 * @param {string} queryLower
 * @param {string[]} matches
 * @param {number} maxFiles
 * @param {number} depth
 * @param {number} maxDepth
 */
function workspaceSearchWalk (rootResolved, queryLower, matches, maxFiles, depth, maxDepth) {
  if (matches.length >= maxFiles || depth > maxDepth) return
  let entries
  try {
    entries = fs.readdirSync(rootResolved, { withFileTypes: true })
  } catch {
    return
  }
  const sep = pathMod.sep
  for (const ent of entries) {
    if (matches.length >= maxFiles) break
    const base = ent.name
    const full = pathMod.join(rootResolved, base)
    if (ent.isDirectory()) {
      if (WORKSPACE_SEARCH_IGNORE_DIRS.has(base)) continue
      workspaceSearchWalk(full, queryLower, matches, maxFiles, depth + 1, maxDepth)
    } else {
      const lowerPath = full.toLowerCase()
      if (!queryLower || lowerPath.includes(queryLower) || base.toLowerCase().includes(queryLower)) {
        matches.push(full)
      }
    }
  }
}

/**
 * @param {object} deps
 * @param {(ch: string, fn: Function) => void} deps.registerChannel
 * @param {object} deps.store
 * @param {typeof import('electron').dialog} deps.dialog
 * @param {() => import('electron').BrowserWindow | null | undefined} deps.getMainWindow
 * @param {() => void} deps.ensureWorkspaceDirs
 * @param {() => string} deps.getWorkspaceRoot
 * @param {(sub: string) => string} deps.getWorkspacePath
 */
function registerWorkspaceIpc (deps) {
  const {
    registerChannel,
    store,
    dialog,
    getMainWindow,
    ensureWorkspaceDirs,
    getWorkspaceRoot,
    getWorkspacePath
  } = deps

  registerChannel('workspace-get-defaults', async () => {
    try {
      ensureWorkspaceDirs()
      return {
        success: true,
        root: getWorkspaceRoot(),
        scriptsPath: getWorkspacePath('scripts'),
        projectsPath: getWorkspacePath('projects')
      }
    } catch (e) {
      return { success: false, message: e.message }
    }
  })

  registerChannel('workspace-load', async (event, { primaryPath }) => {
    try {
      const key = `workspace_${primaryPath}`
      const data = store.get(key, { extraPaths: [] })
      return { success: true, extraPaths: data.extraPaths || [] }
    } catch (e) {
      return { success: false, extraPaths: [], message: e.message }
    }
  })

  registerChannel('workspace-save', async (event, { primaryPath, extraPaths }) => {
    try {
      const key = `workspace_${primaryPath}`
      store.set(key, { extraPaths: extraPaths || [] })
      return { success: true }
    } catch (e) {
      return { success: false, message: e.message }
    }
  })

  registerChannel('workspace-pick-folder', async (event) => {
    try {
      const parent = getMainWindow()
      const result = await dialog.showOpenDialog(parent, {
        properties: ['openDirectory'],
        title: '添加文件夹到工作区'
      })
      if (result.canceled || !result.filePaths.length) {
        return { success: false, path: null }
      }
      return { success: true, path: result.filePaths[0] }
    } catch (e) {
      return { success: false, path: null, message: e.message }
    }
  })

  registerChannel('workspace-resolve-path', async (event, { path: rawPath }) => {
    if (!rawPath || typeof rawPath !== 'string') {
      return { success: false, path: null, message: '路径为空' }
    }
    try {
      const expanded = rawPath.trim().replace(/^~/, os.homedir())
      const absolutePath = pathMod.resolve(expanded)
      const stat = fs.statSync(absolutePath)
      if (!stat.isDirectory()) {
        return { success: false, path: null, message: '不是目录' }
      }
      fs.readdirSync(absolutePath, { withFileTypes: true })
      return { success: true, path: absolutePath }
    } catch (e) {
      const msg = e.code === 'ENOENT' ? '路径不存在' : e.code === 'EACCES' ? '无读取权限' : e.message
      return { success: false, path: null, message: msg }
    }
  })

  registerChannel('workspace-search-files', async (event, { rootPath, query, maxFiles = 50 } = {}) => {
    if (!rootPath || typeof rootPath !== 'string') {
      return { success: false, matches: [], message: 'rootPath 无效' }
    }
    const q = String(query || '').trim()
    if (!q) {
      return { success: true, matches: [] }
    }
    try {
      const expanded = rootPath.trim().replace(/^~/, os.homedir())
      const absolutePath = pathMod.resolve(expanded)
      const stat = fs.statSync(absolutePath)
      if (!stat.isDirectory()) {
        return { success: false, matches: [], message: '不是目录' }
      }
      const cap = Math.min(200, Math.max(1, Number(maxFiles) || 50))
      const matches = []
      workspaceSearchWalk(absolutePath, q.toLowerCase(), matches, cap, 0, 12)
      return { success: true, matches }
    } catch (e) {
      return { success: false, matches: [], message: e.message }
    }
  })
}

module.exports = { registerWorkspaceIpc }
