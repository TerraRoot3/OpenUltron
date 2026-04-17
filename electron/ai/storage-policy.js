const path = require('path')
const openultronConfig = require('../openultron-config')

const CATEGORY_ROOTS = {
  runtimeCache: ['chrome-devtools-profile', 'temp'],
  workspaceTemp: ['workspace/temp'],
  artifacts: ['artifacts/store'],
  screenshots: ['screenshots'],
  logs: ['logs'],
  webApps: ['web-apps'],
  conversations: ['conversations'],
  memoryDiary: ['memory']
}

function normalizeRelativePath(relPath = '') {
  const raw = String(relPath || '').trim().replace(/\\/g, '/')
  if (!raw) return ''
  const normalized = path.posix.normalize(raw).replace(/^\.\/+/, '').replace(/^\/+/, '').replace(/\/$/, '')
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return ''
  return normalized
}

function getStorageConfig() {
  if (typeof openultronConfig.getStorage === 'function') return openultronConfig.getStorage()
  const all = openultronConfig.readAll ? openultronConfig.readAll() : {}
  return all.storage || {}
}

function getCategoryRoots(category) {
  return Array.isArray(CATEGORY_ROOTS[category]) ? [...CATEGORY_ROOTS[category]] : []
}

function isProtectedRelative(relPath, cfg = getStorageConfig()) {
  const rel = normalizeRelativePath(relPath)
  const protectedPaths = Array.isArray(cfg?.protectedPaths) ? cfg.protectedPaths : []
  const pinnedPaths = Array.isArray(cfg?.pinnedPaths) ? cfg.pinnedPaths : []
  return [...protectedPaths, ...pinnedPaths].some((item) => {
    const p = normalizeRelativePath(item)
    return !!p && (rel === p || rel.startsWith(`${p}/`))
  })
}

function getPinnedPaths(cfg = getStorageConfig()) {
  return Array.isArray(cfg?.pinnedPaths)
    ? [...new Set(cfg.pinnedPaths.map((x) => normalizeRelativePath(x)).filter(Boolean))]
    : []
}

function isPinnedRelative(relPath, cfg = getStorageConfig()) {
  const rel = normalizeRelativePath(relPath)
  return getPinnedPaths(cfg).some((p) => rel === p || rel.startsWith(`${p}/`))
}

function getBackupExcludedRoots(cfg = getStorageConfig()) {
  const out = []
  const cats = cfg?.categories && typeof cfg.categories === 'object' ? cfg.categories : {}
  for (const [category, roots] of Object.entries(CATEGORY_ROOTS)) {
    const item = cats[category] && typeof cats[category] === 'object' ? cats[category] : {}
    if (item.backup === false) out.push(...roots.map((r) => normalizeRelativePath(r)))
  }
  return [...new Set(out.filter(Boolean))]
}

function shouldExcludeFromBackup(relPath, cfg = getStorageConfig()) {
  const rel = normalizeRelativePath(relPath)
  const excludedRoots = getBackupExcludedRoots(cfg)
  return excludedRoots.some((root) => rel === root || rel.startsWith(`${root}/`))
}

module.exports = {
  CATEGORY_ROOTS,
  normalizeRelativePath,
  getStorageConfig,
  getCategoryRoots,
  isProtectedRelative,
  getPinnedPaths,
  isPinnedRelative,
  getBackupExcludedRoots,
  shouldExcludeFromBackup
}
