const https = require('https')
const { URL } = require('url')
const feishuNotify = require('../feishu-notify')

const definition = {
  description: '飞书文档能力（创建/读取/追加改写副本）。用于在飞书场景下对文档执行真实写入而非仅输出文本草稿。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'read', 'append_copy', 'rewrite_copy'],
        description: '操作类型：create 创建文档；read 读取文档原文；append_copy 基于原文追加后另存；rewrite_copy 用新内容重写并另存。'
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
      }
    },
    required: ['action']
  }
}

function requestJson({ method = 'GET', path, token, body }) {
  return new Promise((resolve, reject) => {
    const data = body != null ? Buffer.from(JSON.stringify(body), 'utf-8') : null
    const req = https.request({
      host: 'open.feishu.cn',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
        ...(data ? { 'Content-Length': data.length } : {})
      }
    }, (res) => {
      let buf = ''
      res.on('data', (ch) => { buf += ch })
      res.on('end', () => {
        try {
          const json = JSON.parse(buf || '{}')
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json)
          return reject(new Error(json.msg || json.error_description || `HTTP ${res.statusCode}`))
        } catch (e) {
          reject(new Error(buf || e.message))
        }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
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

async function execute(args = {}) {
  const action = String(args.action || '').trim()
  if (!action) return { success: false, error: '缺少 action' }
  const token = await feishuNotify.getTenantAccessToken()

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

  return { success: false, error: `不支持的 action: ${action}` }
}

module.exports = { definition, execute }

