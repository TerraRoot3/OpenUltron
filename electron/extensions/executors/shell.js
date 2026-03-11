/**
 * Shell 执行器：/bin/sh -c script
 * 见 EXTENSIBILITY-DESIGN.md 5.1、5.4。
 * 简单只读命令（cat/ls/head/tail/pwd）在主进程内执行，避免 spawn 子进程触发 macOS TCC 弹窗。
 */
const { execFile } = require('child_process')
const { tryInProcess } = require('./shell-inprocess')

const DEFAULT_TIMEOUT = 120000
const MAX_BUFFER = 1024 * 1024 * 5

/**
 * @param {{ script: string; cwd: string; timeout?: number; env?: Record<string, string> }} options
 * @param {{ projectPath?: string; sessionId?: string }} [context]
 * @returns {Promise<{ success: boolean; stdout?: string; stderr?: string; exitCode?: number; error?: string }>}
 */
async function execute(options, context) {
  const { script, cwd, timeout = DEFAULT_TIMEOUT, env } = options || {}
  if (!script || !cwd) {
    return { success: false, error: '缺少 script 或 cwd' }
  }
  const dangerous = ['rm -rf /', 'mkfs', ':(){:|:&};:', '> /dev/sda']
  if (dangerous.some(d => script.includes(d))) {
    return { success: false, error: '命令被安全策略拦截' }
  }
  const inProcess = tryInProcess(script, cwd)
  if (inProcess.handled) {
    const maxLen = 8000
    return {
      success: inProcess.exitCode === 0,
      stdout: (inProcess.stdout || '').length > maxLen ? (inProcess.stdout || '').substring(0, maxLen) + '\n... (输出被截断)' : (inProcess.stdout || ''),
      stderr: (inProcess.stderr || '').length > maxLen ? (inProcess.stderr || '').substring(0, maxLen) + '\n... (输出被截断)' : (inProcess.stderr || ''),
      exitCode: inProcess.exitCode
    }
  }
  return new Promise((resolve) => {
    execFile('/bin/sh', ['-c', script], {
      cwd,
      timeout,
      maxBuffer: MAX_BUFFER,
      env: env || process.env
    }, (error, stdout, stderr) => {
      const exitCode = error ? (error.code || 1) : 0
      const out = (stdout || '').trim()
      const err = (stderr || '').trim()
      const maxLen = 8000
      resolve({
        success: exitCode === 0,
        stdout: out.length > maxLen ? out.substring(0, maxLen) + '\n... (输出被截断)' : out,
        stderr: err.length > maxLen ? err.substring(0, maxLen) + '\n... (输出被截断)' : err,
        exitCode
      })
    })
  })
}

module.exports = {
  id: 'shell',
  name: 'Shell',
  execute
}
