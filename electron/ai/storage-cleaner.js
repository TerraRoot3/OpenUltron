const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { DatabaseSync } = require('node:sqlite')
const { getAppRoot, getAppRootPath } = require('../app-root')
const { getStorageConfig, normalizeRelativePath, isProtectedRelative } = require('./storage-policy')

const ARTIFACT_DB_PATH = getAppRootPath('memory', 'artifacts.db')
const DEFAULT_CATEGORIES = ['runtimeCache', 'workspaceTemp', 'artifacts', 'screenshots', 'logs', 'webApps', 'conversations', 'memoryDiary']

function safeStat(absPath) {
  try { return fs.statSync(absPath) } catch { return null }
}

function listDirNames(absDir) {
  try { return fs.readdirSync(absDir) } catch { return [] }
}

function toRel(absPath) {
  return normalizeRelativePath(path.relative(getAppRoot(), absPath))
}

function getAgeDays(stat) {
  const ts = Number(stat?.mtimeMs || stat?.ctimeMs || 0)
  if (!ts) return 0
  return Math.max(0, (Date.now() - ts) / 86400000)
}

function getPathSize(absPath) {
  const st = safeStat(absPath)
  if (!st) return 0
  if (st.isFile()) return st.size
  if (!st.isDirectory()) return 0
  let total = 0
  for (const name of listDirNames(absPath)) {
    total += getPathSize(path.join(absPath, name))
  }
  return total
}

function getMemoryDiaryBytes() {
  const root = getAppRootPath('memory')
  if (!fs.existsSync(root)) return 0
  let total = 0
  for (const name of listDirNames(root)) {
    if (!/^\d{4}-\d{2}-\d{2}\.md(?:\.gz)?$/.test(name)) continue
    total += getPathSize(path.join(root, name))
  }
  return total
}

function buildArtifactRefMap() {
  const out = new Map()
  if (!fs.existsSync(ARTIFACT_DB_PATH)) return out
  let db
  try {
    db = new DatabaseSync(ARTIFACT_DB_PATH)
    const rows = db.prepare(`
      SELECT a.id, a.path, COUNT(ma.artifact_id) AS ref_count
      FROM artifacts a
      LEFT JOIN message_artifacts ma ON ma.artifact_id = a.id
      GROUP BY a.id, a.path
    `).all()
    for (const row of rows || []) {
      out.set(String(row.id || ''), {
        path: String(row.path || ''),
        refCount: Number(row.ref_count || 0)
      })
    }
  } catch (_) {
    return out
  } finally {
    try { db?.close() } catch (_) {}
  }
  return out
}

function dropArtifactRecord(artifactId) {
  if (!artifactId || !fs.existsSync(ARTIFACT_DB_PATH)) return
  let db
  try {
    db = new DatabaseSync(ARTIFACT_DB_PATH)
    db.prepare('DELETE FROM message_artifacts WHERE artifact_id = ?').run(String(artifactId))
    db.prepare('DELETE FROM artifacts WHERE id = ?').run(String(artifactId))
  } catch (_) {
  } finally {
    try { db?.close() } catch (_) {}
  }
}

function collectConversationText(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const name of listDirNames(dir)) {
    const fp = path.join(dir, name)
    const st = safeStat(fp)
    if (!st) continue
    if (st.isDirectory()) {
      collectConversationText(fp, out)
      continue
    }
    if (!st.isFile() || (!name.endsWith('.json') && !name.endsWith('.json.gz'))) continue
    try {
      const raw = name.endsWith('.json.gz')
        ? zlib.gunzipSync(fs.readFileSync(fp)).toString('utf-8')
        : fs.readFileSync(fp, 'utf-8')
      out.push(raw)
    } catch (_) {}
  }
  return out
}

