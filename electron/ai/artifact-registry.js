const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { DatabaseSync } = require('node:sqlite')
const { getAppRootPath } = require('../app-root')
const { logger: appLogger } = require('../app-logger')

const DB_PATH = getAppRootPath('memory', 'artifacts.db')
const STORE_ROOT = getAppRootPath('artifacts', 'store')

let db = null
let initialized = false

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function ensureDb() {
  if (db) return db
  ensureDir(path.dirname(DB_PATH))
  ensureDir(STORE_ROOT)
  db = new DatabaseSync(DB_PATH)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      channel TEXT,
      session_id TEXT,
      run_session_id TEXT,
      message_id TEXT,
      chat_id TEXT,
      role TEXT,
      path TEXT NOT NULL,
      original_path TEXT,
      filename TEXT,
      mime TEXT,
      size INTEGER,
      sha256 TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_session_time ON artifacts(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_artifacts_message ON artifacts(message_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_chat_time ON artifacts(chat_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_artifacts_sha ON artifacts(sha256);
    CREATE TABLE IF NOT EXISTS message_artifacts (
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      role TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (session_id, message_id, artifact_id)
    );
    CREATE INDEX IF NOT EXISTS idx_message_artifacts_session_message ON message_artifacts(session_id, message_id);
    CREATE INDEX IF NOT EXISTS idx_message_artifacts_artifact ON message_artifacts(artifact_id);
  `)
  try {
    const cols = db.prepare('PRAGMA table_info(artifacts)').all()
    const hasParentRun = cols.some((c) => c && c.name === 'parent_run_id')
    if (!hasParentRun) {
      db.exec('ALTER TABLE artifacts ADD COLUMN parent_run_id TEXT')
      appLogger?.info?.('[ArtifactRegistry] migrated: parent_run_id column')
    }
  } catch (e) {
    appLogger?.warn?.('[ArtifactRegistry] migrate parent_run_id failed', { error: e.message || String(e) })
  }
  if (!initialized) {
    initialized = true
    appLogger?.info?.('[ArtifactRegistry] initialized', { dbPath: DB_PATH, storeRoot: STORE_ROOT })
  }
  return db
}

function inferKind(kind, filePath, mime) {
  const k = String(kind || '').trim().toLowerCase()
  if (k) return k
  const m = String(mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('audio/')) return 'audio'
  if (m.startsWith('video/')) return 'video'
  const ext = path.extname(String(filePath || '')).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return 'image'
  if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac'].includes(ext)) return 'audio'
  if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) return 'video'
  if (['.html', '.htm'].includes(ext)) return 'html'
  return 'file'
}

function inferMime(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  const m = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.html': 'text/html',
    '.htm': 'text/html'
  }
  return m[ext] || 'application/octet-stream'
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256')
  const buf = fs.readFileSync(filePath)
  hash.update(buf)
  return hash.digest('hex')
}

function buildManagedPath(artifactId, filename) {
  const now = new Date()
  const y = String(now.getFullYear())
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const ext = path.extname(String(filename || '')).toLowerCase()
  const safeExt = /^[a-z0-9.]+$/i.test(ext) ? ext : ''
  const dir = path.join(STORE_ROOT, y, m, day)
  ensureDir(dir)
  return path.join(dir, `${artifactId}${safeExt}`)
}

function insertArtifactRow(input = {}, { originalPath = '', managedPath = '', size = 0 } = {}) {
  const database = ensureDb()
  if (!managedPath || !path.isAbsolute(managedPath) || !fs.existsSync(managedPath)) return null
  const artifactId = String(input.artifactId || '').trim() || crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const filename = input.filename || path.basename(managedPath)
  const mime = input.mime || inferMime(managedPath)
  const kind = inferKind(input.kind, managedPath, mime)
  const sha256 = sha256File(managedPath)
  const stmt = database.prepare(`
    INSERT INTO artifacts (
      id, kind, source, channel, session_id, run_session_id, message_id, chat_id, role,
      path, original_path, filename, mime, size, sha256, created_at, parent_run_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    artifactId,
    kind,
    String(input.source || 'unknown'),
    String(input.channel || ''),
    String(input.sessionId || ''),
    String(input.runSessionId || ''),
    String(input.messageId || ''),
    String(input.chatId || ''),
    String(input.role || ''),
    managedPath,
    originalPath,
    filename,
    mime,
    size,
    sha256,
    createdAt,
    String(input.parentRunId || '')
  )
  appLogger?.info?.('[ArtifactRegistry] register file', {
    id: artifactId,
    kind,
    source: String(input.source || 'unknown'),
    sessionId: String(input.sessionId || ''),
    messageId: String(input.messageId || ''),
    parentRunId: String(input.parentRunId || '') || undefined,
    path: managedPath
  })
  return {
    artifactId,
    kind,
    path: managedPath,
    originalPath,
    filename,
    mime,
    size,
    sha256,
    createdAt
  }
}

function registerFileArtifact(input = {}) {
  const originalPath = String(input.path || '').trim()
  if (!originalPath || !path.isAbsolute(originalPath) || !fs.existsSync(originalPath)) return null
  const stat = fs.statSync(originalPath)
  if (!stat.isFile()) return null
  const artifactId = crypto.randomUUID()
  const filename = input.filename || path.basename(originalPath)
  const managedPath = buildManagedPath(artifactId, filename)
  fs.copyFileSync(originalPath, managedPath)
  return insertArtifactRow({ ...input, artifactId }, { originalPath, managedPath, size: stat.size })
}

function registerBase64Artifact(input = {}) {
  const data = String(input.base64 || '').trim()
  if (!data) return null
  const artifactId = crypto.randomUUID()
  const ext = String(input.ext || '.png').startsWith('.') ? String(input.ext || '.png') : `.${String(input.ext)}`
  const managedPath = buildManagedPath(artifactId, `artifact${ext}`)
  const raw = Buffer.from(data, 'base64')
  fs.writeFileSync(managedPath, raw)
  return insertArtifactRow({
    ...input,
    artifactId,
    filename: path.basename(managedPath)
  }, {
    originalPath: '',
    managedPath,
    size: raw.length
  })
}

function registerReferenceArtifact(input = {}) {
  const ref = String(input.url || input.ref || '').trim()
  const refKey = String(input.refKey || '').trim()
  if (!ref && !refKey) return null
  const artifactId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const kind = String(input.kind || 'reference').trim().toLowerCase() || 'reference'
  const source = String(input.source || 'unknown')
  const channel = String(input.channel || '')
  const sessionId = String(input.sessionId || '')
  const runSessionId = String(input.runSessionId || '')
  const messageId = String(input.messageId || '')
  const chatId = String(input.chatId || '')
  const role = String(input.role || '')
  const pathValue = ref || `ref:${kind}:${refKey}`
  const originalPath = refKey || ''
  const filename = String(input.filename || input.title || refKey || pathValue).slice(0, 255)
  const mime = String(input.mime || 'application/x-reference')
  const size = Number.isFinite(Number(input.size)) ? Number(input.size) : 0
  const sha256 = crypto.createHash('sha256').update(`${kind}|${pathValue}|${originalPath}`).digest('hex')

  const database = ensureDb()
  const parentRunId = String(input.parentRunId || '')
  const stmt = database.prepare(`
    INSERT INTO artifacts (
      id, kind, source, channel, session_id, run_session_id, message_id, chat_id, role,
      path, original_path, filename, mime, size, sha256, created_at, parent_run_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    artifactId,
    kind,
    source,
    channel,
    sessionId,
    runSessionId,
    messageId,
    chatId,
    role,
    pathValue,
    originalPath,
    filename,
    mime,
    size,
    sha256,
    createdAt,
    parentRunId
  )
  appLogger?.info?.('[ArtifactRegistry] register reference', {
    id: artifactId,
    kind,
    source,
    sessionId,
    messageId,
    parentRunId: parentRunId || undefined,
    path: pathValue
  })
  return {
    artifactId,
    kind,
    path: pathValue,
    originalPath,
    filename,
    mime,
    size,
    sha256,
    createdAt
  }
}

function bindArtifactsToMessage({ sessionId, messageId, role = '', artifactIds = [] } = {}) {
  const sid = String(sessionId || '').trim()
  const mid = String(messageId || '').trim()
  if (!sid || !mid || !Array.isArray(artifactIds) || artifactIds.length === 0) return
  const database = ensureDb()
  const stmt = database.prepare(`
    INSERT OR IGNORE INTO message_artifacts (session_id, message_id, artifact_id, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const now = new Date().toISOString()
  for (const id of artifactIds) {
    const aid = String(id || '').trim()
    if (!aid) continue
    stmt.run(sid, mid, aid, String(role || ''), now)
  }
  appLogger?.info?.('[ArtifactRegistry] bind message', {
    sessionId: sid,
    messageId: mid,
    count: artifactIds.length
  })
}

function listRecentArtifactsBySession(sessionId, { kinds = [], limit = 20 } = {}) {
  const sid = String(sessionId || '').trim()
  if (!sid) return []
  const database = ensureDb()
  const lim = Math.max(1, Math.min(Number(limit) || 20, 100))
  const kindList = Array.isArray(kinds) ? kinds.map((x) => String(x || '').trim()).filter(Boolean) : []
  const rows = kindList.length > 0
    ? database.prepare(`
      SELECT * FROM artifacts
      WHERE session_id = ? AND kind IN (${kindList.map(() => '?').join(',')})
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sid, ...kindList, lim)
    : database.prepare(`
      SELECT * FROM artifacts
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(sid, lim)
  appLogger?.info?.('[ArtifactRegistry] query session', { sessionId: sid, kinds: kindList.join(','), limit: lim, hit: rows.length })
  return rows
}

function listArtifactsByMessage(sessionId, messageId) {
  const sid = String(sessionId || '').trim()
  const mid = String(messageId || '').trim()
  if (!sid || !mid) return []
  const database = ensureDb()
  const rows = database.prepare(`
    SELECT a.* FROM artifacts a
    INNER JOIN message_artifacts ma ON ma.artifact_id = a.id
    WHERE ma.session_id = ? AND ma.message_id = ?
    ORDER BY a.created_at DESC
  `).all(sid, mid)
  appLogger?.info?.('[ArtifactRegistry] query message', { sessionId: sid, messageId: mid, hit: rows.length })
  return rows
}

function getArtifactById(artifactId) {
  const id = String(artifactId || '').trim()
  if (!id) return null
  const database = ensureDb()
  const row = database.prepare('SELECT * FROM artifacts WHERE id = ? LIMIT 1').get(id)
  return row || null
}

function searchArtifacts({ sessionId = '', chatId = '', kinds = [], query = '', limit = 20 } = {}) {
  const sid = String(sessionId || '').trim()
  const cid = String(chatId || '').trim()
  const q = String(query || '').trim()
  const lim = Math.max(1, Math.min(Number(limit) || 20, 100))
  const kindList = Array.isArray(kinds) ? kinds.map((x) => String(x || '').trim()).filter(Boolean) : []
  const database = ensureDb()
  const where = []
  const args = []

  if (sid) {
    where.push('session_id = ?')
    args.push(sid)
  } else if (cid) {
    where.push('chat_id = ?')
    args.push(cid)
  }

  if (kindList.length > 0) {
    where.push(`kind IN (${kindList.map(() => '?').join(',')})`)
    args.push(...kindList)
  }

  if (q) {
    where.push('(filename LIKE ? OR path LIKE ? OR original_path LIKE ?)')
    const like = `%${q}%`
    args.push(like, like, like)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const rows = database.prepare(`
    SELECT * FROM artifacts
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...args, lim)

  appLogger?.info?.('[ArtifactRegistry] search', {
    sessionId: sid,
    chatId: cid,
    kinds: kindList.join(','),
    query: q.slice(0, 80),
    limit: lim,
    hit: rows.length
  })
  return rows
}

module.exports = {
  registerFileArtifact,
  registerBase64Artifact,
  registerReferenceArtifact,
  bindArtifactsToMessage,
  getArtifactById,
  listRecentArtifactsBySession,
  listArtifactsByMessage,
  searchArtifacts
}
