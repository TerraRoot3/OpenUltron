// 工具：执行 Shell 命令（主力工具）；执行结果单独写入 command-execution-log，不写入对话历史
const commandExecutionLog = require('../command-execution-log')
const executorRegistry = require('../../extensions/executor-registry')

const definition = {
  description: '在指定目录执行 shell（Bash）命令。支持：查看文件(cat/head/ls)、搜索(grep/find)、Git(git status/commit/push)、构建(npm/yarn)、执行 Bash 脚本(bash script.sh)、执行 Node.js 脚本(node script.js)等。一条命令可用 && 或 | 组合。',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'shell 命令，可用 && 或 | 组合' },
      cwd: { type: 'string', description: '工作目录（绝对路径）' },
      timeout: { type: 'number', description: '超时时间(ms)，默认 600000（10 分钟）' },
      runtime: { type: 'string', description: '可选。执行器：shell | pwsh | fish，默认 shell' }
    },
    required: ['command', 'cwd']
  }
}

const DEFAULT_TIMEOUT_MS = 600000
const MIN_TIMEOUT_MS = 1000
const MAX_TIMEOUT_MS = 1800000
const MAX_STREAM_PREVIEW_LEN = 4000
const STREAM_PUSH_INTERVAL_MS = 700
const INSTALL_TIMEOUT_MS = 1800000

function clampTimeout(timeout) {
  const n = Number(timeout)
  if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_MS
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(n)))
}

function clipText(text, maxLen = MAX_STREAM_PREVIEW_LEN) {
  const v = String(text || '')
  if (v.length <= maxLen) return v
  return v.slice(v.length - maxLen)
}

function isInstallLikeCommand(command = '') {
  const c = String(command || '').trim().toLowerCase()
  return (
    /^brew\s+install\b/.test(c) ||
    /^apt(-get)?\s+install\b/.test(c) ||
    /^yum\s+install\b/.test(c) ||
    /^dnf\s+install\b/.test(c) ||
    /^pip(3)?\s+install\b/.test(c) ||
    /^npm\s+install\b/.test(c) ||
    /^pnpm\s+(add|install)\b/.test(c) ||
    /^yarn\s+add\b/.test(c)
  )
}

function isRetryableInstallFailure(result = {}) {
  if (!result || result.success) return false
  if (result.timedOut) return true
  const text = `${result.stderr || ''}\n${result.stdout || ''}`.toLowerCase()
  return (
    text.includes('timed out') ||
    text.includes('timeout') ||
    text.includes('temporary failure') ||
    text.includes('could not resolve') ||
    text.includes('connection reset') ||
    text.includes('network') ||
    text.includes('bottle missing') ||
    text.includes('failed to fetch')
  )
}

function buildInstallRetryCommand(command = '') {
  const c = String(command || '').trim()
  const low = c.toLowerCase()
  if (/^brew\s+install\b/.test(low)) {
    // Homebrew 网络慢场景：关闭自动更新 + 关闭 API 拉取，直接用 formula 传统路径重试
    if (low.includes('homebrew_no_auto_update') || low.includes('homebrew_no_install_from_api')) return c
    return `HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_FROM_API=1 ${c}`
  }
  return c
}

async function execute(args, context = {}) {
  const { command, cwd, timeout = DEFAULT_TIMEOUT_MS, runtime = 'shell' } = args
  const projectPath = context.projectPath || ''
  const sessionId = context.sessionId || ''
  const toolCallId = context.toolCallId || ''
  const hasExplicitTimeout = Object.prototype.hasOwnProperty.call(args || {}, 'timeout')
  const effectiveTimeout = hasExplicitTimeout
    ? clampTimeout(timeout)
    : (isInstallLikeCommand(command) ? INSTALL_TIMEOUT_MS : DEFAULT_TIMEOUT_MS)

  if (!command || !cwd) {
    return { success: false, error: '缺少 command 或 cwd 参数' }
  }

  const executor = executorRegistry.get(runtime || 'shell')
  if (!executor || !executor.execute) {
    return { success: false, error: `未找到执行器: ${runtime}` }
  }

  let stdoutStream = ''
  let stderrStream = ''
  let lastEmitTs = 0
  let queued = false
  let finalSent = false
  let lastPayloadKey = ''
  const canStream = runtime === 'shell' && context?.sender?.send && toolCallId

  const emitProgress = (force = false) => {
    if (!canStream || finalSent) return
    const now = Date.now()
    if (!force && now - lastEmitTs < STREAM_PUSH_INTERVAL_MS) {
      if (!queued) {
        queued = true
        setTimeout(() => {
          queued = false
          emitProgress(true)
        }, STREAM_PUSH_INTERVAL_MS)
      }
      return
    }
    const payloadStdout = clipText(stdoutStream)
    const payloadStderr = clipText(stderrStream)
    const payloadKey = `${payloadStdout.length}:${payloadStderr.length}:${payloadStdout.slice(-80)}:${payloadStderr.slice(-80)}`
    if (!force && payloadKey === lastPayloadKey) return
    lastPayloadKey = payloadKey
    lastEmitTs = now
    try {
      context.sender.send('ai-chat-tool-result', {
        sessionId,
        toolCallId,
        name: 'execute_command',
        result: JSON.stringify({
          success: true,
          partial: true,
          running: true,
          command,
          cwd,
          timeout: effectiveTimeout,
          stdout: payloadStdout,
          stderr: payloadStderr
        })
      })
    } catch (_) { /* ignore */ }
  }

  const runOnce = async (script, timeoutMs) => executor.execute({
    script,
    cwd,
    timeout: timeoutMs,
    onStdout: (chunk) => {
      stdoutStream += String(chunk || '')
      emitProgress(false)
    },
    onStderr: (chunk) => {
      stderrStream += String(chunk || '')
      emitProgress(false)
    }
  }, context)

  let result = await runOnce(command, effectiveTimeout)
  let retried = false
  let retriedCommand = ''
  if (runtime === 'shell' && isInstallLikeCommand(command) && isRetryableInstallFailure(result)) {
    retriedCommand = buildInstallRetryCommand(command)
    if (retriedCommand && retriedCommand !== command) {
      retried = true
      stderrStream += `\n[auto-retry] 检测到安装命令失败，改用兜底参数重试一次...\n`
      emitProgress(true)
      const second = await runOnce(retriedCommand, INSTALL_TIMEOUT_MS)
      result = {
        ...second,
        stdout: `${result.stdout || ''}\n\n[auto-retry command]\n${retriedCommand}\n\n${second.stdout || ''}`.trim(),
        stderr: `${result.stderr || ''}\n\n[auto-retry command]\n${retriedCommand}\n\n${second.stderr || ''}`.trim()
      }
    }
  }
  finalSent = true
  try {
    commandExecutionLog.append(projectPath, sessionId, {
      toolName: 'execute_command',
      command,
      cwd,
      success: result.success,
      exitCode: result.exitCode,
      sessionId
    })
  } catch (e) { /* ignore */ }

  return {
    ...result,
    command,
    cwd,
    timeout: effectiveTimeout,
    retried,
    retriedCommand
  }
}

module.exports = { definition, execute }