function buildScreenshotRefSet() {
  const refs = new Set()
  const texts = collectConversationText(getAppRootPath('conversations'))
  const re = /screenshots[\\/]+([A-Za-z0-9._-]+)/g
  for (const text of texts) {
    let m
    while ((m = re.exec(text))) {
      if (m[1]) refs.add(String(m[1]))
    }
  }
  return refs
}

function pushCandidate(list, item, limit) {
  if (!item) return
  if (limit > 0 && list.length >= limit) return
  list.push(item)
}

function collectTempChildren(rootRel, category, ttlDays, list, limit) {
  const absRoot = getAppRootPath(...rootRel.split('/'))
  if (!fs.existsSync(absRoot)) return
  for (const name of listDirNames(absRoot)) {
    const abs = path.join(absRoot, name)
    const st = safeStat(abs)
    if (!st) continue
    const rel = toRel(abs)
    if (isProtectedRelative(rel)) continue
    const ageDays = getAgeDays(st)
    if (ageDays < ttlDays) continue
    pushCandidate(list, {
      category,
      relPath: rel,
      absPath: abs,
      action: st.isDirectory() ? 'delete_dir' : 'delete_file',
      executable: true,
      bytes: getPathSize(abs),
      ageDays,
      reason: `超过 ${ttlDays} 天未更新的临时目录`
    }, limit)
  }
}

function collectChromeProfile(list, limit) {
  const abs = getAppRootPath('chrome-devtools-profile')
  const st = safeStat(abs)
  if (!st) return
  const hasLock = listDirNames(abs).some((name) => name.startsWith('Singleton'))
  pushCandidate(list, {
    category: 'runtimeCache',
    relPath: toRel(abs),
    absPath: abs,
    action: 'review_cache_dir',
    executable: false,
    bytes: getPathSize(abs),
    ageDays: getAgeDays(st),
    reason: hasLock ? 'Chrome DevTools profile 可能仍在使用中' : 'Chrome DevTools profile 可重建，建议按需清理'
  }, limit)
}

function collectArtifactsCandidates(cfg, refMap, list, limit) {
  if (cfg?.categories?.artifacts?.deleteUnreferenced === false) return
  const ttlDays = Number(cfg?.categories?.artifacts?.ttlDays || 30)
  const root = getAppRootPath('artifacts', 'store')
  const walk = (dir) => {
    const st = safeStat(dir)
    if (!st || !st.isDirectory()) return
    for (const name of listDirNames(dir)) {
      const abs = path.join(dir, name)
      const child = safeStat(abs)
      if (!child) continue
      if (child.isDirectory()) {
        walk(abs)
        if (limit > 0 && list.length >= limit) return
        continue
      }
      const rel = toRel(abs)
      if (isProtectedRelative(rel)) continue
      const ageDays = getAgeDays(child)
      if (ageDays < ttlDays) continue
      const artifactId = path.basename(name, path.extname(name))
      const ref = refMap.get(artifactId)
      const refCount = Number(ref?.refCount || 0)
      if (refCount > 0) continue
      pushCandidate(list, {
        category: 'artifacts',
        relPath: rel,
        absPath: abs,
        action: 'delete_artifact_file',
        executable: true,
        bytes: child.size,
        ageDays,
        artifactId,
        reason: `未绑定消息且超过 ${ttlDays} 天`
      }, limit)
      if (limit > 0 && list.length >= limit) return
    }
  }
  walk(root)
}

function collectScreenshotsCandidates(cfg, refSet, list, limit) {
  if (cfg?.categories?.screenshots?.deleteUnreferenced === false) return
  const ttlDays = Number(cfg?.categories?.screenshots?.ttlDays || 14)
  const root = getAppRootPath('screenshots')
  if (!fs.existsSync(root)) return
  for (const name of listDirNames(root)) {
    const abs = path.join(root, name)
    const st = safeStat(abs)
    if (!st || !st.isFile()) continue
    const rel = toRel(abs)
    if (isProtectedRelative(rel)) continue
    const ageDays = getAgeDays(st)
    if (ageDays < ttlDays) continue
    if (refSet.has(name)) continue
    pushCandidate(list, {
      category: 'screenshots',
      relPath: rel,
      absPath: abs,
      action: 'delete_screenshot',
      executable: true,
      bytes: st.size,
      ageDays,
      reason: `未在会话中发现引用且超过 ${ttlDays} 天`
    }, limit)
  }
}

