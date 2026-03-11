/**
 * 聊天渠道注册表：统一管理 ChatChannelAdapter，启动时按配置 startAll。
 * 见 EXTENSIBILITY-DESIGN.md 第三节。
 */

/** @type {Map<string, { id: string; configKey: string; start: Function; stop: Function; isRunning: Function; send: Function }>} */
const registry = new Map()

/**
 * @param {{ id: string; configKey: string; start: Function; stop: Function; isRunning: Function; send: Function }} adapter
 */
function register(adapter) {
  if (adapter && adapter.id) registry.set(adapter.id, adapter)
}

/**
 * @param {string} id
 */
function get(id) {
  return registry.get(id)
}

function list() {
  return Array.from(registry.values())
}

/**
 * 启动所有在配置中启用的渠道
 * @param {(key: string) => any} getConfig - 例如 key=>openultronConfig.getFeishu()
 */
async function startAll(getConfig) {
  for (const adapter of registry.values()) {
    const config = getConfig(adapter.configKey)
    const enabled = config && (config.receive_enabled === true || config.enabled === true)
    if (enabled) {
      try {
        await adapter.start(config)
        console.log(`[ChatChannel] ${adapter.id} started`)
      } catch (e) {
        console.warn(`[ChatChannel] ${adapter.id} start failed:`, e.message)
      }
    }
  }
}

async function stopAll() {
  for (const adapter of registry.values()) {
    try {
      await adapter.stop()
    } catch (e) {
      console.warn(`[ChatChannel] ${adapter.id} stop failed:`, e.message)
    }
  }
}

module.exports = {
  register,
  get,
  list,
  startAll,
  stopAll
}
