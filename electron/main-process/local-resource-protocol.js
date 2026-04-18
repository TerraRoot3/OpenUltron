/**
 * 注册 local-resource://（defaultSession + Web 应用预览分区），并初始化 web-apps guest session
 */

const { Readable } = require('stream')

/** 与 electron/web-apps/guest-session.js 中 WEB_APP_GUEST_PARTITION 一致 */
const WEB_APP_GUEST_PARTITION = 'persist:ou-webapps'

/** @param {object} deps — session, getAppRoot, path, fs, net, pathToFileURL, URL（url.URL 构造器） */
function registerLocalResourceProtocol(deps) {
  const { session, getAppRoot, path, fs, net, pathToFileURL, URL } = deps
  const appRootBase = getAppRoot()

  function mimeTypeForExt(ext = '') {
    const lower = String(ext || '').toLowerCase()
    if (lower === '.mp3') return 'audio/mpeg'
    if (lower === '.wav') return 'audio/wav'
    if (lower === '.m4a') return 'audio/mp4'
    if (lower === '.aac') return 'audio/aac'
    if (lower === '.ogg') return 'audio/ogg'
    if (lower === '.opus') return 'audio/ogg'
    if (lower === '.flac') return 'audio/flac'
    if (lower === '.mp4') return 'video/mp4'
    if (lower === '.mov') return 'video/quicktime'
    if (lower === '.webm') return 'video/webm'
    if (lower === '.mkv') return 'video/x-matroska'
    return 'application/octet-stream'
  }

  function parseByteRange(rangeHeader, totalSize) {
    const text = String(rangeHeader || '').trim()
    if (!text) return null
    const m = text.match(/^bytes=(\d*)-(\d*)$/i)
    if (!m) return null
    const rawStart = m[1]
    const rawEnd = m[2]
    let start = rawStart === '' ? null : Number(rawStart)
    let end = rawEnd === '' ? null : Number(rawEnd)

    if (start == null && end == null) return null
    if (start == null) {
      const suffix = Number(rawEnd)
      if (!Number.isFinite(suffix) || suffix <= 0) return null
      start = Math.max(0, totalSize - suffix)
      end = totalSize - 1
    } else {
      if (!Number.isFinite(start) || start < 0 || start >= totalSize) return 'invalid'
      if (end == null) end = totalSize - 1
      if (!Number.isFinite(end) || end < start) return 'invalid'
      end = Math.min(end, totalSize - 1)
    }

    return { start, end }
  }

  function buildRangedFileResponse(fullPath, ext, request, cacheHeaders = {}) {
    const stat = fs.statSync(fullPath)
    const totalSize = stat.size
    const reqHeaders = request.headers || {}
    const rangeHeader = reqHeaders.Range || reqHeaders.range || ''
    const parsedRange = parseByteRange(rangeHeader, totalSize)
    const baseHeaders = {
      'Content-Type': mimeTypeForExt(ext),
      'Accept-Ranges': 'bytes',
      'Content-Length': String(totalSize),
      ...cacheHeaders
    }

    if (parsedRange === 'invalid') {
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes */${totalSize}`
        }
      })
    }

    if (parsedRange && parsedRange.start <= parsedRange.end) {
      const { start, end } = parsedRange
      return new Response(Readable.toWeb(fs.createReadStream(fullPath, { start, end })), {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${totalSize}`
        }
      })
    }

    return new Response(Readable.toWeb(fs.createReadStream(fullPath)), {
      status: 200,
      headers: baseHeaders
    })
  }

  function parseWebAppLocFromAnyUrl(raw) {
    if (!raw || typeof raw !== 'string') return null
    try {
      const u = new URL(raw)
      const pathname = String(u.pathname || '').replace(/^\/+/, '')
      const parts = pathname.split('/').filter(Boolean)
      if (parts[0] !== 'web-apps' || parts.length < 3) return null
      return { appId: parts[1], version: parts[2] }
    } catch {
      return null
    }
  }

  async function localResourceProtocolHandler(request, options = {}) {
    const guestMode = options && options.guestMode === true
    try {
      const url = new URL(request.url)
      let relPath
      if (url.host) {
        relPath = decodeURIComponent((url.host || '') + url.pathname)
      } else {
        relPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      }
      const segments = relPath.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.' && p !== '..')
      const fullPath = path.join(appRootBase, ...segments)
      if (!fullPath.startsWith(appRootBase + path.sep) && fullPath !== appRootBase) {
        return new Response('Forbidden', { status: 403 })
      }
      const ext = path.extname(fullPath).toLowerCase()
      if (guestMode) {
        if (segments[0] !== 'web-apps' || segments.length < 3) {
          return new Response('Forbidden', { status: 403 })
        }
        const target = { appId: segments[1], version: segments[2] }
        const reqHeaders = request.headers || {}
        const referrer =
          request.referrer ||
          reqHeaders.Referer ||
          reqHeaders.referer ||
          reqHeaders.Origin ||
          reqHeaders.origin ||
          ''
        const ctx = parseWebAppLocFromAnyUrl(String(referrer || ''))
        if (ctx && (ctx.appId !== target.appId || ctx.version !== target.version)) {
          return new Response('Forbidden', { status: 403 })
        }
        // 不再要求子资源必须带 Referer：部分 Chromium/正式包构建下 CSS/JS 请求无 Referer，
        // 会误拦 403 导致「有 HTML 无样式」。路径已限定 web-apps/<id>/<version>/，跨应用仍由上一段拦截。
      }
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        return new Response('Not Found', { status: 404 })
      }
      const cacheHeaders = segments[0] === 'web-apps'
        ? {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0'
          }
        : {}
      if (segments[0] === 'web-apps' && ext === '.html') {
        const buf = fs.readFileSync(fullPath)
        const csp = [
          "default-src 'self' local-resource: data: blob:",
          "script-src 'self' local-resource: 'unsafe-inline'",
          "style-src 'self' local-resource: 'unsafe-inline'",
          "media-src 'self' local-resource: data: blob:",
          "img-src 'self' local-resource: data: blob: https:",
          "font-src 'self' local-resource: data:",
          "connect-src 'self' local-resource:",
          "base-uri 'self' local-resource:",
          "frame-ancestors 'none'"
        ].join('; ')
        return new Response(buf, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': csp,
            ...cacheHeaders
          }
        })
      }
      if (mimeTypeForExt(ext) !== 'application/octet-stream') {
        return buildRangedFileResponse(fullPath, ext, request, cacheHeaders)
      }
      const resp = await net.fetch(pathToFileURL(fullPath).toString())
      if (segments[0] === 'web-apps') {
        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers: {
            'Content-Type': resp.headers.get('content-type') || 'application/octet-stream',
            ...cacheHeaders
          }
        })
      }
      return resp
    } catch (e) {
      return new Response('Internal Error', { status: 500 })
    }
  }

  session.defaultSession.protocol.handle('local-resource', (request) =>
    localResourceProtocolHandler(request, { guestMode: false })
  )
  session.fromPartition(WEB_APP_GUEST_PARTITION).protocol.handle('local-resource', (request) =>
    localResourceProtocolHandler(request, { guestMode: true })
  )

  try {
    require('../web-apps/guest-session').setupWebAppGuestSession()
  } catch (e) {
    console.warn('[web-apps] guest session setup failed:', e.message)
  }
}

module.exports = { registerLocalResourceProtocol, WEB_APP_GUEST_PARTITION }
