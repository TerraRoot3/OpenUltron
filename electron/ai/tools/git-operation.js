// 工具：Git 操作
const { execFile } = require('child_process')

const definition = {
  description: '结构化 Git 操作（备用工具）。大部分情况请优先使用 execute_command 执行 git 命令，仅在需要结构化返回值时使用此工具',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['status', 'branch_list', 'current_branch', 'checkout', 'commit',
               'push', 'pull', 'diff', 'log', 'stash_list', 'stash_apply',
               'stash_save', 'merge', 'fetch', 'add', 'reset', 'remote'],
        description: 'Git 操作类型'
      },
      repo_path: { type: 'string', description: '仓库绝对路径' },
      branch: { type: 'string', description: '分支名（checkout/merge 时使用）' },
      message: { type: 'string', description: '提交信息（commit 时使用）' },
      files: { type: 'array', items: { type: 'string' }, description: '文件列表（add/reset 时使用）' },
      count: { type: 'number', description: '日志条数，默认 10' }
    },
    required: ['operation', 'repo_path']
  }
}

function runGit(args, cwd, timeout = 30000) {
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 2,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        exitCode: error ? (error.code || 1) : 0,
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim()
      })
    })
  })
}

async function execute(args) {
  const { operation, repo_path, branch, message, files, count = 10 } = args

  if (!operation || !repo_path) {
    return { success: false, error: '缺少 operation 或 repo_path 参数' }
  }

  switch (operation) {
    case 'status':
      return await runGit(['status', '--porcelain', '-uall'], repo_path)

    case 'branch_list':
      return await runGit(['branch', '-a', '--no-color'], repo_path)

    case 'current_branch':
      return await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repo_path)

    case 'checkout':
      if (!branch) return { success: false, error: '缺少 branch 参数' }
      return await runGit(['checkout', branch], repo_path)

    case 'commit':
      if (!message) return { success: false, error: '缺少 message 参数' }
      return await runGit(['commit', '-m', message], repo_path)

    case 'push':
      return await runGit(['push'], repo_path, 60000)

    case 'pull':
      return await runGit(['pull'], repo_path, 60000)

    case 'diff': {
      const diffArgs = ['diff', '--stat']
      if (files && files.length > 0) {
        diffArgs.push('--', ...files)
      }
      return await runGit(diffArgs, repo_path)
    }

    case 'log':
      return await runGit(['log', `--oneline`, `-${count}`, '--no-color'], repo_path)

    case 'stash_list':
      return await runGit(['stash', 'list'], repo_path)

    case 'stash_apply':
      return await runGit(['stash', 'apply'], repo_path)

    case 'stash_save':
      return await runGit(['stash', 'save', message || 'AI Agent auto stash'], repo_path)

    case 'merge':
      if (!branch) return { success: false, error: '缺少 branch 参数' }
      return await runGit(['merge', branch], repo_path)

    case 'fetch':
      return await runGit(['fetch', '--all'], repo_path, 60000)

    case 'add': {
      const addFiles = (files && files.length > 0) ? files : ['.']
      return await runGit(['add', ...addFiles], repo_path)
    }

    case 'reset': {
      const resetFiles = (files && files.length > 0) ? ['reset', 'HEAD', '--', ...files] : ['reset', 'HEAD']
      return await runGit(resetFiles, repo_path)
    }

    case 'remote':
      return await runGit(['remote', '-v'], repo_path)

    default:
      return { success: false, error: `未知操作: ${operation}` }
  }
}

module.exports = { definition, execute }
