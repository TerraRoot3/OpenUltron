/**
 * bash 子进程执行：一次性输出、实时流式输出、取消；Git 写入前 index.lock 处理。
 */

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const _runningProcesses = new Map()
let _processIdCounter = 0

function isGitWriteCommand (command) {
  if (!command) return false
  return (
    command.includes('git add') || command.includes('git commit') ||
    command.includes('git push') || command.includes('git pull') ||
    command.includes('git merge') || command.includes('git rebase') ||
    command.includes('git checkout') || command.includes('git reset') ||
    command.includes('git stash') || command.includes('git cherry-pick')
  )
}

async function checkAndRemoveGitLock (cwd) {
  try {
    const lockPath = path.join(cwd, '.git', 'index.lock')

    if (!fs.existsSync(lockPath)) {
      return { removed: false, reason: 'no_lock' }
    }

    console.log('⚠️ 检测到 Git 锁文件:', lockPath)

    const stats = fs.statSync(lockPath)
    const ageSeconds = (Date.now() - stats.mtime.getTime()) / 1000

    if (ageSeconds > 60) {
      console.log(`🔓 锁文件已存在 ${ageSeconds.toFixed(1)} 秒，认为是僵尸锁文件，自动删除`)
      fs.unlinkSync(lockPath)
      return { removed: true, reason: 'stale_lock', age: ageSeconds }
    }

    try {
      const { execSync } = require('child_process')
      try {
        const lsofResult = execSync(`lsof "${lockPath}" 2>/dev/null || true`, { encoding: 'utf-8', timeout: 1000 })
        if (lsofResult.trim()) {
          console.log('⏳ 检测到有进程正在使用锁文件，等待...')
          return { removed: false, reason: 'file_in_use' }
        }
      } catch (lsofError) {
        console.log('⚠️ lsof 不可用，使用备用检测方法')
      }

      const gitProcesses = execSync(`ps aux | grep -E "[g]it|git-|git " | head -5 || true`, { encoding: 'utf-8', timeout: 1000 })

      if (!gitProcesses.trim()) {
        console.log('🔓 没有检测到活跃的 Git 进程，删除锁文件')
        fs.unlinkSync(lockPath)
        return { removed: true, reason: 'no_process' }
      }
      if (ageSeconds > 30) {
        console.log(`🔓 锁文件已存在 ${ageSeconds.toFixed(1)} 秒，即使有 Git 进程也删除（可能是并发冲突）`)
        fs.unlinkSync(lockPath)
        return { removed: true, reason: 'concurrent_conflict', age: ageSeconds }
      }
      console.log('⏳ 检测到活跃的 Git 进程且锁文件较新，等待...')
      return { removed: false, reason: 'active_process' }
    } catch (error) {
      if (ageSeconds > 10) {
        console.log(`⚠️ 检查进程失败，但锁文件已存在 ${ageSeconds.toFixed(1)} 秒，删除锁文件:`, error.message)
        fs.unlinkSync(lockPath)
        return { removed: true, reason: 'check_failed', age: ageSeconds }
      }
      console.log('⚠️ 检查进程失败，但锁文件较新，保留:', error.message)
      return { removed: false, reason: 'check_failed_recent' }
    }
  } catch (error) {
    console.error('❌ 处理 Git 锁文件失败:', error.message)
    return { removed: false, reason: 'error', error: error.message }
  }
}

/**
 * @param {object} deps
 * @param {(ch: string, fn: Function) => void} deps.registerChannel
 */
