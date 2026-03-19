// 工具：文件操作
const fs = require('fs')
const path = require('path')

const definition = {
  description: '结构化文件操作（备用工具）。大部分情况请优先使用 execute_command（cat/ls/grep/find 等），仅在需要写入文件或结构化搜索时使用此工具',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'write', 'list_dir', 'search', 'exists'],
        description: '操作类型'
      },
      path: { type: 'string', description: '绝对路径' },
      content: { type: 'string', description: '写入内容（write 时使用）' },
      query: { type: 'string', description: '搜索关键词（search 时使用）' },
      max_lines: { type: 'number', description: '最大读取行数，默认 200' }
    },
    required: ['action', 'path']
  }
}

async function execute(args) {
  const { action, path: filePath, content, query, max_lines = 200 } = args

  if (!action || !filePath) {
    return { success: false, error: '缺少 action 或 path 参数' }
  }

  // 安全检查：禁止操作敏感路径
  const forbidden = ['/etc/passwd', '/etc/shadow', '/.ssh/']
  if (forbidden.some(f => filePath.includes(f))) {
    return { success: false, error: '路径被安全策略拦截' }
  }

  try {
    switch (action) {
      case 'read': {
        const raw = await fs.promises.readFile(filePath, 'utf-8')
        const lines = raw.split('\n')
        const truncated = lines.length > max_lines
        const text = truncated ? lines.slice(0, max_lines).join('\n') : raw
        return {
          success: true,
          content: text,
          totalLines: lines.length,
          truncated,
          path: filePath
        }
      }

      case 'write': {
        if (content === undefined || content === null) {
          return { success: false, error: '缺少 content 参数' }
        }
        // 禁止写入“看起来像二进制”的扩展名：file_operation 只能写 UTF-8 文本，写 .pptx/.pdf 等会得到无效文件
        const ext = path.extname(filePath).toLowerCase()
        const binaryExts = ['.pptx', '.ppt', '.xlsx', '.xls', '.pdf', '.docx', '.doc', '.zip', '.rar']
        if (binaryExts.includes(ext)) {
          return {
            success: false,
            error: `file_operation 仅支持写入纯文本（UTF-8）。扩展名 ${ext} 为二进制格式，请改用 execute_command 运行实际生成工具（如 npx slidev build、python-pptx、pandoc 等），并在回复中告知用户生成文件的完整绝对路径。`
          }
        }
        // 确保目录存在
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
        await fs.promises.writeFile(filePath, content, 'utf-8')
        return { success: true, path: filePath, bytes: Buffer.byteLength(content, 'utf-8') }
      }

      case 'list_dir': {
        const entries = await fs.promises.readdir(filePath, { withFileTypes: true })
        const result = entries.slice(0, 200).map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file'
        }))
        return {
          success: true,
          entries: result,
          total: entries.length,
          truncated: entries.length > 200,
          path: filePath
        }
      }

      case 'search': {
        if (!query) {
          return { success: false, error: '缺少 query 参数' }
        }
        // 在文件中搜索关键词
        const stat = await fs.promises.stat(filePath)
        if (stat.isDirectory()) {
          // 搜索目录下的文件（浅层）
          const entries = await fs.promises.readdir(filePath)
          const matches = []
          for (const entry of entries.slice(0, 100)) {
            const fp = path.join(filePath, entry)
            try {
              const s = await fs.promises.stat(fp)
              if (s.isFile() && s.size < 512 * 1024) {
                const text = await fs.promises.readFile(fp, 'utf-8')
                const lines = text.split('\n')
                const matchLines = []
                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].includes(query)) {
                    matchLines.push({ line: i + 1, text: lines[i].trim().substring(0, 200) })
                  }
                }
                if (matchLines.length > 0) {
                  matches.push({ file: entry, matches: matchLines.slice(0, 10) })
                }
              }
            } catch { /* skip */ }
          }
          return { success: true, matches, query, path: filePath }
        } else {
          // 搜索单个文件
          const text = await fs.promises.readFile(filePath, 'utf-8')
          const lines = text.split('\n')
          const matchLines = []
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(query)) {
              matchLines.push({ line: i + 1, text: lines[i].trim().substring(0, 200) })
            }
          }
          return { success: true, matches: matchLines.slice(0, 50), query, path: filePath }
        }
      }

      case 'exists': {
        try {
          const stat = await fs.promises.stat(filePath)
          return { success: true, exists: true, type: stat.isDirectory() ? 'directory' : 'file', size: stat.size }
        } catch {
          return { success: true, exists: false }
        }
      }

      default:
        return { success: false, error: `未知操作: ${action}` }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

module.exports = { definition, execute }
