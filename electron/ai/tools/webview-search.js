/**
 * 通过隐藏 BrowserWindow 加载百度/谷歌搜索页，再用 JS 注入提取结果，作为通用搜索的兜底。
 * 不依赖第三方 API，仅依赖本机浏览器环境；百度在国内可访问，谷歌可能被墙或触发验证码。
 */

const { BrowserWindow } = require('electron')

const TIMEOUT_MS = 18000
const MAX_RESULTS = 15
const MAX_SNIPPET_LEN = 400

function getBaiduSearchUrl(query) {
  return `https://www.baidu.com/s?wd=${encodeURIComponent(query.trim())}`
}

function getGoogleSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`
}

/**
 * 在页面内执行的 JS：从百度搜索结果页提取标题、链接、摘要
 */
function getBaiduExtractScript() {
  return `
(function() {
  var items = [];
  var blocks = document.querySelectorAll('.c-container, .result, .result-op, [class*="result"]');
  for (var i = 0; i < blocks.length && items.length < 20; i++) {
    var block = blocks[i];
    var link = block.querySelector('h3.t a, .t a, a[data-click], h3 a, .c-title a');
    if (!link || !link.href) continue;
    var href = link.href;
    if (href.indexOf('baidu.com/s?') >= 0 || href === '#' || href.indexOf('javascript:') === 0) continue;
    var title = (link.innerText || link.textContent || '').trim();
    if (title.length < 2) continue;
    var snippet = '';
    var sn = block.querySelector('.c-abstract, .content-right_8Zs40, [class*="abstract"]');
    if (sn) snippet = (sn.innerText || sn.textContent || '').trim();
    items.push({ title: title, url: href, content: snippet.slice(0, 500) });
  }
  if (items.length === 0) {
    var as = document.querySelectorAll('#content_left a[href^="http"]');
    for (var j = 0; j < as.length && items.length < 20; j++) {
      var a = as[j];
      if (a.href.indexOf('baidu.com') >= 0 && a.href.indexOf('baidu.com/link') < 0) continue;
      var t = (a.innerText || a.textContent || '').trim();
      if (t.length > 3 && t.length < 150) items.push({ title: t, url: a.href, content: '' });
    }
  }
  return JSON.stringify(items);
})();
`
}

/**
 * 在页面内执行的 JS：从谷歌搜索结果页提取
 */
function getGoogleExtractScript() {
  return `
(function() {
  var items = [];
  var blocks = document.querySelectorAll('.g');
  for (var i = 0; i < blocks.length && items.length < 20; i++) {
    var block = blocks[i];
    var link = block.querySelector('a[href^="http"]');
    if (!link || !link.href) continue;
    var href = link.href;
    if (href.indexOf('google.com') >= 0) continue;
    var titleEl = block.querySelector('.LC20lb, h3');
    var title = titleEl ? (titleEl.innerText || titleEl.textContent || '').trim() : '';
    if (title.length < 2) continue;
    var sn = block.querySelector('.VwiC3b, .IsZvec');
    var snippet = sn ? (sn.innerText || sn.textContent || '').trim() : '';
    items.push({ title: title, url: href, content: snippet.slice(0, 500) });
  }
  return JSON.stringify(items);
})();
`
}

/**
 * 使用隐藏 BrowserWindow 加载搜索页并执行 JS 提取结果
 * @param {string} query - 搜索关键词
 * @param {'baidu'|'google'} engine - 搜索引擎
 * @returns {Promise<{ success: boolean, query: string, results: Array, total: number }|{ success: boolean, error: string }>}
 */
function searchViaWebview(query, engine = 'baidu') {
  const url = engine === 'google' ? getGoogleSearchUrl(query) : getBaiduSearchUrl(query)
  const extractScript = engine === 'google' ? getGoogleExtractScript() : getBaiduExtractScript()

  return new Promise((resolve) => {
    let win = null
    const timeout = setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.destroy()
        win = null
      }
      resolve({ success: false, error: '网页搜索超时（加载或解析超时）' })
    }, TIMEOUT_MS)

    try {
      win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 800,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      })

      win.webContents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      )

      win.webContents.on('did-finish-load', () => {
        // 百度等页面结果可能由 JS 延迟渲染，延迟 2 秒再提取
        const runExtract = () => {
          if (!win || win.isDestroyed()) return
          win.webContents
            .executeJavaScript(extractScript)
            .then((jsonStr) => {
              clearTimeout(timeout)
              if (win && !win.isDestroyed()) win.destroy()
              win = null
              try {
                const raw = JSON.parse(jsonStr || '[]')
                const results = (Array.isArray(raw) ? raw : []).slice(0, MAX_RESULTS).map((r, i) => ({
                  index: i + 1,
                  title: (r.title || '').slice(0, 200),
                  url: r.url || '',
                  content: (r.content || '').length > MAX_SNIPPET_LEN
                    ? (r.content || '').slice(0, MAX_SNIPPET_LEN) + '...'
                    : (r.content || '')
                }))
                if (results.length === 0) {
                  resolve({ success: false, error: '网页结构已变化，未能解析到搜索结果' })
                } else {
                  resolve({
                    success: true,
                    query: query.trim(),
                    results,
                    total: results.length
                  })
                }
              } catch (e) {
                resolve({ success: false, error: `解析结果失败: ${e.message}` })
              }
            })
            .catch((err) => {
              clearTimeout(timeout)
              if (win && !win.isDestroyed()) win.destroy()
              resolve({ success: false, error: `执行提取脚本失败: ${err.message}` })
            })
        }
        setTimeout(runExtract, 2000)
      })

      win.webContents.on('did-fail-load', (_, code, desc) => {
        clearTimeout(timeout)
        if (win && !win.isDestroyed()) win.destroy()
        resolve({ success: false, error: `页面加载失败: ${code} ${desc}` })
      })

      win.loadURL(url, { userAgent: win.webContents.getUserAgent() })
    } catch (e) {
      clearTimeout(timeout)
      if (win && !win.isDestroyed()) win.destroy()
      resolve({ success: false, error: `创建搜索窗口失败: ${e.message}` })
    }
  })
}

module.exports = { searchViaWebview, getBaiduSearchUrl, getGoogleSearchUrl }
