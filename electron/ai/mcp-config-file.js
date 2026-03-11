// MCP 配置文件管理：<appRoot>/mcp.json（与 openultron.json 同级）
// 格式兼容 Claude Desktop: { mcpServers: { [name]: { command, args, env } | { url, headers } } }

const path = require('path')
const fs = require('fs')
const { getAppRootPath } = require('../app-root')

/** MCP 配置文件路径：<appRoot>/mcp.json */
function getMcpConfigPath() {
  return getAppRootPath('mcp.json')
}

const DEFAULT_MCP_CONFIG = { mcpServers: {} }

/**
 * 读取 MCP 配置，返回 JSON 字符串（兼容现有调用方）
 * 若文件不存在且 store 有旧数据则一次性迁移并落盘
 * @param {object} [store] - electron-store，仅首次迁移用
 * @returns {string} JSON string
 */
function readMcpConfig(store) {
  const configPath = getMcpConfigPath()
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8')
      JSON.parse(raw) // 验证合法性
      return raw
    } catch (e) {
      console.warn('[MCP] 读取 mcp.json 失败，尝试迁移:', e.message)
    }
  }
  // 首次迁移：从 electron-store 读取
  const legacy = store ? store.get('aiMcpConfig', null) : null
  const data = legacy ? (() => { try { JSON.parse(legacy); return legacy } catch { return null } })() : null
  const result = data || JSON.stringify(DEFAULT_MCP_CONFIG, null, 2)
  writeMcpConfig(result)
  return result
}

/**
 * 写入 MCP 配置
 * @param {string} jsonStr - JSON 字符串
 */
function writeMcpConfig(jsonStr) {
  const configPath = getMcpConfigPath()
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  // 美化写入
  try {
    const parsed = JSON.parse(jsonStr)
    fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf-8')
  } catch {
    fs.writeFileSync(configPath, jsonStr, 'utf-8')
  }
}

module.exports = { getMcpConfigPath, readMcpConfig, writeMcpConfig }
