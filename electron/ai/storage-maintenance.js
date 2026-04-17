const openultronConfig = require('../openultron-config')
const { auditStorage } = require('./storage-cleaner')
const { logger: defaultLogger } = require('../app-logger')

let timer = null
let startupTimer = null
let running = false

function summarizeTopCandidates(candidates = [], limit = 5) {
  return (candidates || [])
    .slice(0, Math.max(0, Number(limit) || 0))
    .map((item) => ({
      category: item.category,
      path: item.relPath,
      action: item.action,
      bytes: item.bytes,
      reason: item.reason
    }))
}

function readConfig() {
  const storage = typeof openultronConfig.getStorage === 'function' ? openultronConfig.getStorage() : {}
  return {
    enabled: storage.enabled !== false,
    maxTotalBytes: Number(storage.maxTotalBytes || 0),
    maintenance: storage.maintenance && typeof storage.maintenance === 'object'
      ? storage.maintenance
      : {}
  }
}

async function runStorageMaintenance(reason = 'manual', appLogger = defaultLogger) {
  if (running) {
    return { success: true, skipped: true, reason: 'already_running' }
  }
  const cfg = readConfig()
  if (!cfg.enabled) {
    return { success: true, skipped: true, reason: 'storage_disabled' }
  }
  running = true
  try {
    const audit = auditStorage({ action: 'audit', limit: 200 })
    const top = summarizeTopCandidates(audit.candidates, cfg.maintenance.logTopCandidates || 5)
    const categorySizes = audit.categorySizes || {}
    const totalBytes = Object.values(categorySizes).reduce((sum, n) => sum + (Number(n) || 0), 0)
    const payload = {
      reason,
      totalBytes,
      maxTotalBytes: cfg.maxTotalBytes || 0,
      candidateCount: audit.totals?.candidateCount || 0,
      candidateBytes: audit.totals?.candidateBytes || 0,
      topCandidates: top
    }
    appLogger?.info?.('[StorageMaintenance] audit', payload)
    const warnBytes = Number(cfg.maintenance.warnCandidateBytes || 0)
    if ((payload.candidateBytes > 0 && warnBytes > 0 && payload.candidateBytes >= warnBytes) ||
        (payload.maxTotalBytes > 0 && payload.totalBytes > payload.maxTotalBytes)) {
      appLogger?.warn?.('[StorageMaintenance] storage pressure', payload)
    }

    let archive = null
    if (cfg.maintenance.autoArchive !== false) {
      archive = auditStorage({
        action: 'archive',
        categories: Array.isArray(cfg.maintenance.archiveCategories) ? cfg.maintenance.archiveCategories : ['conversations', 'memoryDiary'],
        limit: Number(cfg.maintenance.maxArchiveItemsPerRun || 50)
      })
      if ((archive.executed || []).length > 0) {
        appLogger?.info?.('[StorageMaintenance] archive', {
          reason,
          count: archive.executed.length,
          bytesFreed: archive.totals?.bytesFreed || 0,
          executed: archive.executed.slice(0, Math.max(1, Number(cfg.maintenance.logTopCandidates || 5)))
        })
      }
    }

    return { success: true, audit, archive }
  } catch (e) {
    appLogger?.warn?.('[StorageMaintenance] run failed', { reason, error: e.message || String(e) })
    return { success: false, message: e.message || String(e) }
  } finally {
    running = false
  }
}

function startStorageMaintenance(appLogger = defaultLogger) {
  const cfg = readConfig()
  if (!cfg.enabled) return
  if (startupTimer) clearTimeout(startupTimer)
  if (timer) clearInterval(timer)

  if (cfg.maintenance.startupAudit !== false) {
    startupTimer = setTimeout(() => {
      startupTimer = null
      runStorageMaintenance('startup', appLogger).catch(() => {})
    }, Math.max(0, Number(cfg.maintenance.startupDelayMs || 0)))
  }

  const intervalMinutes = Math.max(1, Number(cfg.maintenance.intervalMinutes || 360))
  timer = setInterval(() => {
    runStorageMaintenance('interval', appLogger).catch(() => {})
  }, intervalMinutes * 60 * 1000)
}

function stopStorageMaintenance() {
  if (startupTimer) {
    clearTimeout(startupTimer)
    startupTimer = null
  }
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

module.exports = {
  runStorageMaintenance,
  startStorageMaintenance,
  stopStorageMaintenance
}
