/**
 * 核心事件总线：扩展与应用层通过事件解耦，不直接调用 runChat 或会话存储。
 * 事件名见 EXTENSIBILITY-DESIGN.md 第二节。
 */

/**
 * @typedef {'chat.message.received' | 'chat.session.completed' | 'chat.session.error' | 'chat.typing'} CoreEvent
 */

/**
 * @param {CoreEvent} event
 * @param {(payload: any) => void | Promise<void>} handler
 */
function on(event, handler) {
  if (!this._handlers[event]) this._handlers[event] = []
  this._handlers[event].push(handler)
}

/**
 * @param {CoreEvent} event
 * @param {(payload: any) => void | Promise<void>} handler
 */
function off(event, handler) {
  if (!this._handlers[event]) return
  this._handlers[event] = this._handlers[event].filter(h => h !== handler)
}

/**
 * @param {CoreEvent} event
 * @param {any} payload
 * @returns {void | Promise<void>}
 */
function emit(event, payload) {
  const list = this._handlers[event]
  if (!list || list.length === 0) return
  for (const h of list) {
    try {
      const r = h(payload)
      if (r && typeof r.then === 'function') return r
    } catch (e) {
      console.error(`[EventBus] ${event} handler error:`, e)
    }
  }
}

/**
 * 异步 emit：等待所有返回 Promise 的 handler 完成（本实现为同步调用，首个 async 不 await）
 * 若需严格串行可在此处改为 await 每个 handler。
 */
function emitAsync(event, payload) {
  const list = this._handlers[event]
  if (!list || list.length === 0) return Promise.resolve()
  return Promise.all(list.map(h => Promise.resolve(h(payload)).catch(e => { console.error(`[EventBus] ${event} handler error:`, e) })))
}

function createEventBus() {
  const bus = {
    _handlers: /** @type {Record<CoreEvent, Array<(payload: any) => void | Promise<void>>>} */ ({}),
    on,
    off,
    emit,
    emitAsync
  }
  return bus
}

module.exports = { createEventBus }
