// 工具：结构化多文件 Patch（精准修改，减少 token 消耗）
// 支持 unified diff 格式，逐 hunk 应用
const fs = require('fs')
const path = require('path')

const definition = {
  description:
    '对一个或多个文件应用精准的文本修改（patch）。适合修改已知文件的特定行，比 file_operation(write) 更省 token。**禁止** patch ~/.openultron/web-apps 下沙箱应用文件：须 **webapp_studio_invoke**。每个 change 指定路径、old、new。',
  parameters: {
    type: 'object',
    properties: {
      changes: {
        type: 'array',
        description: '修改列表，每项对应一个文件的一处修改',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件绝对路径' },
            old: { type: 'string', description: '要替换的原始文本（必须与文件内容完全匹配，含缩进和换行）' },
            new: { type: 'string', description: '替换后的新文本' },
            create_if_missing: { type: 'boolean', description: '若文件不存在且 old 为空时，创建新文件（默认 false）' }
          },
          required: ['path', 'old', 'new']
        }
      }
    },
    required: ['changes']
  }
}

async function execute(args) {
  const { changes } = args
  if (!Array.isArray(changes) || changes.length === 0) {
    return { success: false, error: '缺少 changes 参数' }
  }

  const results = []
  let allSuccess = true

  for (const change of changes) {
    const { path: filePath, old: oldText, new: newText, create_if_missing = false } = change

    if (!filePath) {
      results.push({ path: filePath, success: false, error: '缺少 path' })
      allSuccess = false
      continue
    }

    try {
      // 文件不存在时的处理
      if (!fs.existsSync(filePath)) {
        if (create_if_missing && (!oldText || oldText === '')) {
          await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
          await fs.promises.writeFile(filePath, newText, 'utf-8')
          results.push({ path: filePath, success: true, action: 'created' })
          continue
        }
        results.push({ path: filePath, success: false, error: '文件不存在' })
        allSuccess = false
        continue
      }

      const content = await fs.promises.readFile(filePath, 'utf-8')

      // 精确字符串替换（第一次匹配）
      if (!content.includes(oldText)) {
        // 尝试忽略行尾空格的模糊匹配
        const normalized = content.replace(/[ \t]+\n/g, '\n')
        const normalizedOld = oldText.replace(/[ \t]+\n/g, '\n')
        if (!normalized.includes(normalizedOld)) {
          results.push({
            path: filePath,
            success: false,
            error: `未找到匹配的原始文本。请确认 old 字段与文件内容完全一致（含空格和换行）。\n原文前100字：${content.slice(0, 100)}`
          })
          allSuccess = false
          continue
        }
        // 使用规范化版本替换
        const patched = normalized.replace(normalizedOld, newText)
        await fs.promises.writeFile(filePath, patched, 'utf-8')
        results.push({ path: filePath, success: true, action: 'patched (normalized)' })
        continue
      }

      const patched = content.replace(oldText, newText)
      await fs.promises.writeFile(filePath, patched, 'utf-8')
      results.push({ path: filePath, success: true, action: 'patched' })
    } catch (err) {
      results.push({ path: filePath, success: false, error: err.message })
      allSuccess = false
    }
  }

  return {
    success: allSuccess,
    results,
    summary: `${results.filter(r => r.success).length}/${results.length} 处修改成功`
  }
}

module.exports = { definition, execute }
