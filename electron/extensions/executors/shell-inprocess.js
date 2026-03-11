/**
 * 简单只读命令在主进程内执行，不 spawn 子进程，避免 macOS TCC 弹窗。
 * 仅处理 cat / ls / head / tail / pwd 等纯读操作；其余仍走 shell executor 的 execFile。
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const MAX_OUTPUT = 8000

function expandPath(p, cwd) {
  if (!p || typeof p !== 'string') return null
  const s = p.trim().replace(/^~/, os.homedir())
  return path.isAbsolute(s) ? s : path.resolve(cwd || process.cwd(), s)
}

/**
 * 尝试在主进程内执行简单只读命令。若匹配则返回 { handled: true, stdout, stderr, exitCode }，否则 { handled: false }。
 * @param {string} script - 单行命令
 * @param {string} cwd - 工作目录
 */
function tryInProcess(script, cwd) {
  const raw = (script || '').trim()
  // 不处理含管道、重定向写、后台、分号多命令的
  if (/[|>]\s*[^>]|&\s*$|;\s*\S/.test(raw) || raw.includes('&&') || raw.includes('||')) {
    return { handled: false }
  }
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { handled: false }

  const cmd = parts[0]
  const args = parts.slice(1)

  try {
    // pwd
    if (cmd === 'pwd' && args.length === 0) {
      return { handled: true, stdout: cwd || process.cwd(), stderr: '', exitCode: 0 }
    }

    // cat [ -n ] <path>
    if (cmd === 'cat') {
      let pathArg = null
      const hasN = args.includes('-n')
      pathArg = args.filter(a => a !== '-n' && !a.startsWith('-'))[0]
      if (!pathArg) return { handled: false }
      const fp = expandPath(pathArg, cwd)
      if (!fp) return { handled: false }
      const content = fs.readFileSync(fp, 'utf-8')
      let out = content
      if (hasN) {
        out = content.split('\n').map((line, i) => `${(i + 1).toString().padStart(6)}  ${line}`).join('\n')
      }
      if (out.length > MAX_OUTPUT) out = out.substring(0, MAX_OUTPUT) + '\n... (输出被截断)'
      return { handled: true, stdout: out, stderr: '', exitCode: 0 }
    }

    // head -n N <path> 或 head <path>
    if (cmd === 'head') {
      let n = 10
      let pathArg = null
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n' && args[i + 1] != null) {
          n = parseInt(args[i + 1], 10) || 10
          pathArg = args[i + 2] || args.find((a, j) => j > i + 1 && !a.startsWith('-'))
          break
        }
        if (args[i].startsWith('-') && args[i].length > 1 && /^\d+$/.test(args[i].slice(1))) {
          n = parseInt(args[i].slice(1), 10) || 10
          pathArg = args[i + 1]
          break
        }
        if (!args[i].startsWith('-')) { pathArg = args[i]; break }
      }
      if (!pathArg) pathArg = args.find(a => !a.startsWith('-'))
      if (!pathArg) return { handled: false }
      const fp = expandPath(pathArg, cwd)
      if (!fp) return { handled: false }
      const content = fs.readFileSync(fp, 'utf-8')
      const lines = content.split('\n')
      const out = lines.slice(0, n).join('\n')
      return { handled: true, stdout: out, stderr: '', exitCode: 0 }
    }

    // tail -n N <path> 或 tail <path>
    if (cmd === 'tail') {
      let n = 10
      let pathArg = null
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n' && args[i + 1] != null) {
          n = parseInt(args[i + 1], 10) || 10
          pathArg = args[i + 2] || args.find((a, j) => j > i + 1 && !a.startsWith('-'))
          break
        }
        if (args[i].startsWith('-') && args[i].length > 1 && /^\d+$/.test(args[i].slice(1))) {
          n = parseInt(args[i].slice(1), 10) || 10
          pathArg = args[i + 1]
          break
        }
        if (!args[i].startsWith('-')) { pathArg = args[i]; break }
      }
      if (!pathArg) pathArg = args.find(a => !a.startsWith('-'))
      if (!pathArg) return { handled: false }
      const fp = expandPath(pathArg, cwd)
      if (!fp) return { handled: false }
      const content = fs.readFileSync(fp, 'utf-8')
      const lines = content.split('\n')
      const out = lines.slice(-n).join('\n')
      return { handled: true, stdout: out, stderr: '', exitCode: 0 }
    }

    // ls [ -l ] [ -la ] [ -a ] [ path ]
    if (cmd === 'ls') {
      const pathArg = args.filter(a => !a.startsWith('-'))[0] || '.'
      const fp = expandPath(pathArg, cwd)
      if (!fp) return { handled: false }
      const long = args.some(a => a === '-l' || a === '-la' || a === '-al')
      const all = args.some(a => a === '-a' || a === '-la' || a === '-al')
      const entries = fs.readdirSync(fp, { withFileTypes: true })
      const names = all ? entries.map(e => e.name) : entries.filter(e => !e.name.startsWith('.')).map(e => e.name)
      names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      let out
      if (long) {
        const lines = names.map(name => {
          const full = path.join(fp, name)
          let stat
          try { stat = fs.statSync(full) } catch { return name }
          const mode = (stat.mode & 0o777).toString(8)
          const type = stat.isDirectory() ? 'd' : '-'
          const size = stat.size
          const mtime = stat.mtime.toISOString().slice(0, 16).replace('T', ' ')
          return `${type}rwxr-xr-x  1  ${size.toString().padStart(8)}  ${mtime}  ${name}`
        })
        out = lines.join('\n')
      } else {
        out = names.join('\n')
      }
      if (out.length > MAX_OUTPUT) out = out.substring(0, MAX_OUTPUT) + '\n... (输出被截断)'
      return { handled: true, stdout: out, stderr: '', exitCode: 0 }
    }

    return { handled: false }
  } catch (e) {
    const msg = e.message || String(e)
    if (e.code === 'ENOENT') return { handled: true, stdout: '', stderr: msg || 'No such file or directory', exitCode: 1 }
    if (e.code === 'EACCES') return { handled: true, stdout: '', stderr: msg || 'Permission denied', exitCode: 1 }
    if (e.code === 'ENOTDIR') return { handled: true, stdout: '', stderr: msg || 'Not a directory', exitCode: 1 }
    return { handled: false }
  }
}

module.exports = { tryInProcess }
