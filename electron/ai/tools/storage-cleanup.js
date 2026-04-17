const { auditStorage } = require('../storage-cleaner')
const { runStorageMaintenance } = require('../storage-maintenance')
const openultronConfig = require('../../openultron-config')
const { normalizeRelativePath, getPinnedPaths } = require('../storage-policy')

const definition = {
  description: '审计或清理 ~/.openultron 下的缓存、临时目录、未引用产物与超大日志；支持 archive/pin/unpin，以及 get_policy/set_policy（由 AI 直接维护存储策略）与 run_maintenance（立即执行一次维护）。cleanup 仅执行受策略允许的低风险清理，不会删除知识库、会话历史或核心配置。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['audit', 'cleanup', 'archive', 'pin', 'unpin', 'list_pins', 'get_policy', 'set_policy', 'run_maintenance'],
        description: 'audit=仅审计 | cleanup=按策略执行低风险清理 | archive=按策略压缩归档旧会话/日记 | pin/unpin=维护固定保留路径 | list_pins=查看固定保留路径 | get_policy/set_policy=读取/更新存储策略 | run_maintenance=立即执行一次维护'
      },
      categories: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['runtimeCache', 'workspaceTemp', 'artifacts', 'screenshots', 'logs', 'webApps', 'conversations', 'memoryDiary']
        },
        description: '可选。仅审计/清理指定类别'
      },
      limit: {
        type: 'number',
        description: '最多返回多少条候选项，默认 100，最大 500'
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'pin/unpin 时使用。路径需相对 ~/.openultron，例如 "artifacts/store"、"workspace/projects/demo"'
      },
      storage: {
        type: 'object',
        description: 'set_policy 时使用。传入 storage 局部配置（将与现有策略合并后规范化），例如 { "categories": { "artifacts": { "ttlDays": 14 } } }'
      },
      reason: {
        type: 'string',
        description: 'run_maintenance 时的触发原因标记'
      }
    },
    required: ['action']
  }
}

function normalizePaths(paths) {
  return Array.isArray(paths)
    ? [...new Set(paths.map((x) => normalizeRelativePath(x)).filter(Boolean))]
    : []
}

async function execute(args = {}) {
  const action = String(args?.action || 'audit').trim()
  if (action === 'audit' || action === 'cleanup' || action === 'archive') {
    return auditStorage(args || {})
  }
  if (action === 'run_maintenance') {
    return runStorageMaintenance(String(args?.reason || 'tool_manual'))
  }
  if (action === 'get_policy') {
    const storage = typeof openultronConfig.getStorage === 'function' ? openultronConfig.getStorage() : {}
    return { success: true, storage }
  }
  if (action === 'set_policy') {
    const partial = args?.storage
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
      return { success: false, error: 'set_policy 需要 storage 对象参数' }
    }
    if (typeof openultronConfig.setStorage === 'function') {
      openultronConfig.setStorage(partial)
    }
    const storage = typeof openultronConfig.getStorage === 'function' ? openultronConfig.getStorage() : {}
    return { success: true, action, storage }
  }
  if (action === 'list_pins') {
    const storage = typeof openultronConfig.getStorage === 'function' ? openultronConfig.getStorage() : {}
    return { success: true, pinnedPaths: getPinnedPaths(storage) }
  }
  if (action === 'pin' || action === 'unpin') {
    const nextPaths = normalizePaths(args?.paths)
    if (nextPaths.length === 0) return { success: false, error: '缺少有效 paths 参数' }
    const storage = typeof openultronConfig.getStorage === 'function' ? openultronConfig.getStorage() : {}
    const current = getPinnedPaths(storage)
    const currentSet = new Set(current)
    if (action === 'pin') {
      for (const item of nextPaths) currentSet.add(item)
    } else {
      for (const item of nextPaths) currentSet.delete(item)
    }
    const pinnedPaths = [...currentSet]
    if (typeof openultronConfig.setStorage === 'function') {
      openultronConfig.setStorage({ pinnedPaths })
    }
    return {
      success: true,
      action,
      changedPaths: nextPaths,
      pinnedPaths
    }
  }
  return { success: false, error: `未知 action: ${action}` }
}

module.exports = { definition, execute }
