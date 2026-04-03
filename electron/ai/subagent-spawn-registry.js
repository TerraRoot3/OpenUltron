'use strict'

/**
 * 子 Agent 并发槽位与父子会话登记，用于 maxConcurrent / maxChildrenPerAgent 及 stopChat 级联中止。
 */

let activeGlobal = 0
/** @type {Map<string, number>} */
const activePerParent = new Map()
/** @type {Map<string, Set<string>>} */
const childrenByParent = new Map()
/** 子会话 spawn 深度：主会话为 0；第一层 sub-* 为 1；第二层为 2（叶子，禁止再 spawn） */
/** @type {Map<string, number>} */
const spawnDepthBySubSessionId = new Map()
/** 子会话创建时使用的 profile id（用于嵌套 spawn 时校验 coordinator） */
/** @type {Map<string, string>} */
const profileIdBySubSessionId = new Map()

function normalizeParentKey(sessionId) {
  const s = String(sessionId || '').trim()
  if (!s) return ''
  const m = s.match(/^(.*)-run-\d+$/)
  return m && m[1] ? String(m[1]).trim() : s
}

/**
 * @param {string} parentSessionId
 * @param {{ maxConcurrent?: number, maxChildrenPerAgent?: number }} cfg
 * @returns {{ ok: boolean, reason?: string, parentKey?: string }}
 */
function acquireSpawnSlot(parentSessionId, cfg = {}) {
  const maxG = Math.max(1, Number(cfg.maxConcurrent) || 8)
  const maxC = Math.max(1, Number(cfg.maxChildrenPerAgent) || 5)
  if (activeGlobal >= maxG) {
    return { ok: false, reason: 'subagent_global_concurrent_cap' }
  }
  const parentKey = normalizeParentKey(parentSessionId)
  const n = activePerParent.get(parentKey) || 0
  if (n >= maxC) {
    return { ok: false, reason: 'subagent_parent_children_cap' }
  }
  activeGlobal += 1
  activePerParent.set(parentKey, n + 1)
  return { ok: true, parentKey }
}

function releaseSpawnSlot(parentSessionId) {
  const parentKey = normalizeParentKey(parentSessionId)
  activeGlobal = Math.max(0, activeGlobal - 1)
  const n = (activePerParent.get(parentKey) || 1) - 1
  if (n <= 0) activePerParent.delete(parentKey)
  else activePerParent.set(parentKey, n)
}

function registerSubagentChild(parentSessionId, subSessionId) {
  const parentKey = normalizeParentKey(parentSessionId)
  const sid = String(subSessionId || '').trim()
  if (!parentKey || !sid) return
  if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, new Set())
  childrenByParent.get(parentKey).add(sid)
}

function unregisterSubagentChild(parentSessionId, subSessionId) {
  const parentKey = normalizeParentKey(parentSessionId)
  const sid = String(subSessionId || '').trim()
  const set = childrenByParent.get(parentKey)
  if (!set || !sid) return
  set.delete(sid)
  if (set.size === 0) childrenByParent.delete(parentKey)
}

function getChildSubSessionIdsForParent(parentSessionId) {
  const parentKey = normalizeParentKey(parentSessionId)
  const set = childrenByParent.get(parentKey)
  return set ? [...set] : []
}

function clearChildrenForParent(parentSessionId) {
  const parentKey = normalizeParentKey(parentSessionId)
  childrenByParent.delete(parentKey)
}

/**
 * @param {string} sessionId
 * @returns {number} 主会话 0；未知 sub-* 默认 1（兼容旧会话）
 */
function getSpawnDepth(sessionId) {
  const key = normalizeParentKey(sessionId)
  if (!key || !key.startsWith('sub-')) return 0
  return spawnDepthBySubSessionId.has(key) ? spawnDepthBySubSessionId.get(key) : 1
}

/**
 * @param {string} sessionId
 * @returns {string}
 */
function getSubagentProfileIdForSession(sessionId) {
  const key = normalizeParentKey(sessionId)
  if (!key || !key.startsWith('sub-')) return ''
  return profileIdBySubSessionId.get(key) || 'executor'
}

/**
 * 登记子会话元数据并挂到父会话子列表（须在 acquireSpawnSlot 成功后调用）
 * @param {string} parentSessionId
 * @param {string} subSessionId
 * @param {string} profileId
 */
function registerSubagentSpawn(parentSessionId, subSessionId, profileId) {
  const pk = normalizeParentKey(parentSessionId)
  const sid = String(subSessionId || '').trim()
  const pid = String(profileId || 'executor').trim() || 'executor'
  let parentDepth = 0
  if (pk && pk.startsWith('sub-')) {
    parentDepth = spawnDepthBySubSessionId.has(pk) ? spawnDepthBySubSessionId.get(pk) : 1
  }
  const childDepth = parentDepth + 1
  spawnDepthBySubSessionId.set(sid, childDepth)
  profileIdBySubSessionId.set(sid, pid)
  registerSubagentChild(parentSessionId, subSessionId)
}

function clearSubagentSpawnMeta(subSessionId) {
  const sid = String(subSessionId || '').trim()
  if (!sid) return
  spawnDepthBySubSessionId.delete(sid)
  profileIdBySubSessionId.delete(sid)
}

/**
 * 调用方即将创建子会话前校验（sessions_spawn / runSubChat 共用）
 * @param {string} callerSessionId 发起 spawn 的会话 id（主会话或 sub-*）
 * @param {{ maxSpawnDepth?: number }} subOrc
 */
function validateNestedSpawnEligibility(callerSessionId, subOrc = {}) {
  const maxD = Number.isFinite(Number(subOrc.maxSpawnDepth)) ? Math.max(1, Math.min(5, Number(subOrc.maxSpawnDepth))) : 1
  const pk = normalizeParentKey(callerSessionId || '')
  const parentDepth = pk.startsWith('sub-') ? getSpawnDepth(pk) : 0
  const childDepth = parentDepth + 1
  if (childDepth > maxD) {
    return {
      ok: false,
      error: `子 Agent 嵌套深度将超过上限（maxSpawnDepth=${maxD}，当前父 depth=${parentDepth}）`
    }
  }
  if (parentDepth >= 2) {
    return { ok: false, error: '叶子子任务（depth=2）禁止再 sessions_spawn' }
  }
  if (parentDepth >= 1) {
    const callerProfile = getSubagentProfileIdForSession(pk)
    if (callerProfile !== 'coordinator') {
      return {
        ok: false,
        error: '仅 coordinator profile 的子会话可在嵌套层再次 sessions_spawn（请用 profile=coordinator 创建该子会话，并设置 maxSpawnDepth≥2）'
      }
    }
  }
  return { ok: true }
}

function resetRegistryForTests() {
  activeGlobal = 0
  activePerParent.clear()
  childrenByParent.clear()
  spawnDepthBySubSessionId.clear()
  profileIdBySubSessionId.clear()
}

module.exports = {
  normalizeParentKey,
  acquireSpawnSlot,
  releaseSpawnSlot,
  registerSubagentChild,
  unregisterSubagentChild,
  registerSubagentSpawn,
  clearSubagentSpawnMeta,
  getSpawnDepth,
  getSubagentProfileIdForSession,
  validateNestedSpawnEligibility,
  getChildSubSessionIdsForParent,
  clearChildrenForParent,
  resetRegistryForTests
}
