const fs = require('fs')
const path = require('path')
const { URL } = require('url')
const feishuNotify = require('../feishu-notify')
const { requestJson, withTenantToken } = require('../feishu-openapi')
const { logger: appLogger } = require('../../app-logger')
const { redactSensitiveText } = require('../../core/sensitive-text')

const log = appLogger?.module ? appLogger.module('FeishuDocCapability') : appLogger

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

function resolveTenantHost(tenantKey = '') {
  const key = String(tenantKey || '').trim()
  if (!key) return ''
  if (/^[a-z0-9.-]+\.(?:feishu\.cn|larksuite\.com)$/i.test(key)) return key
  // tenant_key 形如 时，补全为租户域名；避免对 oc_xxx 等机器 key 误推断
  if (/^[a-z][a-z0-9-]{2,40}$/i.test(key) && !/_/.test(key)) return `${key}.feishu.cn`
  return ''
}

function documentUrlById(id = '', options = {}) {
  const docId = String(id || '').trim()
  if (!docId) return ''
  const explicitHost = resolveTenantHost(options.docHost || '')
  if (explicitHost) return `https://${explicitHost}/docx/${docId}`
  const tenantHost = resolveTenantHost(options.tenantKey || '')
  if (tenantHost) return `https://${tenantHost}/docx/${docId}`
  return `https://docs.feishu.cn/docx/${docId}`
}

function normalizeDocumentUrl(rawUrl = '', options = {}) {
  const src = String(rawUrl || '').trim()
  const docIdFromRaw = pickDocumentId(src)
  if (!src) return documentUrlById(docIdFromRaw, options)
  let parsed = null
  try {
    parsed = new URL(src)
  } catch (_) {
    return documentUrlById(docIdFromRaw, options)
  }
  const host = String(parsed.hostname || '').toLowerCase()
  const isFeishuHost = /(feishu\.cn|larksuite\.com)$/.test(host)
  if (!isFeishuHost) return src
  const docId = docIdFromRaw || pickDocumentId(parsed.pathname)
  if (!docId) return src
  // 去掉一次性 token，避免把临时登录参数外发到消息和日志
  return documentUrlById(docId, options)
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    const s = String(v || '').trim()
    if (s) return s
  }
  return ''
}

function extractDocumentInfo(res = {}, options = {}) {
  const data = (res && typeof res === 'object' && res.data && typeof res.data === 'object') ? res.data : {}
  const doc = (data && typeof data.document === 'object' && data.document) ? data.document : {}
  const rawId = firstNonEmpty(
    data.document_id, data.documentId, data.document_token, data.documentToken, data.doc_id, data.docId, data.doc_token, data.docToken, data.token, data.obj_token, data.objToken,
    doc.document_id, doc.documentId, doc.document_token, doc.documentToken, doc.doc_id, doc.docId, doc.doc_token, doc.docToken, doc.token, doc.obj_token, doc.objToken
  )
  const rawUrl = firstNonEmpty(
    data.url, data.document_url, data.documentUrl, data.link, data.doc_url, data.docUrl, data.web_url, data.webUrl,
    doc.url, doc.document_url, doc.documentUrl, doc.link, doc.doc_url, doc.docUrl, doc.web_url, doc.webUrl
  )
  const urlId = pickDocumentId(rawUrl)
  const documentId = pickDocumentId(rawId || urlId)
  const url = normalizeDocumentUrl(rawUrl || documentUrlById(documentId, options), options)
  return {
    documentId,
    url,
    title: firstNonEmpty(data.title, doc.title)
  }
}

function shortText(s, max = 200) {
  const txt = redactSensitiveText(String(s || ''))
  if (txt.length <= max) return txt
  return `${txt.slice(0, max)}...(${txt.length})`
}

function summarizeValue(v, depth = 0) {
  if (v == null) return v
  if (typeof v === 'string') return shortText(v, 240)
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) {
    if (depth >= 2) return `[array:${v.length}]`
    return v.slice(0, 8).map((x) => summarizeValue(x, depth + 1))
  }
  if (typeof v === 'object') {
    if (depth >= 2) return '[object]'
    const out = {}
    for (const [k, val] of Object.entries(v)) {
      if (k === 'markdown' || k === 'append_markdown') {
        const raw = String(val || '')
        out[k] = { len: raw.length, preview: shortText(raw, 100) }
      } else {
        out[k] = summarizeValue(val, depth + 1)
      }
    }
    return out
  }
  return shortText(String(v), 240)
}