function registerShellSpawnCommandIpc (deps) {
  const { registerChannel } = deps

  registerChannel('execute-command', async (event, data) => {
    try {
      const cwd = data.cwd || data.path || process.cwd()
      console.log(`⚡ 执行命令: ${data.command} 在 ${cwd}`)

      if (isGitWriteCommand(data.command)) {
        const lockResult = await checkAndRemoveGitLock(cwd)
        if (lockResult.removed) {
          console.log(`✅ Git 锁文件已处理: ${lockResult.reason}`)
        }
      }

      const processId = ++_processIdCounter

      return new Promise((resolve) => {
        const child = spawn('bash', ['-c', data.command], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe']
        })

        _runningProcesses.set(processId, child)
        if (event?.sender && !event.sender.isDestroyed()) {
          event.sender.send('command-process-id', { processId })
        }

        let stdout = ''
        let stderr = ''
        let resolved = false

        const cleanup = () => {
          _runningProcesses.delete(processId)
        }

        const isNetworkCmd = data.command && (
          data.command.includes('git push') || data.command.includes('git pull') ||
          data.command.includes('git fetch') || data.command.includes('git clone')
        )
        const timeoutMs = data.timeout || (isNetworkCmd ? 300000 : 120000)
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            console.error(`⏰ 命令执行超时 (${timeoutMs / 1000}s): ${data.command}`)
            child.kill('SIGTERM')
            setTimeout(() => child.kill('SIGKILL'), 5000)
            resolve({
              success: false,
              output: stdout.trim(),
              stdout: stdout.trim(),
              stderr: `命令执行超时 (${timeoutMs / 1000}秒)`,
              exitCode: -1,
              timeout: true
            })
          }
        }, timeoutMs)

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString()
        })

        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString()
        })

        child.on('close', (code) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            console.log(`✅ 命令执行完成，退出码: ${code}`)
            resolve({
              success: code === 0,
              output: stdout.trim(),
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: code
            })
          }
        })

        child.on('error', (error) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            console.error('❌ 命令执行失败:', error.message)
            resolve({
              success: false,
              output: '',
              stdout: stdout.trim(),
              stderr: error.message,
              exitCode: -1
            })
          }
        })
      })
    } catch (error) {
      console.error('❌ 执行命令异常:', error.message)
      return { success: false, message: `执行失败: ${error.message}` }
    }
  })

  registerChannel('execute-command-realtime', async (event, data) => {
    try {
      const cwd = data.cwd || data.path || process.cwd()
      console.log(`⚡ 实时执行命令: ${data.command} 在 ${cwd}`)

      if (isGitWriteCommand(data.command)) {
        const lockResult = await checkAndRemoveGitLock(cwd)
        if (lockResult.removed) {
          console.log(`✅ Git 锁文件已处理: ${lockResult.reason}`)
          if (event?.sender && !event.sender.isDestroyed()) {
            event.sender.send('realtime-command-output', {
              type: 'stdout',
              data: '⚠️ 检测到 Git 锁文件，已自动处理\n'
            })
          }
        }
      }

      const processId = ++_processIdCounter

      return new Promise((resolve) => {
        const child = spawn('bash', ['-c', data.command], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe']
        })

        _runningProcesses.set(processId, child)
        if (event?.sender && !event.sender.isDestroyed()) {
          event.sender.send('command-process-id', { processId })
        }

        let stdout = ''
        let stderr = ''
        let allOutput = ''
        let resolved = false

        const cleanup = () => {
          _runningProcesses.delete(processId)
        }

        const isNetworkCmd = data.command && (
          data.command.includes('git push') || data.command.includes('git pull') ||
          data.command.includes('git fetch') || data.command.includes('git clone')
        )
        const timeoutMs = data.timeout || (isNetworkCmd ? 300000 : 120000)
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true
            cleanup()
            console.error(`⏰ 实时命令执行超时 (${timeoutMs / 1000}s): ${data.command}`)
            child.kill('SIGTERM')
            setTimeout(() => child.kill('SIGKILL'), 5000)
            if (event?.sender && !event.sender.isDestroyed()) {
              event.sender.send('realtime-command-output', {
                type: 'complete',
                code: -1,
                output: allOutput.trim(),
                stdout: stdout.trim(),
                stderr: `命令执行超时 (${timeoutMs / 1000}秒)`
              })
            }
            resolve({
              success: false,
              output: allOutput.trim(),
              stdout: stdout.trim(),
              stderr: `命令执行超时 (${timeoutMs / 1000}秒)`,
              exitCode: -1,
              timeout: true
            })
          }
        }, timeoutMs)

        const sendRealtime = (payload) => {
          if (event?.sender && !event.sender.isDestroyed()) event.sender.send('realtime-command-output', payload)
        }
        child.stdout.on('data', (chunk) => {
          const output = chunk.toString()
          stdout += output
          allOutput += output
          sendRealtime({ type: 'stdout', data: output })
        })

        child.stderr.on('data', (chunk) => {
          const output = chunk.toString()
          stderr += output
          allOutput += output
          sendRealtime({ type: 'stderr', data: output })
        })

        child.on('close', (code) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            console.log(`✅ 实时命令执行完成，退出码: ${code}`)
            if (event?.sender && !event.sender.isDestroyed()) {
              event.sender.send('realtime-command-output', {
                type: 'complete',
                code,
                output: allOutput.trim(),
                stdout: stdout.trim(),
                stderr: stderr.trim()
              })
            }
            resolve({
              success: code === 0,
              output: allOutput.trim(),
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: code
            })
          }
        })

        child.on('error', (error) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            cleanup()
            console.error('❌ 实时命令执行失败:', error.message)
            if (event?.sender && !event.sender.isDestroyed()) {
              event.sender.send('realtime-command-output', { type: 'error', error: error.message })
            }
            resolve({
              success: false,
              output: '',
              stdout: stdout.trim(),
              stderr: error.message,
              exitCode: -1
            })
          }
        })
      })
    } catch (error) {
      console.error('❌ 实时命令执行异常:', error.message)
      return { success: false, message: `执行失败: ${error.message}` }
    }
  })

  registerChannel('kill-command-process', async (event, { processId }) => {
    try {
      const child = _runningProcesses.get(processId)
      if (child) {
        console.log(`🛑 取消命令进程: ${processId}`)
        child.kill('SIGTERM')
        setTimeout(() => {
          try { child.kill('SIGKILL') } catch (e) { /* 已退出 */ }
        }, 5000)
        _runningProcesses.delete(processId)
        return { success: true }
      }
      return { success: false, message: '进程不存在或已结束' }
    } catch (error) {
      return { success: false, message: error.message }
    }
  })
}

module.exports = { registerShellSpawnCommandIpc, isGitWriteCommand, checkAndRemoveGitLock }