function collectLogCandidate(cfg, list, limit) {
  const maxBytes = Number(cfg?.categories?.logs?.maxBytes || 0)
  const abs = getAppRootPath('logs', 'app.log')
  const st = safeStat(abs)
  if (!st || !st.isFile() || maxBytes <= 0 || st.size <= maxBytes) return
  pushCandidate(list, {
    category: 'logs',
    relPath: toRel(abs),
    absPath: abs,
    action: 'trim_log_tail',
    executable: true,
    bytes: st.size,
    ageDays: getAgeDays(st),
    targetBytes: maxBytes,
    reason: `日志超过上限 ${maxBytes} bytes`
  }, limit)
}

function collectWebAppsCandidates(cfg, list, limit) {
  const keep = Number(cfg?.categories?.webApps?.keepVersionsPerApp || 3)
  const ttlDays = Number(cfg?.categories?.webApps?.deleteUnusedDays || 45)
  const root = getAppRootPath('web-apps')
  if (!fs.existsSync(root)) return
  for (const appId of listDirNames(root)) {
    const appDir = path.join(root, appId)
    const st = safeStat(appDir)
    if (!st || !st.isDirectory()) continue
    const versions = listDirNames(appDir)
      .map((name) => {
        const abs = path.join(appDir, name)
        const vst = safeStat(abs)
        return vst && vst.isDirectory() ? { name, abs, st: vst } : null
      })
      .filter(Boolean)
      .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs)
    for (let i = keep; i < versions.length; i++) {
      const item = versions[i]
      const ageDays = getAgeDays(item.st)
      if (ageDays < ttlDays) continue
      pushCandidate(list, {
        category: 'webApps',
        relPath: toRel(item.abs),
        absPath: item.abs,
        action: 'review_old_webapp_version',
        executable: false,
        bytes: getPathSize(item.abs),
        ageDays,
        reason: `超出每应用保留 ${keep} 个版本的上限`
      }, limit)
    }
  }
}

function collectConversationArchiveCandidates(cfg, list, limit) {
  const archiveAfterDays = Number(cfg?.categories?.conversations?.archiveAfterDays || 60)
  const root = getAppRootPath('conversations')
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const name of listDirNames(dir)) {
      const abs = path.join(dir, name)
      const st = safeStat(abs)
      if (!st) continue
      if (st.isDirectory()) {
        walk(abs)
        if (limit > 0 && list.length >= limit) return
        continue
      }
      if (!st.isFile() || !name.endsWith('.json') || name === 'index.json') continue
      if (fs.existsSync(`${abs}.gz`)) continue
      const rel = toRel(abs)
      if (isProtectedRelative(rel)) continue
      const ageDays = getAgeDays(st)
      if (ageDays < archiveAfterDays) continue
      pushCandidate(list, {
        category: 'conversations',
        relPath: rel,
        absPath: abs,
        action: 'archive_conversation_file',
        executable: true,
        bytes: st.size,
        ageDays,
        reason: `超过 ${archiveAfterDays} 天未更新的会话文件，建议压缩归档`
      }, limit)
    }
  }
  walk(root)
}

