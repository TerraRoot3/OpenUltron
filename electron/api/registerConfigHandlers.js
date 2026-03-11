/**
 * 将配置相关能力注册到 invokeRegistry，供 IPC 与 HTTP 共用。
 */
const invokeRegistry = require('./invokeRegistry')
const configService = require('../services/configService')

function registerConfigHandlers(store) {
  const config = configService.create(store)

  invokeRegistry.register('get-config', (args) => config.getConfig(args))
  invokeRegistry.register('set-config', (args) => config.setConfig(args))
  invokeRegistry.register('get-all-configs', () => config.getAllConfigs())
  invokeRegistry.register('save-config', (args) => config.saveConfig(args))
  invokeRegistry.register('get-saved-configs', () => config.getSavedConfigs())
  invokeRegistry.register('save-saved-configs', (args) => config.saveSavedConfigs(args))
}

module.exports = { registerConfigHandlers }
