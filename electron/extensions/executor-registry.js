/**
 * 执行器注册表：统一管理 Shell / Python / Node 等运行时执行器。
 * 见 EXTENSIBILITY-DESIGN.md 第五节。
 */

/** @type {Map<string, { id: string; name: string; execute: Function; listRuntimes?: Function }>} */
const registry = new Map()

/**
 * @param {{ id: string; name: string; execute: Function; listRuntimes?: Function }} executor
 */
function register(executor) {
  if (executor && executor.id) registry.set(executor.id, executor)
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

module.exports = {
  register,
  get,
  list
}
