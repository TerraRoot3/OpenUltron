/**
 * 将 Execution Envelope 中的 artifacts 写入产物库（单一入库路径，供检索与渠道对齐）
 */
const fs = require('fs')
const path = require('path')
const artifactRegistry = require('./artifact-registry')

/**
 * @param {object} envelope - buildExecutionEnvelope 结果
 * @param {{ sessionId?: string, runSessionId?: string, parentRunId?: string, chatId?: string, channel?: string, source?: string }} ctx
 * @returns {{ ingested: number, skipped: number }}
 */
function ingestEnvelopeArtifacts(envelope, ctx = {}) {
  const list = envelope && Array.isArray(envelope.artifacts) ? envelope.artifacts : []
  if (list.length === 0) return { ingested: 0, skipped: 0 }
  const sessionId = String(ctx.sessionId || '').trim()
  const runSessionId = String(ctx.runSessionId || '').trim()
  const parentRunId = String(ctx.parentRunId || '').trim()
  const chatId = String(ctx.chatId || '').trim()
  const channel = String(ctx.channel || '').trim()
  const source = String(ctx.source || 'envelope').trim() || 'envelope'
  let ingested = 0
  let skipped = 0
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      skipped++
      continue
    }
    const rawPath = item.path || item.file_path || item.filePath
    if (rawPath && typeof rawPath === 'string') {
      const p = rawPath.trim()
      if (path.isAbsolute(p) && fs.existsSync(p) && fs.statSync(p).isFile()) {
        const rec = artifactRegistry.registerFileArtifact({
          path: p,
          sessionId,
          runSessionId,
          parentRunId,
          chatId,
          channel,
          source,
          kind: item.kind || 'file',
          filename: item.name || item.filename || path.basename(p)
        })
        if (rec) ingested++
        else skipped++
        continue
      }
    }
    const url = item.url || item.href || item.link
    if (url && typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
      const refRec = artifactRegistry.registerReferenceArtifact({
        url: url.trim(),
        sessionId,
        runSessionId,
        parentRunId,
        chatId,
        channel,
        source,
        kind: item.kind || 'reference',
        filename: item.name || item.title || url.trim().slice(0, 120)
      })
      if (refRec) ingested++
      else skipped++
      continue
    }
    skipped++
  }
  return { ingested, skipped }
}

module.exports = { ingestEnvelopeArtifacts }
