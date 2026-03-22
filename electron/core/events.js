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
 * 同步触发：依次调用 handlers，**不等待** async 函数完成；若某个 handler 返回 Promise，
 * 本函数会**提前 return 该 Promise** 且**不再调用**后续 handlers（历史行为，勿依赖）。
 * 多订阅者且需全部执行完毕时请用 **emitAsync** 或显式 pipeline。详见 `docs/MESSAGE-CONTRACT.md` §4。
 *
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
 * 等待所有 handler 完成（各自 catch 后仍计入 Promise.all）。
 * 新增「上下文 hook」、多步副作用时优先使用本方法而非 emit。
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
