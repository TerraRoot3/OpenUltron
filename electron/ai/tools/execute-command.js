// 工具：执行 Shell 命令（主力工具）；执行结果单独写入 command-execution-log，不写入对话历史
const commandExecutionLog = require('../command-execution-log')
const executorRegistry = require('../../extensions/executor-registry')
const userConfirmationTool = require('./user-confirmation')
const { logger: appLogger } = require('../../app-logger')
const os = require('os')
const path = require('path')

const definition = {
  description:
    '在指定目录执行 shell（Bash）命令。支持：查看文件(cat/head/ls)、搜索(grep/find)、Git、构建(npm/yarn)、脚本等。**勿**将 cwd 设为 ~/.openultron/web-apps 下应用目录以修改沙箱代码（会被拒绝）；改沙箱须 **webapp_studio_invoke**。一条命令可用 && 或 | 组合。',
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

// 默认超时调大，避免长任务（如转码/构建）频繁超时
const DEFAULT_TIMEOUT_MS = 1800000 // 30 min
const MIN_TIMEOUT_MS = 1000
// 允许显式传更长超时（例如大项目构建/转码）；上限 2h
const MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000
const MAX_STREAM_PREVIEW_LEN = 4000
const STREAM_PUSH_INTERVAL_MS = 700
const INSTALL_TIMEOUT_MS = 1800000
const PROTECTED_DIRS = ['Desktop', 'Documents', 'Downloads', 'Music', 'Pictures', 'Movies']

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

function normalizePathLike(p = '') {
  const raw = String(p || '').trim()
  if (!raw) return ''
  if (raw === '~') return os.homedir()
  if (raw.startsWith('~/')) return path.join(os.homedir(), raw.slice(2))
  return raw
}

function shouldBlockProtectedScan(command = '', cwd = '') {
  const cmd = String(command || '').trim()
  const low = cmd.toLowerCase()
  const home = os.homedir()
  const normCwd = normalizePathLike(cwd)

  const isRecursiveScan = /\b(find|fd|rg)\b/.test(low)
  if (isRecursiveScan && normCwd === home) {
    return '为避免 macOS 权限弹窗，已阻止在 HOME 根目录执行递归扫描。请改到具体项目目录或 ~/.openultron/workspace。'
  }

  // 显式扫描受保护目录时直接拦截（最常见触发 TCC）
  for (const dir of PROTECTED_DIRS) {
    const abs = `${home}/${dir}`.toLowerCase()
    const pats = [
      `~/${dir}`.toLowerCase(),
      abs,
      `${abs}/`
    ]
    if (pats.some(p => low.includes(p))) {
      return `为避免系统授权弹框，已阻止访问受保护目录 ${home}/${dir}。请改用工作区目录。`
    }
  }
  return ''
}

function isRiskyCommand(command = '') {
  const c = String(command || '').trim().toLowerCase()
  if (!c) return false
  const riskyRules = [
    /\brm\s+-rf\b/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    /\bshutdown\b/,
    /\breboot\b/,
    /\bsudo\b/,
    /\bgit\s+push\b/,
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+clean\s+-fd/,
    /\bchmod\s+-r\b/,
    /\bchown\s+-r\b/,
    />\s*\/dev\/(sd|disk)/,
    /\bkill\s+-9\b/
  ]
  return riskyRules.some(re => re.test(c))
}

async function execute(args, context = {}) {
  const { command, cwd, timeout = DEFAULT_TIMEOUT_MS, runtime = 'shell' } = args
  const projectPath = context.projectPath || ''
  const sessionId = context.sessionId || ''
  const toolCallId = context.toolCallId || ''
  const abortSignal = context.abortSignal
  const hasExplicitTimeout = Object.prototype.hasOwnProperty.call(args || {}, 'timeout')
  const effectiveTimeout = hasExplicitTimeout
    ? clampTimeout(timeout)
    : (isInstallLikeCommand(command) ? INSTALL_TIMEOUT_MS : DEFAULT_TIMEOUT_MS)

  if (!command || !cwd) {
    return { success: false, error: '缺少 command 或 cwd 参数' }
  }

  if (abortSignal?.aborted) {
    return {
      success: false,
      error: '已取消',
      command,
      cwd,
      exitCode: 130,
      timedOut: false,
      cancelled: true
    }
  }

  if (isRiskyCommand(command)) {
    const confirmRes = await userConfirmationTool.execute({
      message: `将执行高风险命令：${command}\n目录：${cwd}\n确认继续执行吗？`,
      severity: 'danger'
    }, context)
    if (!confirmRes?.confirmed) {
      return {
        success: false,
        error: confirmRes?.message || '用户拒绝执行风险命令',
        command,
        cwd,
        exitCode: 130,
        timedOut: false
      }
    }
  }

  const blockReason = shouldBlockProtectedScan(command, cwd)
  if (blockReason) {
    return {
      success: false,
      error: blockReason,
      command,
      cwd,
      exitCode: 126,
      timedOut: false
    }
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
    ...(abortSignal ? { signal: abortSignal } : {}),
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
      const retryTimeoutMs = hasExplicitTimeout ? effectiveTimeout : INSTALL_TIMEOUT_MS
      const second = await runOnce(retriedCommand, retryTimeoutMs)
      result = {
        ...second,
        stdout: `${result.stdout || ''}\n\n[auto-retry command]\n${retriedCommand}\n\n${second.stdout || ''}`.trim(),
        stderr: `${result.stderr || ''}\n\n[auto-retry command]\n${retriedCommand}\n\n${second.stderr || ''}`.trim()
      }
    }
  }
  finalSent = true
  let commandErrorCode
  try {
    const { normalizeErrorCode } = require('../execution-envelope')
    const errHint = [
      result.timedOut ? 'timeout' : '',
      result.stderr,
      result.exitCode != null ? `exit ${result.exitCode}` : ''
    ]
      .filter(Boolean)
      .join(' ')
    commandErrorCode = result.success && !result.timedOut ? undefined : normalizeErrorCode(errHint)
  } catch (_) {
    commandErrorCode = undefined
  }
  try {
    commandExecutionLog.append(projectPath, sessionId, {
      toolName: 'execute_command',
      command,
      cwd,
      success: result.success,
      exitCode: result.exitCode,
      errorCode: commandErrorCode,
      sessionId
    })
  } catch (e) { /* ignore */ }

  if (!result.success || result.timedOut) {
    const hasFfmpegOrSay = /\b(ffmpeg|say|espeak)\b/i.test(command || '')
    appLogger?.warn?.('[execute_command] 命令未成功', {
      success: result.success,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      timeoutMs: effectiveTimeout,
      cwd,
      commandPreview: (command || '').slice(0, 300),
      stderrTail: (result.stderr || '').trim().slice(-1000)
    })
    if (hasFfmpegOrSay) {
      appLogger?.info?.('[execute_command] ffmpeg/say 失败时请查日志 [ShellExecutor] 与上方 stderrTail。常见原因：ffmpeg 未安装或不在 PATH；say 文本过长；超时被终止；输出路径无写权限。')
    }
  }

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
