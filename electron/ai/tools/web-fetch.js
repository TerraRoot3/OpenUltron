// 工具：抓取网页内容并提取正文文本
const https = require('https')
const http = require('http')
const { URL } = require('url')

const definition = {
  description: '抓取指定 URL 的网页内容，提取正文文本（去除 HTML 标签、脚本、样式）。适合获取文档、博客、新闻等页面的正文。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要抓取的完整 URL（需包含 http:// 或 https://）' },
      max_length: { type: 'number', description: '最大返回字符数，默认 8000，最大 20000' }
    },
    required: ['url']
  }
}

/**
 * 从 HTML 中提取正文文本
 * 优先提取 <article>/<main>/<.content>，fallback 到 <body>
 */
function extractText(html) {
  // 移除 script / style / 注释
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')

  // 尝试提取 <article> 或 <main> 主体
  const mainMatch = text.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i)
  if (mainMatch) {
    text = mainMatch[2]
  } else {
    // fallback：提取 <body>
    const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (bodyMatch) text = bodyMatch[1]
  }

  // 将常见块级标签替换为换行
  text = text.replace(/<\/(p|div|h[1-6]|li|br|tr|blockquote|pre)>/gi, '\n')
  // 移除所有剩余 HTML 标签
  text = text.replace(/<[^>]+>/g, '')
  // 解码常见 HTML 实体
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  // 压缩多余空白行（保留段落感）
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

  return text
}

async function execute(args) {
  const { url, max_length = 8000 } = args
  if (!url) return { success: false, error: '缺少 url 参数' }

  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    return { success: false, error: `无效的 URL: ${url}` }
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { success: false, error: '仅支持 http/https 协议' }
  }

  const maxLen = Math.min(max_length, 20000)

  return new Promise((resolve) => {
    const requester = parsedUrl.protocol === 'https:' ? https : http
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GitManager/1.0; +https://github.com)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    }

    const req = requester.request(options, (res) => {
      // 处理重定向（最多 3 次）
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        execute({ url: res.headers.location, max_length }).then(resolve)
        return
      }

      if (res.statusCode !== 200) {
        resolve({ success: false, error: `HTTP ${res.statusCode}`, url })
        return
      }

      const contentType = res.headers['content-type'] || ''
      if (!contentType.includes('html') && !contentType.includes('text')) {
        resolve({ success: false, error: `不支持的内容类型: ${contentType}`, url })
        return
      }

      const chunks = []
      let totalLen = 0
      res.setEncoding('utf-8')

      res.on('data', (chunk) => {
        totalLen += chunk.length
        if (totalLen <= 500000) chunks.push(chunk)  // 原始 HTML 最多 500KB
      })

      res.on('end', () => {
        try {
          const html = chunks.join('')
          const text = extractText(html)
          const truncated = text.length > maxLen
          resolve({
            success: true,
            url,
            content: truncated ? text.slice(0, maxLen) + '\n\n[...内容已截断]' : text,
            length: text.length,
            truncated
          })
        } catch (e) {
          resolve({ success: false, error: e.message, url })
        }
      })

      res.on('error', (e) => resolve({ success: false, error: e.message, url }))
    })

    req.on('timeout', () => {
      req.destroy()
      resolve({ success: false, error: '请求超时（15s）', url })
    })
    req.on('error', (e) => resolve({ success: false, error: e.message, url }))
    req.end()
  })
}

module.exports = { definition, execute }
