'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')

const host = '127.0.0.1'
const port = Number(process.env.PORT || 3000)
const root = __dirname

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

function sendFile(res, fp) {
  const ext = path.extname(fp).toLowerCase()
  const contentType = (
    ext === '.html' ? 'text/html; charset=utf-8'
      : ext === '.js' ? 'application/javascript; charset=utf-8'
        : ext === '.css' ? 'text/css; charset=utf-8'
          : ext === '.json' ? 'application/json; charset=utf-8'
            : 'application/octet-stream'
  )
  res.writeHead(200, { 'Content-Type': contentType })
  fs.createReadStream(fp).pipe(res)
}

const server = http.createServer((req, res) => {
  const reqUrl = String(req.url || '/')
  if (reqUrl === '/health' || reqUrl === '/api/health') {
    return sendJson(res, 200, { ok: true, service: 'hello-webapp-template', ts: new Date().toISOString() })
  }

  const pathname = reqUrl.split('?')[0]
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const abs = path.resolve(root, rel)
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    res.writeHead(404)
    return res.end('Not Found')
  }
  return sendFile(res, abs)
})

server.listen(port, host, () => {
  process.stdout.write(`[hello-webapp-template] running on http://${host}:${port}\n`)
})