async function apiRequest(label, payload) {
  const method = String(payload?.method || 'GET').toUpperCase()
  const pathName = String(payload?.path || '')
  log?.info?.('[FeishuDocCapability] API请求', {
    label,
    method,
    path: pathName,
    body: summarizeValue(payload?.body || null)
  })
  try {
    const res = await requestJson(payload)
    const data = (res && typeof res === 'object') ? (res.data || {}) : {}
    const doc = (data && typeof data.document === 'object') ? data.document : {}
    const docInfo = extractDocumentInfo(res, { tenantKey: payload?.tenantKey || '' })
    log?.info?.('[FeishuDocCapability] API响应', {
      label,
      method,
      path: pathName,
      code: res?.code,
      msg: shortText(res?.msg || '', 180),
      data_keys: (data && typeof data === 'object') ? Object.keys(data).slice(0, 20) : [],
      data_document_keys: (doc && typeof doc === 'object') ? Object.keys(doc).slice(0, 20) : [],
      document_id: docInfo.documentId || '',
      url: docInfo.url || ''
    })
    return res
  } catch (e) {
    const message = shortText(e?.message || String(e), 300)
    log?.warn?.('[FeishuDocCapability] API异常', {
      label,
      method,
      path: pathName,
      error: message
    })
    throw e
  }
}

async function createDocument({ title, token, tenantKey }) {
  return await apiRequest('docx.create', {
    method: 'POST',
    path: '/open-apis/docx/v1/documents',
    token,
    tenantKey: String(tenantKey || '').trim(),
    body: {
      title: String(title || 'AI 文档')
    }
  })
}

async function createDocByMarkdownOrFallback({ markdown, title, token, tenantKey }) {
  const created = await createDocument({ title, token, tenantKey })
  const docInfo = extractDocumentInfo(created, { tenantKey })
  let writeResult = null
  let writeError = ''
  if (docInfo.documentId) {
    try {
      writeResult = await writeMarkdownToCreatedDocument({
        documentId: docInfo.documentId,
        markdown,
        token,
        tenantKey
      })
    } catch (e) {
      writeError = String(e?.message || e || '').trim()
    }
  }
  return {
    res: created,
    content_written: !!(writeResult && writeResult.success),
    write_result: writeResult,
    write_error: writeError
  }
}

async function readRawDocument({ documentId, token, tenantKey }) {
  const id = pickDocumentId(documentId)
  if (!id) throw new Error('缺少 document_id')
  return await apiRequest('docx.read_raw', {
    method: 'GET',
    path: `/open-apis/docx/v1/documents/${encodeURIComponent(id)}/raw_content`,
    token,
    tenantKey: String(tenantKey || '').trim()
  })
}

