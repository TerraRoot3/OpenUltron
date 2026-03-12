const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const feishuNotify = require('../feishu-notify')
const { requestJson, withTenantToken } = require('../feishu-openapi')

const definition = {
  description: '飞书文档能力（创建/读取/追加改写副本）。用于在飞书场景下对文档执行真实写入而非仅输出文本草稿。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'read', 'append_copy', 'rewrite_copy', 'rewrite_inplace', 'append_inplace', 'export_and_send'],
        description: '操作类型：create 创建文档；read 读取文档原文；append_copy 基于原文追加后另存；rewrite_copy 用新内容重写并另存；rewrite_inplace/append_inplace 直接改写原文档；export_and_send 导出文本并发送。'
      },
      document_id: {
        type: 'string',
        description: '文档 id（或包含 id 的链接）。read/append_copy/rewrite_copy 需要。'
      },
      title: {
        type: 'string',
        description: '目标文档标题。create/rewrite_copy/append_copy 推荐传入。'
      },
      markdown: {
        type: 'string',
        description: 'create 或 rewrite_copy 的 markdown 内容。'
      },
      append_markdown: {
        type: 'string',
        description: 'append_copy 追加的 markdown 内容。'
      },
      rewrite_instruction: {
        type: 'string',
        description: 'rewrite_inplace 的改写要求（如：改成更正式语气，保留要点）。'
      },
      send_chat_id: {
        type: 'string',
        description: 'export_and_send 时可选指定 chat_id，不传则用当前飞书会话。'
      }
    },
    required: ['action']
  }
}

function pickDocumentId(input = '') {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (/^[A-Za-z0-9]{10,}$/.test(raw)) return raw
  try {
    const u = new URL(raw)
    const m1 = u.pathname.match(/\/docx\/([A-Za-z0-9]+)/)
    if (m1 && m1[1]) return m1[1]
    const m2 = u.pathname.match(/\/docs\/([A-Za-z0-9]+)/)
    if (m2 && m2[1]) return m2[1]
    const p = u.searchParams.get('document_id')
    if (p) return p
  } catch (_) {}
  return raw
}

function documentUrlById(id = '') {
  const docId = String(id || '').trim()
  if (!docId) return ''
  return `https://open.feishu.cn/document/client-docs/docs/${docId}`
}

async function importMarkdown({ markdown, fileName, token }) {
  return await requestJson({
    method: 'POST',
    path: '/open-apis/docx/builtin/import',
    token,
    body: {
      file_name: String(fileName || '未命名文档'),
      markdown: String(markdown || '')
    }
  })
}

async function readRawDocument({ documentId, token }) {
  const id = pickDocumentId(documentId)
  if (!id) throw new Error('缺少 document_id')
  return await requestJson({
    method: 'GET',
    path: `/open-apis/docx/v1/documents/${encodeURIComponent(id)}/raw_content`,
    token
  })
}

function extractRawContent(res) {
  const direct = res && res.data && res.data.content
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const txt = res && res.data && res.data.raw_content
  if (typeof txt === 'string' && txt.trim()) return txt.trim()
  return ''
}

