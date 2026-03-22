/**
 * 从 ai-core-stack-bootstrap 迁出：工具注册 try/catch 块，减轻 bootstrap 体积。
 */

/**
 * @param {object} deps
 * @param {import('../ai/tool-registry')} deps.aiToolRegistry
 * @param {Function} deps.runSubChat
 * @param {Function} deps.getResolvedAIConfig
 * @param {import('../ai/orchestrator').Orchestrator} deps.aiOrchestrator
 * @param {{ info?: Function, warn?: Function }} [deps.appLogger]
 * @param {Function} deps.getAIConfigLegacy
 * @param {import('electron-store')} deps.store
 * @param {Function} deps.verifyProviderModel
 */
function registerMidStackAiTools(deps) {
  const { aiToolRegistry, runSubChat, getResolvedAIConfig, aiOrchestrator, appLogger, getAIConfigLegacy, store, verifyProviderModel } = deps
  try {
    const { createSessionsSpawnTool } = require('../ai/tools/sessions-spawn')
    aiToolRegistry.register('sessions_spawn', createSessionsSpawnTool(runSubChat))
  } catch (e) {
    console.warn('加载 sessions_spawn 工具失败:', e.message)
  }
  try {
    const { createConsolidateLessonsTool } = require('../ai/tools/consolidate-lessons-learned')
    aiToolRegistry.register(
      'consolidate_lessons_learned',
      createConsolidateLessonsTool({ getResolvedAIConfig, aiOrchestrator, appLogger })
    )
  } catch (e) {
    console.warn('加载 consolidate_lessons_learned 工具失败:', e.message)
  }
  try {
    const { createListConfiguredModelsTool } = require('../ai/tools/list-configured-models')
    aiToolRegistry.register('list_configured_models', createListConfiguredModelsTool(getAIConfigLegacy))
  } catch (e) {
    console.warn('加载 list_configured_models 工具失败:', e.message)
  }
  try {
    const { createListProvidersAndModelsTool } = require('../ai/tools/list-providers-models')
    aiToolRegistry.register('list_providers_and_models', createListProvidersAndModelsTool(store, getAIConfigLegacy))
  } catch (e) {
    console.warn('加载 list_providers_and_models 工具失败:', e.message)
  }
  try {
    const { createVerifyProviderModelTool } = require('../ai/tools/verify-provider-model')
    aiToolRegistry.register('verify_provider_model', createVerifyProviderModelTool(verifyProviderModel))
  } catch (e) {
    console.warn('加载 verify_provider_model 工具失败:', e.message)
  }
}

/**
 * @param {object} deps
 * @param {import('../ai/tool-registry')} deps.aiToolRegistry
 * @param {{ stopChat: (id: string) => void }} deps.aiGateway
 * @param {Function} deps.stopPreviousRunsForChannel
 * @param {Function} deps.waitForPreviousRuns
 */
function registerPostGatewayAiTools(deps) {
  const { aiToolRegistry, aiGateway, stopPreviousRunsForChannel, waitForPreviousRuns } = deps
  try {
    const { createStopCurrentTaskTool } = require('../ai/tools/stop-current-task')
    aiToolRegistry.register('stop_current_task', createStopCurrentTaskTool((sessionId) => aiGateway.stopChat(sessionId)))
  } catch (e) {
    console.warn('加载 stop_current_task 工具失败:', e.message)
  }
  try {
    const { createStopPreviousTaskTool } = require('../ai/tools/stop-previous-task')
    aiToolRegistry.register('stop_previous_task', createStopPreviousTaskTool(stopPreviousRunsForChannel))
  } catch (e) {
    console.warn('加载 stop_previous_task 工具失败:', e.message)
  }
  try {
    const { createWaitForPreviousRunTool } = require('../ai/tools/wait-for-previous-run')
    aiToolRegistry.register('wait_for_previous_run', createWaitForPreviousRunTool(waitForPreviousRuns))
  } catch (e) {
    console.warn('加载 wait_for_previous_run 工具失败:', e.message)
  }
}

module.exports = { registerMidStackAiTools, registerPostGatewayAiTools }