function collectMemoryDiaryArchiveCandidates(cfg, list, limit) {
  const archiveAfterDays = Number(cfg?.categories?.memoryDiary?.archiveAfterDays || 30)
  const root = getAppRootPath('memory')
  if (!fs.existsSync(root)) return
  for (const name of listDirNames(root)) {
    if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue
    const abs = path.join(root, name)
    const st = safeStat(abs)
    if (!st || !st.isFile()) continue
    if (fs.existsSync(`${abs}.gz`)) continue
    const rel = toRel(abs)
    if (isProtectedRelative(rel)) continue
    const ageDays = getAgeDays(st)
    if (ageDays < archiveAfterDays) continue
    pushCandidate(list, {
      category: 'memoryDiary',
      relPath: rel,
      absPath: abs,
      action: 'archive_memory_diary',
      executable: true,
      bytes: st.size,
      ageDays,
      reason: `超过 ${archiveAfterDays} 天的对话日记，建议压缩归档`
    }, limit)
  }
}

function buildCategorySummary() {
  const out = {
    runtimeCache: 0,
    workspaceTemp: 0,
    artifacts: 0,
    screenshots: 0,
    logs: 0,
    webApps: 0,
    conversations: 0,
    memoryDiary: 0
  }
  const runtimeParts = [getAppRootPath('chrome-devtools-profile'), getAppRootPath('temp')]
  out.runtimeCache = runtimeParts.reduce((sum, abs) => sum + (fs.existsSync(abs) ? getPathSize(abs) : 0), 0)
  out.workspaceTemp = fs.existsSync(getAppRootPath('workspace', 'temp')) ? getPathSize(getAppRootPath('workspace', 'temp')) : 0
  out.artifacts = fs.existsSync(getAppRootPath('artifacts', 'store')) ? getPathSize(getAppRootPath('artifacts', 'store')) : 0
  out.screenshots = fs.existsSync(getAppRootPath('screenshots')) ? getPathSize(getAppRootPath('screenshots')) : 0
  out.logs = fs.existsSync(getAppRootPath('logs')) ? getPathSize(getAppRootPath('logs')) : 0
  out.webApps = fs.existsSync(getAppRootPath('web-apps')) ? getPathSize(getAppRootPath('web-apps')) : 0
  out.conversations = fs.existsSync(getAppRootPath('conversations')) ? getPathSize(getAppRootPath('conversations')) : 0
  out.memoryDiary = getMemoryDiaryBytes()
  return out
}

function trimFileTail(absPath, maxBytes) {
  const st = safeStat(absPath)
  if (!st || !st.isFile() || st.size <= maxBytes) return 0
  const fd = fs.openSync(absPath, 'r')
  let buf
  try {
    buf = Buffer.alloc(maxBytes)
    fs.readSync(fd, buf, 0, maxBytes, st.size - maxBytes)
  } finally {
    fs.closeSync(fd)
  }
  fs.writeFileSync(absPath, buf)
  return st.size - maxBytes
}

function executeCandidate(item) {
  if (!item?.executable || !item.absPath) return { ok: false, bytesFreed: 0 }
  try {
    if (item.action === 'delete_dir') {
      const bytes = getPathSize(item.absPath)
      fs.rmSync(item.absPath, { recursive: true, force: true })
      return { ok: true, bytesFreed: bytes }
    }
    if (item.action === 'delete_file' || item.action === 'delete_screenshot') {
      const bytes = getPathSize(item.absPath)
      fs.rmSync(item.absPath, { force: true })
      return { ok: true, bytesFreed: bytes }
    }
    if (item.action === 'delete_artifact_file') {
      const bytes = getPathSize(item.absPath)
      fs.rmSync(item.absPath, { force: true })
      if (item.artifactId) dropArtifactRecord(item.artifactId)
      return { ok: true, bytesFreed: bytes }
    }
    if (item.action === 'trim_log_tail') {
      return { ok: true, bytesFreed: trimFileTail(item.absPath, Number(item.targetBytes || 0)) }
    }
    if (item.action === 'archive_conversation_file' || item.action === 'archive_memory_diary') {
      const bytes = getPathSize(item.absPath)
      const gzPath = `${item.absPath}.gz`
      const raw = fs.readFileSync(item.absPath)
      fs.writeFileSync(gzPath, zlib.gzipSync(raw))
      fs.rmSync(item.absPath, { force: true })
      return { ok: true, bytesFreed: Math.max(0, bytes - getPathSize(gzPath)) }
    }
  } catch (_) {
    return { ok: false, bytesFreed: 0 }
  }
  return { ok: false, bytesFreed: 0 }
}