async function execute(args = {}, context = {}) {
  const action = String(args.action || '').trim()
  if (!action) return { success: false, error: '缺少 action' }
  const token = await withTenantToken()

  if (action === 'create') {
    const markdown = String(args.markdown || '').trim()
    if (!markdown) return { success: false, error: 'create 需要 markdown' }
    const fileName = String(args.title || 'AI 文档').trim()
    const res = await importMarkdown({ markdown, fileName, token })
    const documentId = String((res && res.data && (res.data.document_id || res.data.documentId)) || '').trim()
    return {
      success: true,
      action,
      document_id: documentId || '',
      url: documentUrlById(documentId),
      message: documentId ? '文档创建成功' : '文档创建完成（未返回 document_id）',
      raw: res
    }
  }

  if (action === 'read') {
    const res = await readRawDocument({ documentId: args.document_id, token })
    const content = extractRawContent(res)
    return {
      success: true,
      action,
      document_id: pickDocumentId(args.document_id),
      content,
      message: content ? '读取成功' : '读取成功，但内容为空',
      raw: res
    }
  }

  if (action === 'append_copy') {
    const appendMarkdown = String(args.append_markdown || '').trim()
    if (!appendMarkdown) return { success: false, error: 'append_copy 需要 append_markdown' }
    const read = await readRawDocument({ documentId: args.document_id, token })
    const base = extractRawContent(read)
    const merged = `${base}\n\n${appendMarkdown}`.trim()
    if (!merged) return { success: false, error: '原文为空且追加内容为空' }
    const fileName = String(args.title || 'AI 文档（追加版）').trim()
    const res = await importMarkdown({ markdown: merged, fileName, token })
    const documentId = String((res && res.data && (res.data.document_id || res.data.documentId)) || '').trim()
    return {
      success: true,
      action,
      source_document_id: pickDocumentId(args.document_id),
      document_id: documentId || '',
      url: documentUrlById(documentId),
      message: documentId ? '已生成追加后的新文档' : '追加副本已创建（未返回 document_id）',
      raw: res
    }
  }

  if (action === 'rewrite_copy') {
    const markdown = String(args.markdown || '').trim()
    if (!markdown) return { success: false, error: 'rewrite_copy 需要 markdown' }
    const fileName = String(args.title || 'AI 文档（改写版）').trim()
    const res = await importMarkdown({ markdown, fileName, token })
    const documentId = String((res && res.data && (res.data.document_id || res.data.documentId)) || '').trim()
    return {
      success: true,
      action,
      source_document_id: pickDocumentId(args.document_id),
      document_id: documentId || '',
      url: documentUrlById(documentId),
      message: documentId ? '已生成改写后的新文档' : '改写副本已创建（未返回 document_id）',
      raw: res
    }
  }

  if (action === 'append_inplace') {
    const appendMarkdown = String(args.append_markdown || '').trim()
    if (!appendMarkdown) return { success: false, error: 'append_inplace 需要 append_markdown' }
    const read = await readRawDocument({ documentId: args.document_id, token })
    const base = extractRawContent(read)
    const merged = `${base}\n\n${appendMarkdown}`.trim()
    if (!merged) return { success: false, error: '原文为空且追加内容为空' }
    const sourceId = pickDocumentId(args.document_id)
    const tempTitle = String(args.title || `AI临时改写-${Date.now()}`).trim()
    const imported = await importMarkdown({ markdown: merged, fileName: tempTitle, token })
    const newId = String((imported && imported.data && (imported.data.document_id || imported.data.documentId)) || '').trim()
    if (!newId) return { success: false, error: '临时文档创建失败，无法覆盖原文档' }
    return {
      success: true,
      action,
      document_id: newId || sourceId,
      source_document_id: sourceId,
      temp_document_id: newId,
      url: documentUrlById(newId || sourceId),
      fallback: 'copy_based',
      message: '当前采用副本方式完成追加，已生成新文档版本'
    }
  }

  if (action === 'rewrite_inplace') {
    const instruction = String(args.rewrite_instruction || '').trim()
    const replacement = String(args.markdown || '').trim()
    if (!instruction && !replacement) return { success: false, error: 'rewrite_inplace 需要 rewrite_instruction 或 markdown' }
    const read = await readRawDocument({ documentId: args.document_id, token })
    const base = extractRawContent(read)
    const outMarkdown = replacement || (
      `# 改写说明\n${instruction}\n\n# 原文\n${base}`
    )
    const sourceId = pickDocumentId(args.document_id)
    const tempTitle = String(args.title || `AI改写-${Date.now()}`).trim()
    const imported = await importMarkdown({ markdown: outMarkdown, fileName: tempTitle, token })
    const newId = String((imported && imported.data && (imported.data.document_id || imported.data.documentId)) || '').trim()
    if (!newId) return { success: false, error: '改写后文档创建失败' }
    return {
      success: true,
      action,
      document_id: newId || sourceId,
      source_document_id: sourceId,
      temp_document_id: newId,
      url: documentUrlById(newId || sourceId),
      fallback: 'copy_based',
      message: '当前采用副本方式完成改写，已生成新文档版本'
    }
  }

  if (action === 'export_and_send') {
    const sourceId = pickDocumentId(args.document_id)
    if (!sourceId) return { success: false, error: 'export_and_send 需要 document_id' }
    const read = await readRawDocument({ documentId: sourceId, token })
    const content = extractRawContent(read)
    if (!content) return { success: false, error: '文档内容为空，无法导出' }
    const ts = Date.now()
    const fileBase = (String(args.title || `feishu-doc-${sourceId}`).trim() || `feishu-doc-${sourceId}`)
      .replace(/[^\w\-\u4e00-\u9fa5]+/g, '_')
    const outPath = path.join(require('os').tmpdir(), `${fileBase}-${ts}.md`)
    fs.writeFileSync(outPath, content, 'utf-8')
    const sendRes = await feishuNotify.sendMessage({
      chat_id: String(args.send_chat_id || context.feishuChatId || '').trim() || undefined,
      file_path: outPath,
      file_name: path.basename(outPath)
    })
    return {
      success: !!sendRes.success,
      action,
      document_id: sourceId,
      export_path: outPath,
      url: documentUrlById(sourceId),
      message: sendRes.success ? '导出并发送成功' : `导出成功但发送失败：${sendRes.message || '未知错误'}`,
      send_result: sendRes
    }
  }

  return { success: false, error: `不支持的 action: ${action}` }
}

module.exports = { definition, execute }