function markdownToPlainLines(markdown = '') {
  const src = String(markdown || '')
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, '').trim())
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, '[$1]')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
  const lines = src
    .split('\n')
    .map((line) => line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^\s*[-*+]\s+/, '• ')
      .replace(/^\s*\d+\.\s+/, '')
      .replace(/[*_`~]/g, '')
      .trim()
    )
    .filter(Boolean)
  return lines.slice(0, 300)
}

function toTextBlock(line = '') {
  const text = String(line || '').trim().slice(0, 1800)
  return {
    block_type: 2,
    text: {
      elements: [
        {
          text_run: { content: text }
        }
      ]
    }
  }
}

async function appendBlocksToDocument({ documentId, blockId, lines, token, tenantKey }) {
  const id = pickDocumentId(documentId)
  const parent = String(blockId || '').trim() || id
  const chunks = []
  for (let i = 0; i < lines.length; i += 20) chunks.push(lines.slice(i, i + 20))
  let revision = null
  for (const chunk of chunks) {
    const children = chunk.map(toTextBlock).filter((x) => x.text?.elements?.[0]?.text_run?.content)
    if (!children.length) continue
    const reqPath = `/open-apis/docx/v1/documents/${encodeURIComponent(id)}/blocks/${encodeURIComponent(parent)}/children`
    const query = revision != null ? `?document_revision_id=${encodeURIComponent(String(revision))}` : ''
    const res = await apiRequest('docx.block_children_create', {
      method: 'POST',
      path: `${reqPath}${query}`,
      token,
      tenantKey: String(tenantKey || '').trim(),
      body: {
        children
      }
    })
    const nextRev = Number((res && res.data && res.data.document_revision_id) || NaN)
    if (Number.isFinite(nextRev)) revision = nextRev
  }
}

async function listDocumentBlocks({ documentId, token, tenantKey }) {
  const id = pickDocumentId(documentId)
  return await apiRequest('docx.block_list', {
    method: 'GET',
    path: `/open-apis/docx/v1/documents/${encodeURIComponent(id)}/blocks?page_size=200`,
    token,
    tenantKey: String(tenantKey || '').trim()
  })
}

function pickWritableBlockId(documentId, listRes = {}) {
  const id = pickDocumentId(documentId)
  const items = Array.isArray(listRes?.data?.items) ? listRes.data.items : []
  const preferred = items.find((x) => String(x?.block_id || '') === id)
    || items.find((x) => Number(x?.block_type) === 1)
    || items.find((x) => !String(x?.parent_id || '').trim())
    || items[0]
  return String(preferred?.block_id || id).trim() || id
}

async function writeMarkdownToCreatedDocument({ documentId, markdown, token, tenantKey }) {
  const lines = markdownToPlainLines(markdown)
  if (!lines.length) return { success: true, lines: 0, block_id: pickDocumentId(documentId) }
  const id = pickDocumentId(documentId)
  // 先尝试直接写到根 block（通常可用），失败再 list blocks 选可写 block 重试
  try {
    await appendBlocksToDocument({ documentId: id, blockId: id, lines, token, tenantKey })
    return { success: true, lines: lines.length, block_id: id, fallback_block_lookup: false }
  } catch (e) {
    const listed = await listDocumentBlocks({ documentId: id, token, tenantKey })
    const blockId = pickWritableBlockId(id, listed)
    await appendBlocksToDocument({ documentId: id, blockId, lines, token, tenantKey })
    return { success: true, lines: lines.length, block_id: blockId, fallback_block_lookup: true }
  }
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
  const tenantKey = String(context?.feishuTenantKey || '').trim()
  const docHost = String(context?.feishuDocHost || '').trim()
  const urlOptions = { tenantKey, docHost }
  log?.info?.('[FeishuDocCapability] 执行开始', {
    action,
    args: summarizeValue(args),
    has_chat_id: !!String(context?.feishuChatId || '').trim(),
    tenant_key: tenantKey || '',
    doc_host: docHost || ''
  })
  const token = await withTenantToken()

  if (action === 'create') {
    const markdown = String(args.markdown || '').trim()
    if (!markdown) return { success: false, error: 'create 需要 markdown' }
    const fileName = String(args.title || 'AI 文档').trim()
    const { res, content_written, write_result, write_error } = await createDocByMarkdownOrFallback({ markdown, title: fileName, token, tenantKey })
    const docInfo = extractDocumentInfo(res, urlOptions)
    const documentId = docInfo.documentId
    const url = docInfo.url || documentUrlById(documentId, urlOptions)
    const result = {
      success: true,
      action,
      document_id: documentId || '',
      url,
      message: documentId
        ? (content_written ? '文档创建成功（已写入正文）' : `文档已创建，但正文写入失败：${write_error || '未知错误'}`)
        : '文档创建完成，但未解析到文档ID（请勿返回或缓存任何猜测链接）',
      content_written: !!content_written,
      write_result: write_result || null,
      raw: res
    }
    if (write_result) {
      result.content_lines = Number(write_result?.lines || 0)
      result.write_block_id = String(write_result?.block_id || '')
    }
    log?.info?.('[FeishuDocCapability] 执行完成', {
      action,
      success: true,
      document_id: result.document_id || '',
      url: result.url || '',
      content_written: result.content_written === true
    })
    return result
  }

  if (action === 'read') {
    const res = await readRawDocument({ documentId: args.document_id, token, tenantKey })
    const content = extractRawContent(res)
    const result = {
      success: true,
      action,
      document_id: pickDocumentId(args.document_id),
      content,
      message: content ? '读取成功' : '读取成功，但内容为空',
      raw: res
    }
    log?.info?.('[FeishuDocCapability] 执行完成', {
      action,
      success: true,
      document_id: result.document_id || '',
      content_len: String(content || '').length
    })
    return result
  }

  if (action === 'append_copy') {
    const appendMarkdown = String(args.append_markdown || '').trim()
    if (!appendMarkdown) return { success: false, error: 'append_copy 需要 append_markdown' }
    const read = await readRawDocument({ documentId: args.document_id, token, tenantKey })
    const base = extractRawContent(read)
    const merged = `${base}\n\n${appendMarkdown}`.trim()
    if (!merged) return { success: false, error: '原文为空且追加内容为空' }
    const fileName = String(args.title || 'AI 文档（追加版）').trim()
    const { res, content_written, write_result, write_error } = await createDocByMarkdownOrFallback({ markdown: merged, title: fileName, token, tenantKey })
    const docInfo = extractDocumentInfo(res, urlOptions)
    const documentId = docInfo.documentId
    const url = docInfo.url || documentUrlById(documentId, urlOptions)
    const result = {
      success: true,
      action,
      source_document_id: pickDocumentId(args.document_id),
      document_id: documentId || '',
      url,
      message: documentId
        ? (content_written ? '已生成追加后的新文档（正文已写入）' : `追加副本已创建，但正文写入失败：${write_error || '未知错误'}`)
        : '追加副本已创建，但未解析到文档ID（请勿返回或缓存任何猜测链接）',
      content_written: !!content_written,
      write_result: write_result || null,
      raw: res
    }
    if (write_result) {
      result.content_lines = Number(write_result?.lines || 0)
    }
    log?.info?.('[FeishuDocCapability] 执行完成', {
      action,
      success: true,
      document_id: result.document_id || '',
      source_document_id: result.source_document_id || ''
    })
    return result
  }

  if (action === 'rewrite_copy') {
    const markdown = String(args.markdown || '').trim()
    if (!markdown) return { success: false, error: 'rewrite_copy 需要 markdown' }
    const fileName = String(args.title || 'AI 文档（改写版）').trim()
    const { res, content_written, write_result, write_error } = await createDocByMarkdownOrFallback({ markdown, title: fileName, token, tenantKey })
    const docInfo = extractDocumentInfo(res, urlOptions)
    const documentId = docInfo.documentId
    const url = docInfo.url || documentUrlById(documentId, urlOptions)
    const result = {
      success: true,
      action,
      source_document_id: pickDocumentId(args.document_id),
      document_id: documentId || '',
      url,
      message: documentId
        ? (content_written ? '已生成改写后的新文档（正文已写入）' : `改写副本已创建，但正文写入失败：${write_error || '未知错误'}`)
        : '改写副本已创建，但未解析到文档ID（请勿返回或缓存任何猜测链接）',
      content_written: !!content_written,
      write_result: write_result || null,
      raw: res
    }
    if (write_result) {
      result.content_lines = Number(write_result?.lines || 0)
    }
    log?.info?.('[FeishuDocCapability] 执行完成', {
      action,
      success: true,
      document_id: result.document_id || '',
      source_document_id: result.source_document_id || ''
    })
    return result
  }

  if (action === 'append_inplace') {
    const appendMarkdown = String(args.append_markdown || '').trim()
    if (!appendMarkdown) return { success: false, error: 'append_inplace 需要 append_markdown' }
    const sourceId = pickDocumentId(args.document_id)
    if (!sourceId) return { success: false, error: 'append_inplace 需要有效的 document_id' }
    const lines = markdownToPlainLines(appendMarkdown)
    if (!lines.length) return { success: false, error: 'append_inplace 追加内容为空' }
    let writeResult = null
    let writeError = ''
    try {
      await appendBlocksToDocument({ documentId: sourceId, blockId: sourceId, lines, token, tenantKey })
      writeResult = { success: true, lines: lines.length, block_id: sourceId, fallback_block_lookup: false }
    } catch (e) {
      try {
        const listed = await listDocumentBlocks({ documentId: sourceId, token, tenantKey })
        const blockId = pickWritableBlockId(sourceId, listed)
        await appendBlocksToDocument({ documentId: sourceId, blockId, lines, token, tenantKey })
        writeResult = { success: true, lines: lines.length, block_id: blockId, fallback_block_lookup: true }
      } catch (e2) {
        writeError = String(e2?.message || e?.message || e2 || e || '').trim()
      }
    }
    if (!writeResult?.success) {
      return { success: false, error: `append_inplace 失败：${writeError || '未知错误'}` }
    }
    const result = {
      success: true,
      action,
      document_id: sourceId,
      source_document_id: sourceId,
      url: documentUrlById(sourceId, urlOptions),
      fallback: 'inplace',
      message: '已在原文档末尾追加内容',
      content_written: true,
      write_result: writeResult || null
    }
    result.content_lines = Number(writeResult?.lines || 0)
    log?.info?.('[FeishuDocCapability] 执行完成', {
      action,
      success: true,
      document_id: result.document_id || '',
      source_document_id: result.source_document_id || '',
      fallback: result.fallback
    })
    return result
  }

  if (action === 'rewrite_inplace') {
    const instruction = String(args.rewrite_instruction || '').trim()
    const replacement = String(args.markdown || '').trim()
    if (!instruction && !replacement) return { success: false, error: 'rewrite_inplace 需要 rewrite_instruction 或 markdown' }
    const read = await readRawDocument({ documentId: args.document_id, token, tenantKey })
    const base = extractRawContent(read)
    const outMarkdown = replacement || (
      `# 改写说明\n${instruction}\n\n# 原文\n${base}`
    )
    const sourceId = pickDocumentId(args.document_id)
    const tempTitle = String(args.title || `AI改写-${Date.now()}`).trim()
    const { res: imported, content_written, write_result, write_error } = await createDocByMarkdownOrFallback({ markdown: outMarkdown, title: tempTitle, token, tenantKey })
    const importedInfo = extractDocumentInfo(imported, urlOptions)
    const newId = importedInfo.documentId
    if (!newId) return { success: false, error: '改写后文档创建失败' }
    const result = {
      success: true,
      action,
      document_id: newId || sourceId,
      source_document_id: sourceId,
      temp_document_id: newId,
      url: importedInfo.url || documentUrlById(newId || sourceId, urlOptions),
      fallback: 'copy_based',
      message: content_written
        ? '当前采用副本方式完成改写，已生成新文档版本（正文已写入）'
        : `当前采用副本方式完成改写，但正文写入失败：${write_error || '未知错误'}`,
      content_written: !!content_written,
      write_result: write_result || null
    }
    if (write_result) {
      result.content_lines = Number(write_result?.lines || 0)
    }
    log?.info?.('[FeishuDocCapability] 执行完成', {
      action,
      success: true,
      document_id: result.document_id || '',
      source_document_id: result.source_document_id || '',
      fallback: result.fallback
    })
    return result
  }

  if (action === 'export_and_send') {
    const sourceId = pickDocumentId(args.document_id)
    if (!sourceId) return { success: false, error: 'export_and_send 需要 document_id' }
    const read = await readRawDocument({ documentId: sourceId, token, tenantKey })
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
    const result = {
      success: !!sendRes.success,
      action,
      document_id: sourceId,
      export_path: outPath,
      url: documentUrlById(sourceId, urlOptions),
      message: sendRes.success ? '导出并发送成功' : `导出成功但发送失败：${sendRes.message || '未知错误'}`,
      send_result: sendRes
    }
    log?.info?.('[FeishuDocCapability] 执行完成', {
      action,
      success: !!result.success,
      document_id: result.document_id || '',
      export_path: result.export_path || '',
      send_success: !!sendRes?.success
    })
    return result
  }

  return { success: false, error: `不支持的 action: ${action}` }
}

module.exports = { definition, execute }
