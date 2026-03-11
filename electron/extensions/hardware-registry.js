/**
 * 硬件能力注册表：截屏、摄像头等由 capability + method 统一暴露，供 hardware_invoke 工具调用。
 * 见 EXTENSIBILITY-DESIGN.md 第四节。
 */

/** @type {Map<string, { id: string; configKey?: string; methods: Array<{ name: string; description: string; parameters: object; invoke: Function }> }>} */
const registry = new Map()

/**
 * @param {{ id: string; configKey?: string; methods: Array<{ name: string; description: string; parameters: object; invoke: Function }> }} capability
 */
function register(capability) {
  if (capability && capability.id && Array.isArray(capability.methods)) {
    registry.set(capability.id, capability)
  }
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
