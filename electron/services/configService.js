/**
 * 配置服务：唯一数据源，供 IPC 与 HTTP API 共用。
 * 使用方式：create(store) 返回方法集合，再在 invokeRegistry 中注册对应 channel。
 */

function create(store) {
  if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
    throw new Error('configService.create(store) requires electron-store instance')
  }

  return {
    async getConfig(args) {
      const [key] = args
      try {
        return store.get(key, null)
      } catch (e) {
        console.error('[configService] getConfig:', e.message)
        return null
      }
    },

    async setConfig(args) {
      const [key, value] = args
      try {
        store.set(key, value)
        return true
      } catch (e) {
        console.error('[configService] setConfig:', e.message)
        return false
      }
    },

    async getAllConfigs() {
      try {
        return store.store
      } catch (e) {
        console.error('[configService] getAllConfigs:', e.message)
        return {}
      }
    },

    async saveConfig(args) {
      const [payload] = args
      const { key, value } = payload || {}
      try {
        store.set(key, value)
        return true
      } catch (e) {
        console.error('[configService] saveConfig:', e.message)
        return false
      }
    },

    async getSavedConfigs() {
      try {
        const configs = store.get('savedConfigs', [])
        return { success: true, configs }
      } catch (e) {
        console.error('[configService] getSavedConfigs:', e.message)
        return { success: false, message: e.message, configs: [] }
      }
    },

    async saveSavedConfigs(args) {
      const [data] = args
      try {
        store.set('savedConfigs', data?.configs ?? data)
        return { success: true, message: '保存成功' }
      } catch (e) {
        console.error('[configService] saveSavedConfigs:', e.message)
        return { success: false, message: `保存失败: ${e.message}` }
      }
    }
  }
}

module.exports = { create }
