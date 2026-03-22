/**
 * 主会话 / 协调会话：列出或新建 Web 沙箱应用，供自然语言场景下配合 webapp_studio_invoke 使用。
 */

'use strict'

const { listInstalledApps, createBlankWebApp } = require('../../web-apps/registry')

const listDefinition = {
  description:
    '【侧栏「应用」·应用库】列出本机 Web 沙箱应用（id、version、展示名、路径）。关键词：web-apps、沙箱应用、已装应用。用户自然语言指某个应用但 id 不明时**优先**调用本工具，再 **webapp_studio_invoke**；app_hint 歧义时也用本工具排查。',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  }
}

const createDefinition = {
  description:
    '【侧栏「应用」·新建】创建空白 Web 沙箱应用（manifest、README、index.html、service.js，版本 0.1.0）。返回 path；**实现功能必须再调 webapp_studio_invoke**（project_path=返回的 path，或直接用 webapp_studio_invoke 的 create_new），**禁止**在本会话用 file_operation/apply_patch 写 ~/.openultron/web-apps。',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '可选；写入 manifest 的展示名（name），默认「未命名应用」'
      }
    },
    required: []
  }
}

function createWebAppsListTool() {
  async function execute() {
    try {
      const apps = listInstalledApps()
      return {
        success: true,
        count: apps.length,
        apps: apps.map((a) => ({
          id: a.id,
          version: a.version,
          name: a.name,
          path: a.path
        }))
      }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  }
  return { definition: listDefinition, execute }
}

function createWebAppsCreateTool() {
  async function execute(args) {
    try {
      const name = args && args.name != null ? String(args.name).trim() : ''
      const r = createBlankWebApp({ name: name || undefined })
      if (!r.success) {
        return { success: false, error: r.error || '创建失败' }
      }
      return {
        success: true,
        id: r.id,
        version: r.version,
        path: r.path,
        name: r.manifest?.name || '',
        preview_url: r.previewUrl || ''
      }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  }
  return { definition: createDefinition, execute }
}

module.exports = { createWebAppsListTool, createWebAppsCreateTool }
