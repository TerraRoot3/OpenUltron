const https = require('https')
const feishuNotify = require('./feishu-notify')

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

module.exports = {
  requestJson,
  withTenantToken
}

