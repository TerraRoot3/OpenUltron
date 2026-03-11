// electron/ai/tools/terminal-session.js
const pty = require('node-pty')

// Ring buffer size per session (bytes)
const BUFFER_SIZE = 10 * 1024 // 10KB

const sessions = new Map() // sessionId -> { pty, buffer: string }

const definition = {
  description: '管理交互式终端会话，适用于需要 SSH、交互式命令等场景。对于普通命令优先使用 execute_command。',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'write', 'read_buffer', 'destroy'] },
      session_id: { type: 'string', description: '会话 ID（write/read_buffer/destroy 时必填）' },
      cwd: { type: 'string', description: '工作目录（create 时使用）' },
      input: { type: 'string', description: '输入文本（write 时），\\n 表示回车' }
    },
    required: ['action']
  }
}

async function execute(args) {
  const { action, session_id, cwd, input } = args

  if (action === 'create') {
    const id = session_id || `ai-term-${Date.now()}`
    if (sessions.has(id)) {
      return { success: false, error: `会话 ${id} 已存在` }
    }
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash')
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: cwd || process.env.HOME || '/',
      env: { ...process.env }
    })
    const session = { pty: ptyProcess, buffer: '' }
    sessions.set(id, session)
    ptyProcess.onData((data) => {
      session.buffer += data
      // Keep last BUFFER_SIZE bytes
      if (session.buffer.length > BUFFER_SIZE) {
        session.buffer = session.buffer.slice(session.buffer.length - BUFFER_SIZE)
      }
    })
    ptyProcess.onExit(() => {
      sessions.delete(id)
    })
    return { success: true, session_id: id }
  }

  if (action === 'write') {
    if (!session_id) return { success: false, error: '缺少 session_id' }
    const session = sessions.get(session_id)
    if (!session) return { success: false, error: `会话 ${session_id} 不存在` }
    session.pty.write(input || '')
    return { success: true }
  }

  if (action === 'read_buffer') {
    if (!session_id) return { success: false, error: '缺少 session_id' }
    const session = sessions.get(session_id)
    if (!session) return { success: false, error: `会话 ${session_id} 不存在` }
    const output = session.buffer
    session.buffer = '' // clear after read
    return { success: true, output: output || '(无新输出)' }
  }

  if (action === 'destroy') {
    if (!session_id) return { success: false, error: '缺少 session_id' }
    const session = sessions.get(session_id)
    if (session) {
      try { session.pty.kill() } catch (e) {}
      sessions.delete(session_id)
    }
    return { success: true }
  }

  return { success: false, error: `未知 action: ${action}` }
}

module.exports = { definition, execute }
