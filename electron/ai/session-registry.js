// 全局会话注册表 - 跟踪所有 AI 会话的完整生命周期
// 两层状态模型：
//   页面层（前端 mount/unmount）：openViews 集合
//   处理层（orchestrator startChat/complete）：running / paused
//
// 状态机：
//   [前端打开页面] → idle（在线，等待用户输入）
//   [用户发送消息] → running（AI 正在处理）
//   [AI 回复完成]  → idle（回到等待）
//   [用户暂停]     → paused
//   [前端关闭页面] → closed（从 openViews 移除）

const EventEmitter = require('events')

// 仅多 Agent/子 Agent 编排与拿结果，不做会话监控（无通知、无状态广播）

class SessionRegistry extends EventEmitter {
  constructor() {
    super()
    this.sessions = new Map()       // sessionId → SessionEntry
  }

  _senderId(sender) {
    return sender && sender.id != null ? sender.id : null
  }

  // ========== 前端视图层（页面 mount/unmount 调用） ==========

  /** 前端打开了一个会话页面（ChatPanel mount 时调用） */
  registerView(sessionId, meta) {
    const existing = this.sessions.get(sessionId)
    if (existing) {
      const nextSender = meta.viewSender || null
      const existingSenderId = this._senderId(existing.viewSender)
      const nextSenderId = this._senderId(nextSender)
      // 已有 owner 时禁止其他 sender 抢占该会话
      if (existing.viewSender && nextSender && existingSenderId !== nextSenderId) {
        return { success: false, error: '会话已被其他视图占用（owner mismatch）' }
      }
      existing.viewOpen = true
      existing.viewSender = existing.viewSender || nextSender
      if (meta.projectPath) existing.projectPath = meta.projectPath
      if (meta.projectName) existing.projectName = meta.projectName
      if (meta.sessionTitle !== undefined) existing.sessionTitle = meta.sessionTitle
      if (meta.model) existing.model = meta.model
      if (meta.lastContent && !existing.lastContent) existing.lastContent = meta.lastContent
      return { success: true }
    }
    this.sessions.set(sessionId, {
      sessionId,
      projectPath: meta.projectPath || '',
      projectName: meta.projectName || this._extractProjectName(meta.projectPath),
      sessionTitle: meta.sessionTitle || '',
      model: meta.model || '',
      apiBaseUrl: meta.apiBaseUrl || '',
      sender: null,
      abortController: null,
      viewSender: meta.viewSender || null,
      viewOpen: true,
      status: 'idle',
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      lastContent: meta.lastContent || '',
      lastToolCall: null,
      iteration: 0,
      totalIterations: 0,
      paused: false,
      pauseResolver: null,
      completedAt: null,
    })
    return { success: true }
  }

  /** 前端关闭了会话页面（ChatPanel unmount 时调用） */
  unregisterView(sessionId) {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    entry.viewOpen = false
    if (entry.status === 'idle' || entry.status === 'completed' || entry.status === 'error') {
      entry.status = 'closed'
      entry.completedAt = entry.completedAt || new Date().toISOString()
      setTimeout(() => {
        const e = this.sessions.get(sessionId)
        if (e && e.status === 'closed') this.sessions.delete(sessionId)
      }, 2000)
    }
  }

  // ========== 处理层（orchestrator 调用） ==========

  /** orchestrator.startChat 时调用 - 标记为 running */
  markRunning(sessionId, meta) {
    let entry = this.sessions.get(sessionId)
    if (!entry) {
      // 前端可能还没来得及 registerView（如 Heartbeat 等后台会话）
      this.sessions.set(sessionId, {
        sessionId,
        projectPath: meta.projectPath || '',
        projectName: meta.projectName || this._extractProjectName(meta.projectPath),
        model: meta.model || '',
        apiBaseUrl: meta.apiBaseUrl || '',
        sender: meta.sender,
        abortController: meta.abortController,
        viewOpen: false,
        status: 'running',
        startedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        lastContent: '',
        lastToolCall: null,
        iteration: 0,
        totalIterations: 0,
        paused: false,
        pauseResolver: null,
        completedAt: null,
      })
    } else {
      entry.status = 'running'
      entry.sender = meta.sender
      entry.abortController = meta.abortController
      entry.iteration = 0
      if (meta.model) entry.model = meta.model
      if (meta.apiBaseUrl) entry.apiBaseUrl = meta.apiBaseUrl
    }
  }

  /** orchestrator 完成后调用 - 回到 idle 或 closed，结果在 entry.lastContent */
  markComplete(sessionId) {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    entry.abortController = null

    if (entry.viewOpen) {
      entry.status = 'idle'
    } else {
      entry.status = 'completed'
      entry.completedAt = new Date().toISOString()
      setTimeout(() => {
        const e = this.sessions.get(sessionId)
        if (e && (e.status === 'completed' || e.status === 'closed')) this.sessions.delete(sessionId)
      }, 60000)
    }
  }

  /** 标记错误 */
  markError(sessionId, error) {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    entry.status = entry.viewOpen ? 'idle' : 'error'
    entry.lastContent = `❌ ${error}`
  }

