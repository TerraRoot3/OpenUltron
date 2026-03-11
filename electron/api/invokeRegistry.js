/**
 * 统一调用注册表：同一套能力既可被 IPC（应用内）调用，也可被 HTTP API（浏览器/Node 直连）调用，数据源一致。
 * - 应用内：preload -> ipcRenderer.invoke(channel, ...args) -> main 里 ipcMain.handle 转发到本 registry
 * - 浏览器/Node：HTTP POST /api/invoke { channel, args } -> 本 registry
 */

const handlers = new Map()

/**
 * 注册一个 channel 的处理器。handler 签名为 async (args) => result，args 为数组（对应 IPC 的 event 后的参数）。
 * @param {string} channel - 通道名，与 IPC channel 一致，如 'get-config', 'cron-list'
 * @param {(args: any[]) => Promise<any>} handler
 */
function register(channel, handler) {
  if (typeof handler !== 'function') throw new Error(`handler for ${channel} must be a function`)
  handlers.set(channel, handler)
}

/**
 * 调用已注册的 channel。
 * @param {string} channel
 * @param {any[]} args - 参数数组，与 IPC 调用时除 event 外的参数一致
 * @returns {Promise<any>}
 */
async function invoke(channel, args = []) {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`Unknown channel: ${channel}`)
  return fn(args)
}

/**
 * 返回已注册的 channel 列表（用于文档或白名单）。
 * @returns {string[]}
 */
function listChannels() {
  return Array.from(handlers.keys())
}

/**
 * 是否有某 channel
 * @param {string} channel
 * @returns {boolean}
 */
function has(channel) {
  return handlers.has(channel)
}

module.exports = {
  register,
  invoke,
  listChannels,
  has
}
