// AI 工具：更新 MCP 配置（让 AI 自己管理 MCP 服务器）
function createUpdateMcpConfigTool(store, mcpManager) {
  return {
    definition: {
      description: '更新 MCP 服务器配置。可以添加、修改或删除 MCP 服务器。配置格式与 Claude Desktop 一致。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'update', 'remove', 'get'],
            description: 'add=添加/更新服务器, remove=删除服务器, get=获取当前配置'
          },
          name: {
            type: 'string',
            description: '服务器名称（action 为 add/update/remove 时必填）'
          },
          config: {
            type: 'object',
            description: '服务器配置（action 为 add/update 时必填）。stdio 类型：{ command, args, env }，SSE 类型：{ url, headers }'
          }
        },
        required: ['action']
      }
    },
    async execute({ action, name, config }) {
      const jsonStr = store.get('aiMcpConfig', '{}')
      let mcpConfig = {}
      try { mcpConfig = JSON.parse(jsonStr) } catch {}

      if (action === 'get') {
        return { config: mcpConfig }
      }

      if (action === 'remove') {
        if (!name) return { error: '缺少 name 参数' }
        delete mcpConfig[name]
        mcpManager.stopServer(name)
      } else if (action === 'add' || action === 'update') {
        if (!name || !config) return { error: '缺少 name 或 config 参数' }
        mcpConfig[name] = config
      }

      store.set('aiMcpConfig', JSON.stringify(mcpConfig, null, 2))

      // 重启对应的 server
      if (action !== 'remove') {
        try {
          const cfg = {
            name,
            type: config.url ? 'sse' : 'stdio',
            command: config.command,
            args: config.args || [],
            env: config.env || {},
            url: config.url,
            headers: config.headers || {}
          }
          await mcpManager.startServer(cfg)
          return { success: true, message: `MCP 服务器 "${name}" 已配置并启动` }
        } catch (e) {
          return { success: true, message: `配置已保存，但启动失败: ${e.message}` }
        }
      }

      return { success: true, message: `MCP 服务器 "${name}" 已${action === 'remove' ? '移除' : '更新'}` }
    }
  }
}

module.exports = { createUpdateMcpConfigTool }