  /** 更新最新 token */
  updateToken(sessionId, token) {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    entry.lastActivity = new Date().toISOString()
    entry.lastContent = (entry.lastContent + token).slice(-200)
  }

  /** 更新工具调用 */
  updateToolCall(sessionId, toolCall) {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    entry.lastActivity = new Date().toISOString()
    entry.lastToolCall = { name: toolCall.name, arguments: toolCall.arguments }
    entry.iteration = (entry.iteration || 0) + 1
    entry.totalIterations = (entry.totalIterations || 0) + 1
  }

  /** 前端更新会话元信息（模型切换等） */
  updateMeta(sessionId, meta) {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    if (meta.model) entry.model = meta.model
    if (meta.projectName) entry.projectName = meta.projectName
    if (meta.sessionTitle !== undefined) entry.sessionTitle = meta.sessionTitle
    if (meta.apiBaseUrl) entry.apiBaseUrl = meta.apiBaseUrl
    if (meta.lastContent) entry.lastContent = meta.lastContent
  }

  // ========== 暂停 / 恢复 / 停止 ==========

  pause(sessionId) {
    const entry = this.sessions.get(sessionId)
    if (!entry || entry.paused || entry.status !== 'running') return false
    entry.paused = true
    entry.status = 'paused'
    entry.pausePromise = new Promise(resolve => { entry.pauseResolver = resolve })
    return true
  }

  resume(sessionId) {
    const entry = this.sessions.get(sessionId)
    if (!entry || !entry.paused) return false
    entry.paused = false
    entry.status = 'running'
    if (entry.pauseResolver) {
      entry.pauseResolver()
      entry.pauseResolver = null
      entry.pausePromise = null
    }
    return true
  }

  async waitIfPaused(sessionId) {
    const entry = this.sessions.get(sessionId)
    if (!entry || !entry.paused || !entry.pausePromise) return
    await entry.pausePromise
  }

  stop(sessionId) {
    const entry = this.sessions.get(sessionId)
    if (!entry) return false
    if (entry.abortController) entry.abortController.abort()
    if (entry.pauseResolver) entry.pauseResolver()
    return true
  }

  // ========== 跨会话指令 ==========

  injectMessage(sessionId, message) {
    const entry = this.sessions.get(sessionId)
    if (!entry) return false

    if (entry.status === 'running' || entry.status === 'paused') {
      // AI 正在处理中，存到队列，由 orchestrator 的 drainInjectedMessages 消费
      entry.injectedMessages = entry.injectedMessages || []
      entry.injectedMessages.push(message)
    } else if (entry.viewOpen) {
      const sender = entry.viewSender
      if (sender && !sender.isDestroyed()) {
        sender.send('ai-session-inject-to-panel', { panelId: sessionId, message })
      }
    }
    return true
  }

  drainInjectedMessages(sessionId) {
    const entry = this.sessions.get(sessionId)
    if (!entry || !entry.injectedMessages?.length) return []
    const msgs = entry.injectedMessages
    entry.injectedMessages = []
    return msgs
  }

  // ========== 查询 ==========

  getSnapshot() {
    const list = []
    for (const [, entry] of this.sessions) {
      if (entry.status === 'closed') continue  // 不展示已关闭的
      list.push({
        sessionId: entry.sessionId,
        projectPath: entry.projectPath,
        projectName: this._sanitizeName(entry.projectName),
        sessionTitle: entry.sessionTitle || '',
        model: entry.model,
        status: entry.status,
        viewOpen: entry.viewOpen,
        startedAt: entry.startedAt,
        lastActivity: entry.lastActivity,
        lastContent: entry.lastContent,
        lastToolCall: entry.lastToolCall,
        iteration: entry.iteration,
        totalIterations: entry.totalIterations,
        paused: entry.paused,
        completedAt: entry.completedAt || null,
      })
    }
    // 按注册时间排序（稳定顺序，不按状态分组）
    return list.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))
  }

  clearCompleted() {
    for (const [id, entry] of this.sessions) {
      if (entry.status === 'completed' || entry.status === 'error' || entry.status === 'closed') {
        this.sessions.delete(id)
      }
    }
  }

  /** 是否为该会话 owner（按 webContents.id 判定） */
  isOwnedBy(sessionId, sender) {
    const entry = this.sessions.get(sessionId)
    if (!entry || !entry.viewSender || !sender) return false
    const ownerId = this._senderId(entry.viewSender)
    const senderId = this._senderId(sender)
    if (ownerId == null || senderId == null) return false
    return ownerId === senderId
  }

  // ========== 内部 ==========

  _extractProjectName(projectPath) {
    if (!projectPath) return 'AI 助手'
    const parts = projectPath.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || projectPath
  }

  /** 清理不友好的名称（如 session_xxx、panel-xxx 等自动生成的 ID） */
  _sanitizeName(name) {
    if (!name) return 'AI 助手'
    if (/^(session[_-]|panel[_-]|heartbeat[_-]|view[_-])/.test(name)) return 'AI 助手'
    return name
  }

}

const sessionRegistry = new SessionRegistry()
module.exports = sessionRegistry
