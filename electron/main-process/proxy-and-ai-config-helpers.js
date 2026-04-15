/**
 * 从 openultron.json 应用系统代理到 process.env；合并 legacy AI 配置片段（contextCompression / toolDefinitions）
 */
const { execFileSync } = require('child_process')

const PROXY_ENV_KEYS = ['http_proxy', 'https_proxy', 'all_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'no_proxy', 'NO_PROXY']
let cachedSystemProxyEnv = null
let cachedSystemProxyEnvAt = 0
const SYSTEM_PROXY_ENV_TTL = 15 * 1000

/** 合并 openultron.json 中的 ai.contextCompression 与代码默认 */
function mergeContextCompressionFromLegacy(legacy) {
  const { DEFAULT_CONFIG } = require('../ai/context-compressor')
  const raw = legacy && legacy.raw && legacy.raw.contextCompression
  return { ...DEFAULT_CONFIG, ...(raw && typeof raw === 'object' ? raw : {}) }
}

/** 合并 ai.toolDefinitions（发给 LLM 前是否裁剪工具描述/schema） */
function mergeToolDefinitionsFromLegacy(legacy) {
  const defaults = {
    slimMode: 'always',
    maxDescriptionChars: 240,
    stripSchemaExamples: true,
    maxPropertyDescriptionChars: 60
  }
  const raw = legacy && legacy.raw && legacy.raw.toolDefinitions
  return raw && typeof raw === 'object' ? { ...defaults, ...raw } : defaults
}

function clearProxyEnv(targetEnv = process.env) {
  for (const key of PROXY_ENV_KEYS) delete targetEnv[key]
}

function parseScutilProxyOutput(rawOutput = '') {
  const values = {}
  rawOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^([A-Za-z0-9]+)\s*:\s*(.+)$/)
      if (!match) return
      values[match[1]] = match[2]
    })
  return values
}

function buildProxyUrl({ scheme = 'http', host = '', port = '', username = '', password = '' } = {}) {
  if (!host || !port) return ''
  const auth = username
    ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@`
    : ''
  return `${scheme}://${auth}${host}:${port}`
}

function normalizeQuotedValue(value = '') {
  return String(value || '').trim().replace(/^'+|'+$/g, '').replace(/^"+|"+$/g, '')
}

function normalizeNoProxyList(values = []) {
  const out = []
  for (const raw of values) {
    const value = String(raw || '').trim()
    if (!value) continue
    if (value === '<local>') {
      out.push('localhost', '127.0.0.1')
      continue
    }
    out.push(value)
  }
  return [...new Set(out)].join(',')
}