function canExecuteCandidateForMode(cfg, mode, item) {
  if (mode !== 'cleanup') return true
  const category = String(item?.category || '')
  if (!category) return true
  const categoryCfg = cfg?.categories?.[category]
  if (!categoryCfg || typeof categoryCfg !== 'object') return true
  return categoryCfg.autoDelete !== false
}

function auditStorage(options = {}) {
  const cfg = getStorageConfig()
  if (cfg.enabled === false) {
    return { success: true, mode: 'disabled', candidates: [], totals: { candidateBytes: 0, bytesFreed: 0 }, policy: cfg }
  }
  const actionRaw = String(options.action || 'audit').trim()
  const action = actionRaw === 'cleanup' || actionRaw === 'archive' ? actionRaw : 'audit'
  const requested = Array.isArray(options.categories) && options.categories.length > 0
    ? options.categories.map((x) => String(x || '').trim()).filter(Boolean)
    : DEFAULT_CATEGORIES
  const categories = requested.filter((name, idx) => DEFAULT_CATEGORIES.includes(name) && requested.indexOf(name) === idx)
  const limit = Math.max(1, Math.min(Number(options.limit) || 100, 500))
  const candidates = []
  const artifactRefMap = categories.includes('artifacts') ? buildArtifactRefMap() : new Map()
  const screenshotRefSet = categories.includes('screenshots') ? buildScreenshotRefSet() : new Set()

  if (categories.includes('runtimeCache')) {
    collectTempChildren('temp', 'runtimeCache', Number(cfg.categories?.runtimeCache?.ttlDays || 7), candidates, limit)
    collectChromeProfile(candidates, limit)
  }
  if (categories.includes('workspaceTemp')) {
    collectTempChildren('workspace/temp', 'workspaceTemp', Number(cfg.categories?.workspaceTemp?.ttlDays || 3), candidates, limit)
  }
  if (categories.includes('artifacts')) collectArtifactsCandidates(cfg, artifactRefMap, candidates, limit)
  if (categories.includes('screenshots')) collectScreenshotsCandidates(cfg, screenshotRefSet, candidates, limit)
  if (categories.includes('logs')) collectLogCandidate(cfg, candidates, limit)
  if (categories.includes('webApps')) collectWebAppsCandidates(cfg, candidates, limit)
  if (categories.includes('conversations')) collectConversationArchiveCandidates(cfg, candidates, limit)
  if (categories.includes('memoryDiary')) collectMemoryDiaryArchiveCandidates(cfg, candidates, limit)

  let bytesFreed = 0
  const executed = []
  if (action === 'cleanup' || action === 'archive') {
    for (const item of candidates) {
      if (!item.executable) continue
      const isArchiveAction = String(item.action || '').startsWith('archive_')
      if (action === 'cleanup' && isArchiveAction) continue
      if (action === 'archive' && !isArchiveAction) continue
      if (!canExecuteCandidateForMode(cfg, action, item)) continue
      const res = executeCandidate(item)
      if (res.ok) {
        bytesFreed += res.bytesFreed
        executed.push({ relPath: item.relPath, action: item.action, bytesFreed: res.bytesFreed })
      }
    }
  }

  return {
    success: true,
    mode: action,
    policy: cfg,
    categorySizes: buildCategorySummary(),
    totals: {
      candidateCount: candidates.length,
      candidateBytes: candidates.reduce((sum, item) => sum + Number(item.bytes || 0), 0),
      bytesFreed
    },
    executed,
    candidates
  }
}

module.exports = {
  auditStorage
}
