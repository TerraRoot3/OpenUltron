const https = require('https')
const feishuNotify = require('./feishu-notify')
const openultronConfig = require('../openultron-config')

function requestJson({ method = 'GET', path, body, token }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf-8')
    const req = https.request({
      host: 'open.feishu.cn',
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
        ...(payload ? { 'Content-Length': payload.length } : {})
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
    if (payload) req.write(payload)
    req.end()
  })
}

async function withTenantToken() {
  return await feishuNotify.getTenantAccessToken()
}

async function withFeishuToken(options = {}) {
  const preferUser = options && options.preferUser === true
  const allowTenantFallback = !(options && options.allowTenantFallback === false)
  if (preferUser) {
    const userToken = await feishuNotify.getValidUserAccessToken()
    if (userToken) {
      return { token: userToken, tokenType: 'user', source: 'config:user_access_token' }
    }
    if (!allowTenantFallback) {
      const err = new Error('未配置 feishu.user_access_token 或已过期且无 refresh_token，请到设置页重新发起飞书用户授权')
      err.code = 'FEISHU_USER_TOKEN_MISSING'
      throw err
    }
    // user token 不可用时默认使用应用身份（tenant_access_token）
  }
  const tenantToken = await withTenantToken()
  return { token: tenantToken, tokenType: 'tenant', source: 'tenant_access_token' }
}

module.exports = {
  requestJson,
  withTenantToken,
  withFeishuToken
}