function getMacSystemProxyEnv() {
  if (process.platform !== 'darwin') return {}

  const now = Date.now()
  if (cachedSystemProxyEnv && (now - cachedSystemProxyEnvAt) < SYSTEM_PROXY_ENV_TTL) {
    return { ...cachedSystemProxyEnv }
  }

  try {
    const output = execFileSync('scutil', ['--proxy'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const proxyConfig = parseScutilProxyOutput(output)
    const env = {}

    const httpProxy = Number(proxyConfig.HTTPEnable) === 1
      ? buildProxyUrl({
        scheme: 'http',
        host: proxyConfig.HTTPProxy,
        port: proxyConfig.HTTPPort,
        username: proxyConfig.HTTPUser,
        password: proxyConfig.HTTPPassword
      })
      : ''

    const httpsProxy = Number(proxyConfig.HTTPSEnable) === 1
      ? buildProxyUrl({
        scheme: 'http',
        host: proxyConfig.HTTPSProxy,
        port: proxyConfig.HTTPSPort,
        username: proxyConfig.HTTPSUser,
        password: proxyConfig.HTTPSPassword
      })
      : ''

    const socksProxy = Number(proxyConfig.SOCKSEnable) === 1
      ? buildProxyUrl({
        scheme: 'socks5',
        host: proxyConfig.SOCKSProxy,
        port: proxyConfig.SOCKSPort
      })
      : ''

    const noProxy = typeof proxyConfig.ExceptionsList === 'string'
      ? proxyConfig.ExceptionsList.replace(/[()"]/g, '').split(/\s*,\s*|\s+/).filter(Boolean).join(',')
      : ''

    if (httpProxy) {
      env.http_proxy = httpProxy
      env.HTTP_PROXY = httpProxy
    }
    if (httpsProxy || httpProxy) {
      const resolvedHttpsProxy = httpsProxy || httpProxy
      env.https_proxy = resolvedHttpsProxy
      env.HTTPS_PROXY = resolvedHttpsProxy
    }
    if (socksProxy) {
      env.all_proxy = socksProxy
      env.ALL_PROXY = socksProxy
    }
    if (noProxy) {
      env.no_proxy = noProxy
      env.NO_PROXY = noProxy
    }

    cachedSystemProxyEnv = env
    cachedSystemProxyEnvAt = now
    return { ...env }
  } catch {
    cachedSystemProxyEnv = {}
    cachedSystemProxyEnvAt = now
    return {}
  }
}

function parseWindowsProxyServer(rawValue = '') {
  const text = String(rawValue || '').trim()
  if (!text) return {}

  const assignments = text.includes('=')
    ? text.split(';').map((item) => item.trim()).filter(Boolean)
    : [`http=${text}`, `https=${text}`]

  let httpProxy = ''
  let httpsProxy = ''
  let allProxy = ''

  for (const item of assignments) {
    const [rawKey, rawTarget] = item.includes('=') ? item.split('=') : ['http', item]
    const key = String(rawKey || '').trim().toLowerCase()
    const target = String(rawTarget || '').trim()
    if (!target) continue

    const buildPlainProxy = (scheme) => {
      try {
        const parsed = new URL(target)
        return buildProxyUrl({
          scheme,
          host: parsed.hostname,
          port: parsed.port || (scheme === 'http' ? '80' : ''),
          username: decodeURIComponent(parsed.username || ''),
          password: decodeURIComponent(parsed.password || '')
        })
      } catch {
        const [host, port] = target.split(':')
        return buildProxyUrl({ scheme, host, port })
      }
    }

    if (key === 'http') httpProxy = buildPlainProxy('http')
    else if (key === 'https') httpsProxy = buildPlainProxy('http')
    else if (key === 'socks') allProxy = buildPlainProxy('socks5')
  }

  return { httpProxy, httpsProxy, allProxy }
}

function parseWindowsRegProxyOutput(rawOutput = '') {
  const values = {}
  String(rawOutput || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^([A-Za-z0-9_]+)\s+REG_[A-Z0-9_]+\s+(.+)$/)
      if (!match) return
      values[match[1]] = String(match[2] || '').trim()
    })

  if (Number(values.ProxyEnable) !== 1) return {}

  const { httpProxy, httpsProxy, allProxy } = parseWindowsProxyServer(values.ProxyServer)
  const noProxy = normalizeNoProxyList(String(values.ProxyOverride || '').split(';'))
  const env = {}
  if (httpProxy) env.http_proxy = env.HTTP_PROXY = httpProxy
  if (httpsProxy || httpProxy) {
    const resolved = httpsProxy || httpProxy
    env.https_proxy = env.HTTPS_PROXY = resolved
  }
  if (allProxy) env.all_proxy = env.ALL_PROXY = allProxy
  if (noProxy) env.no_proxy = env.NO_PROXY = noProxy
  return env
}

function parseLinuxGsettingsProxy(raw = {}) {
  const mode = normalizeQuotedValue(raw.mode)
  if (mode !== 'manual') return {}

  const httpHost = normalizeQuotedValue(raw.httpHost)
  const httpPort = normalizeQuotedValue(raw.httpPort)
  const httpsHost = normalizeQuotedValue(raw.httpsHost)
  const httpsPort = normalizeQuotedValue(raw.httpsPort)
  const socksHost = normalizeQuotedValue(raw.socksHost)
  const socksPort = normalizeQuotedValue(raw.socksPort)
  const ignoreHostsRaw = normalizeQuotedValue(raw.ignoreHosts)
  const ignoreHosts = ignoreHostsRaw
    ? ignoreHostsRaw.replace(/^\[|\]$/g, '').split(',').map((item) => normalizeQuotedValue(item)).filter(Boolean)
    : []

  const env = {}
  if (httpHost && httpPort) {
    const proxy = buildProxyUrl({ scheme: 'http', host: httpHost, port: httpPort })
    env.http_proxy = env.HTTP_PROXY = proxy
  }
  if (httpsHost && httpsPort) {
    const proxy = buildProxyUrl({ scheme: 'http', host: httpsHost, port: httpsPort })
    env.https_proxy = env.HTTPS_PROXY = proxy
  } else if (env.http_proxy) {
    env.https_proxy = env.HTTPS_PROXY = env.http_proxy
  }
  if (socksHost && socksPort) {
    const proxy = buildProxyUrl({ scheme: 'socks5', host: socksHost, port: socksPort })
    env.all_proxy = env.ALL_PROXY = proxy
  }
  const noProxy = normalizeNoProxyList(ignoreHosts)
  if (noProxy) env.no_proxy = env.NO_PROXY = noProxy
  return env
}

function getWindowsSystemProxyEnv() {
  if (process.platform !== 'win32') return {}
  const now = Date.now()
  if (cachedSystemProxyEnv && (now - cachedSystemProxyEnvAt) < SYSTEM_PROXY_ENV_TTL) {
    return { ...cachedSystemProxyEnv }
  }
  try {
    const output = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const env = parseWindowsRegProxyOutput(output)
    cachedSystemProxyEnv = env
    cachedSystemProxyEnvAt = now
    return { ...env }
  } catch {
    cachedSystemProxyEnv = {}
    cachedSystemProxyEnvAt = now
    return {}
  }
}

function getLinuxSystemProxyEnv() {
  if (process.platform !== 'linux') return {}
  const now = Date.now()
  if (cachedSystemProxyEnv && (now - cachedSystemProxyEnvAt) < SYSTEM_PROXY_ENV_TTL) {
    return { ...cachedSystemProxyEnv }
  }
  try {
    const execGsettings = (schema, key) => execFileSync('gsettings', ['get', schema, key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    const env = parseLinuxGsettingsProxy({
      mode: execGsettings('org.gnome.system.proxy', 'mode'),
      httpHost: execGsettings('org.gnome.system.proxy.http', 'host'),
      httpPort: execGsettings('org.gnome.system.proxy.http', 'port'),
      httpsHost: execGsettings('org.gnome.system.proxy.https', 'host'),
      httpsPort: execGsettings('org.gnome.system.proxy.https', 'port'),
      socksHost: execGsettings('org.gnome.system.proxy.socks', 'host'),
      socksPort: execGsettings('org.gnome.system.proxy.socks', 'port'),
      ignoreHosts: execGsettings('org.gnome.system.proxy', 'ignore-hosts')
    })
    cachedSystemProxyEnv = env
    cachedSystemProxyEnvAt = now
    return { ...env }
  } catch {
    cachedSystemProxyEnv = {}
    cachedSystemProxyEnvAt = now
    return {}
  }
}

function getSystemProxyEnv() {
  if (process.platform === 'darwin') return getMacSystemProxyEnv()
  if (process.platform === 'win32') return getWindowsSystemProxyEnv()
  if (process.platform === 'linux') return getLinuxSystemProxyEnv()
  return {}
}

function hasAnyProxyUrl(env = {}) {
  return Boolean(
    String(env.http_proxy || env.HTTP_PROXY || '').trim() ||
    String(env.https_proxy || env.HTTPS_PROXY || '').trim() ||
    String(env.all_proxy || env.ALL_PROXY || '').trim()
  )
}

function buildManualProxyEnv(cfg = {}) {
  const httpProxy = String(cfg.http_proxy || '').trim()
  const httpsProxy = String(cfg.https_proxy || httpProxy).trim()
  const allProxy = String(cfg.all_proxy || '').trim()
  const noProxy = String(cfg.no_proxy || '127.0.0.1,localhost').trim()
  return {
    http_proxy: httpProxy,
    https_proxy: httpsProxy,
    all_proxy: allProxy,
    HTTP_PROXY: httpProxy,
    HTTPS_PROXY: httpsProxy,
    ALL_PROXY: allProxy,
    no_proxy: noProxy,
    NO_PROXY: noProxy
  }
}

function resolveProxyRuntimeState({ proxyConfig = {}, systemProxyEnv = {} } = {}) {
  const manualEnabled = !!proxyConfig?.enabled
  if (manualEnabled) {
    const manualEnv = buildManualProxyEnv(proxyConfig)
    if (hasAnyProxyUrl(manualEnv)) {
      return {
        enabled: true,
        effective: true,
        source: 'manual',
        env: manualEnv
      }
    }
    return {
      enabled: true,
      effective: false,
      source: 'direct',
      reason: 'no_proxy_url',
      env: {}
    }
  }

  if (hasAnyProxyUrl(systemProxyEnv)) {
    return {
      enabled: false,
      effective: true,
      source: 'system',
      env: { ...systemProxyEnv }
    }
  }

  return {
    enabled: false,
    effective: false,
    source: 'direct',
    env: {}
  }
}

function applyProxyEnv(targetEnv, envValues) {
  clearProxyEnv(targetEnv)
  for (const key of PROXY_ENV_KEYS) {
    const value = String(envValues?.[key] || '').trim()
    if (value) targetEnv[key] = value
  }
}

function applyProxyEnvFromConfig(options = {}) {
  try {
    const getProxyConfig = typeof options.getProxyConfig === 'function'
      ? options.getProxyConfig
      : () => require('../openultron-config').getProxy()
    const getSystemProxyEnvFn = typeof options.getSystemProxyEnv === 'function'
      ? options.getSystemProxyEnv
      : getSystemProxyEnv
    const envTarget = options.envTarget || process.env

    const runtime = resolveProxyRuntimeState({
      proxyConfig: getProxyConfig() || {},
      systemProxyEnv: getSystemProxyEnvFn() || {}
    })

    applyProxyEnv(envTarget, runtime.env)
    return { ...runtime, ...runtime.env }
  } catch (e) {
    console.warn('[Proxy] 应用代理配置失败:', e.message)
    return { enabled: false, error: e.message }
  }
}

function buildSessionProxyConfig(runtime = {}) {
  if (runtime.source === 'manual') {
    const rules = []
    const httpProxy = String(runtime.env?.http_proxy || runtime.env?.HTTP_PROXY || '').trim()
    const httpsProxy = String(runtime.env?.https_proxy || runtime.env?.HTTPS_PROXY || '').trim()
    const allProxy = String(runtime.env?.all_proxy || runtime.env?.ALL_PROXY || '').trim()
    const noProxy = String(runtime.env?.no_proxy || runtime.env?.NO_PROXY || '').trim()

    if (httpProxy) rules.push(`http=${httpProxy}`)
    if (httpsProxy) rules.push(`https=${httpsProxy}`)
    if (allProxy) rules.push(`socks=${allProxy}`)

    return {
      mode: rules.length > 0 ? 'fixed_servers' : 'direct',
      proxyRules: rules.join(';'),
      ...(noProxy ? { proxyBypassRules: noProxy } : {})
    }
  }

  if (runtime.source === 'system') {
    return { mode: 'system' }
  }

  return { mode: 'direct' }
}

async function applySessionProxy(sessionLike, runtime = {}) {
  if (!sessionLike || typeof sessionLike.setProxy !== 'function') return buildSessionProxyConfig(runtime)
  const config = buildSessionProxyConfig(runtime)
  await sessionLike.setProxy(config)
  return config
}

async function applySessionProxyFromConfig(sessionLike, options = {}) {
  const getProxyConfig = typeof options.getProxyConfig === 'function'
    ? options.getProxyConfig
    : () => require('../openultron-config').getProxy()
  const getSystemProxyEnvFn = typeof options.getSystemProxyEnv === 'function'
    ? options.getSystemProxyEnv
    : getSystemProxyEnv
  const runtime = resolveProxyRuntimeState({
    proxyConfig: getProxyConfig() || {},
    systemProxyEnv: getSystemProxyEnvFn() || {}
  })
  const config = await applySessionProxy(sessionLike, runtime)
  return { ...runtime, session: config }
}

module.exports = {
  mergeContextCompressionFromLegacy,
  mergeToolDefinitionsFromLegacy,
  parseScutilProxyOutput,
  buildProxyUrl,
  parseWindowsRegProxyOutput,
  parseLinuxGsettingsProxy,
  getMacSystemProxyEnv,
  getWindowsSystemProxyEnv,
  getLinuxSystemProxyEnv,
  getSystemProxyEnv,
  resolveProxyRuntimeState,
  applyProxyEnvFromConfig,
  buildSessionProxyConfig,
  applySessionProxy,
  applySessionProxyFromConfig
}
