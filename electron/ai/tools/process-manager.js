// 工具：后台进程管理（启动 dev server 等长时运行进程后继续对话）
const { spawn } = require('child_process')

// 全局进程注册表（跨工具调用共享）
const processRegistry = new Map()  // id -> { pid, cmd, cwd, process, logBuffer, startedAt, running }
let nextId = 1

const LOG_BUFFER_SIZE = 200  // 每进程保留最近 200 行

function genId() { return `proc-${nextId++}` }

function appendLog(entry, line) {
  entry.logBuffer.push(line)
  if (entry.logBuffer.length > LOG_BUFFER_SIZE) entry.logBuffer.shift()
}

const definition = {
  description: '管理后台长时运行进程（如 dev server、watch 任务等）。支持启动、查看日志、停止、列出所有进程。启动后立即返回进程 ID，可继续执行其他操作。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'log', 'stop', 'list', 'kill'],
        description: 'start=启动 | log=查看日志 | stop/kill=终止 | list=列出所有'
      },
      command: { type: 'string', description: 'shell 命令（start 时必填）' },
      cwd: { type: 'string', description: '工作目录（start 时必填）' },
      id: { type: 'string', description: '进程 ID（log/stop/kill 时必填）' },
      lines: { type: 'number', description: '返回最近 N 行日志，默认 50（log 时使用）' }
    },
    required: ['action']
  }
}

async function execute(args) {
  const { action, command, cwd, id, lines = 50 } = args

  switch (action) {
    case 'start': {
      if (!command || !cwd) return { success: false, error: '缺少 command 或 cwd 参数' }

      const procId = genId()
      const entry = {
        id: procId,
        cmd: command,
        cwd,
        process: null,
        logBuffer: [],
        startedAt: new Date().toISOString(),
        running: true,
        exitCode: null
      }

      try {
        const child = spawn('/bin/sh', ['-c', command], {
          cwd,
          env: { ...process.env, FORCE_COLOR: '0' },
          stdio: ['ignore', 'pipe', 'pipe']
        })

        child.stdout.setEncoding('utf-8')
        child.stderr.setEncoding('utf-8')

        const onData = (data) => {
          const lines = data.split('\n')
          for (const line of lines) {
            if (line.trim()) appendLog(entry, `[stdout] ${line}`)
          }
        }
        const onErr = (data) => {
          const lines = data.split('\n')
          for (const line of lines) {
            if (line.trim()) appendLog(entry, `[stderr] ${line}`)
          }
        }

        child.stdout.on('data', onData)
        child.stderr.on('data', onErr)
        child.on('exit', (code) => {
          entry.running = false
          entry.exitCode = code
          appendLog(entry, `[system] 进程退出，exit code: ${code}`)
        })
        child.on('error', (err) => {
          entry.running = false
          appendLog(entry, `[system] 进程错误: ${err.message}`)
        })

        entry.process = child
        processRegistry.set(procId, entry)

        // 等 500ms 让进程启动，收集初始日志
        await new Promise(r => setTimeout(r, 500))

        return {
          success: true,
          id: procId,
          pid: child.pid,
          cmd: command,
          cwd,
          message: `进程已启动 (id: ${procId}, pid: ${child.pid})`,
          initialLog: entry.logBuffer.slice(-10).join('\n')
        }
      } catch (err) {
        return { success: false, error: err.message }
      }
    }

    case 'log': {
      if (!id) return { success: false, error: '缺少 id 参数' }
      const entry = processRegistry.get(id)
      if (!entry) return { success: false, error: `进程 ${id} 不存在` }
      const recentLogs = entry.logBuffer.slice(-Math.min(lines, LOG_BUFFER_SIZE))
      return {
        success: true,
        id,
        pid: entry.process?.pid,
        running: entry.running,
        exitCode: entry.exitCode,
        logs: recentLogs.join('\n'),
        totalLines: entry.logBuffer.length
      }
    }

    case 'stop':
    case 'kill': {
      if (!id) return { success: false, error: '缺少 id 参数' }
      const entry = processRegistry.get(id)
      if (!entry) return { success: false, error: `进程 ${id} 不存在` }
      if (!entry.running) return { success: true, message: `进程 ${id} 已经停止` }
      try {
        // 先 SIGTERM，1s 后 SIGKILL
        entry.process.kill('SIGTERM')
        await new Promise(r => setTimeout(r, 1000))
        if (entry.running) entry.process.kill('SIGKILL')
        entry.running = false
        processRegistry.delete(id)
        return { success: true, message: `进程 ${id} 已终止` }
      } catch (err) {
        return { success: false, error: err.message }
      }
    }

    case 'list': {
      const list = Array.from(processRegistry.values()).map(e => ({
        id: e.id,
        pid: e.process?.pid,
        cmd: e.cmd,
        cwd: e.cwd,
        running: e.running,
        exitCode: e.exitCode,
        startedAt: e.startedAt,
        logLines: e.logBuffer.length
      }))
      return { success: true, processes: list, total: list.length }
    }

    default:
      return { success: false, error: `未知 action: ${action}` }
  }
}

module.exports = { definition, execute }
