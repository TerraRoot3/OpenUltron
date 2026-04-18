/**
 * 从 Codex CLI 写入的 ~/.codex/auth.json 提取可供 OpenAI 兼容 API 使用的凭证。
 * Codex 各版本字段可能不同，此处做多路径兼容。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

function trimStr(v) {
  return String(v == null ? '' : v).trim()
}

/**
 * @param {unknown} parsed
 * @returns {{ credential: string, credentialType: 'openai_api_key' | 'chatgpt_access_token' | '' }}
 */
function extractCredentialFromCodexAuthJson(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { credential: '', credentialType: '' }
  }

  const apiKey = trimStr(
    parsed.OPENAI_API_KEY ?? parsed.openai_api_key ?? parsed.openaiApiKey
  )
  if (apiKey) {
    return { credential: apiKey, credentialType: 'openai_api_key' }
  }

  const genericKey = trimStr(parsed.api_key ?? parsed.apiKey)
  if (genericKey && /^sk-/i.test(genericKey)) {
    return { credential: genericKey, credentialType: 'openai_api_key' }
  }

  const tokens = parsed.tokens && typeof parsed.tokens === 'object' ? parsed.tokens : {}
  const accessFromTokens = trimStr(tokens.access_token ?? tokens.accessToken)
  if (accessFromTokens) {
    return { credential: accessFromTokens, credentialType: 'chatgpt_access_token' }
  }

  const session = parsed.session && typeof parsed.session === 'object' ? parsed.session : {}
  const accessFromSession = trimStr(session.access_token ?? session.accessToken)
  if (accessFromSession) {
    return { credential: accessFromSession, credentialType: 'chatgpt_access_token' }
  }

  const credentials =
    parsed.credentials && typeof parsed.credentials === 'object' ? parsed.credentials : {}
  const accessFromCreds = trimStr(credentials.access_token ?? credentials.accessToken)
  if (accessFromCreds) {
    return { credential: accessFromCreds, credentialType: 'chatgpt_access_token' }
  }

  const topAccess = trimStr(parsed.access_token ?? parsed.accessToken)
  if (topAccess) {
    return { credential: topAccess, credentialType: 'chatgpt_access_token' }
  }

  return { credential: '', credentialType: '' }
}

/**
 * @param {unknown} parsed
 * @returns {string}
 */
function extractCodexAccountId(parsed) {
  if (!parsed || typeof parsed !== 'object') return ''
  const tokens = parsed.tokens && typeof parsed.tokens === 'object' ? parsed.tokens : {}
  return trimStr(tokens.account_id ?? tokens.accountId)
}

function getCodexAuthPath() {
  return path.join(os.homedir(), '.codex', 'auth.json')
}

function readCodexAuthCredential() {
  const authPath = getCodexAuthPath()
  if (!fs.existsSync(authPath)) {
    return {
      success: false,
      error: 'not_found',
      authPath
    }
  }
  let stat = null
  let parsed = null
  try {
    stat = fs.statSync(authPath)
    parsed = JSON.parse(fs.readFileSync(authPath, 'utf-8'))
  } catch (error) {
    return {
      success: false,
      error: 'parse_failed',
      authPath,
      message: error?.message || String(error)
    }
  }
  const { credential, credentialType } = extractCredentialFromCodexAuthJson(parsed)
  if (!credential) {
    return {
      success: false,
      error: 'credential_missing',
      authPath,
      authMode: trimStr(parsed?.auth_mode),
      accountId: extractCodexAccountId(parsed),
      mtimeMs: Number(stat?.mtimeMs || 0) || 0
    }
  }
  return {
    success: true,
    authPath,
    credential,
    credentialType,
    authMode: trimStr(parsed?.auth_mode),
    accountId: extractCodexAccountId(parsed),
    mtimeMs: Number(stat?.mtimeMs || 0) || 0
  }
}

function isCodexLocalAuthProvider(provider) {
  if (trimStr(provider?.apiKeySource) === 'codex-local-auth') return true
  const baseUrl = trimStr(provider?.baseUrl)
  const apiKey = trimStr(provider?.apiKey)
  const wireMode = trimStr(provider?.openAiWireMode)
  return /api\.openai\.com/i.test(baseUrl) &&
    !!apiKey &&
    !/^sk-/i.test(apiKey) &&
    (wireMode === '' || wireMode === 'auto' || wireMode === 'codex')
}

function resolveProviderApiKey(provider, providerKeys, baseUrlOverride = '') {
  const baseUrl = trimStr(baseUrlOverride || provider?.baseUrl)
  const savedKey = trimStr((providerKeys && baseUrl ? providerKeys[baseUrl] : '') || provider?.apiKey)
  if (!isCodexLocalAuthProvider(provider)) {
    return {
      apiKey: savedKey,
      source: 'saved',
      changed: false
    }
  }
  const loaded = readCodexAuthCredential()
  if (!loaded.success || !loaded.credential) {
    return {
      apiKey: savedKey,
      source: 'saved',
      changed: false,
      codexAuth: loaded
    }
  }
  const savedAccountId = trimStr(provider?.apiKeySourceMeta?.accountId)
  const changed = loaded.credential !== savedKey ||
    (!!savedAccountId && !!loaded.accountId && savedAccountId !== loaded.accountId)
  return {
    apiKey: trimStr(loaded.credential),
    source: 'codex-local-auth',
    changed,
    credentialType: loaded.credentialType,
    accountId: loaded.accountId,
    authMode: loaded.authMode,
    authPath: loaded.authPath,
    codexAuth: loaded
  }
}

module.exports = {
  extractCredentialFromCodexAuthJson,
  extractCodexAccountId,
  getCodexAuthPath,
  readCodexAuthCredential,
  isCodexLocalAuthProvider,
  resolveProviderApiKey
}
