'use strict'

/**
 * 将常见 Markdown 转为飞书 IM「post」富文本结构（zh_cn）。
 * 飞书 text 类型不会渲染 **、`[]()` 等，必须用 post 的 tag 才能粗体/链接等。
 * @see https://open.feishu.cn/document/server-docs/im-v1/message-content-description/post
 */

const DEFAULT_OPTS = {
  maxRows: 90,
  maxTitleLen: 120
}

function textEl (text, style) {
  const t = String(text ?? '')
  const o = { tag: 'text', text: t.length ? t : ' ' }
  if (style && style.length) o.style = style
  return o
}

/** 是否值得走 post（体积过大或纯白话则保持 text） */
function shouldUseFeishuRichPost (s) {
  if (s == null) return false
  const str = String(s)
  if (str.length < 2 || str.length > 32000) return false
  return (
    /\*\*[^*]+\*\*/.test(str) ||
    /`[^`\n]+`/.test(str) ||
    /\[[^\]]+\]\(https?:\/\/[^)\s]+\)/.test(str) ||
    /^#{1,6}\s/m.test(str) ||
    /^\s*[-*]\s+\S/m.test(str) ||
    /```[\s\S]*?```/.test(str)
  )
}

/**
 * 行内：**粗体**、`代码`、[文字](url)
 */
function parseInline (line) {
  const s = String(line ?? '')
  if (!s) return [textEl(' ')]

  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/
  const boldRe = /\*\*([^*]+)\*\*/
  const codeRe = /`([^`]+)`/

  function walk (rest, acc) {
    if (!rest) return acc
    let bestIdx = rest.length
    let best = null
    const tryRe = (re) => {
      const m = re.exec(rest)
      if (m && m.index < bestIdx) {
        bestIdx = m.index
        best = { m, re }
      }
    }
    tryRe(linkRe)
    tryRe(boldRe)
    tryRe(codeRe)
    if (!best) {
      acc.push(textEl(rest))
      return acc
    }
    if (bestIdx > 0) {
      acc.push(textEl(rest.slice(0, bestIdx)))
    }
    const mid = best.m
    if (best.re === linkRe) {
      acc.push({ tag: 'a', text: mid[1], href: mid[2] })
    } else if (best.re === boldRe) {
      acc.push(textEl(mid[1], ['bold']))
    } else {
      acc.push(textEl(mid[1], ['italic']))
    }
    return walk(rest.slice(bestIdx + mid[0].length), acc)
  }

  const row = walk(s, [])
  return row.length ? row : [textEl(' ')]
}

function pushRow (content, row, maxRows) {
  if (content.length >= maxRows) return false
  if (!row || !row.length) content.push([textEl(' ')])
  else content.push(row)
  return true
}

/**
 * @param {string} markdown
 * @param {object} [opts]
 * @returns {{ zh_cn: { title: string, content: array[] } }}
 */
function markdownToFeishuPost (markdown, opts = {}) {
  const { maxRows, maxTitleLen } = { ...DEFAULT_OPTS, ...opts }
  let title = ''
  const content = []
  let raw = String(markdown ?? '').replace(/\r\n/g, '\n')

  //  fenced code blocks → 单独段落（斜体以示区别）
  const codeSegments = []
  raw = raw.replace(/```(?:\w*)\n?([\s\S]*?)```/g, (_, code) => {
    const i = codeSegments.length
    codeSegments.push(String(code || '').trimEnd())
    return `\n\n__CODE_BLOCK_${i}__\n\n`
  })

  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx]
    if (content.length >= maxRows) break
    const codeMatch = /^__CODE_BLOCK_(\d+)__$/.exec(para.trim())
    if (codeMatch) {
      const body = codeSegments[Number(codeMatch[1])] || ''
      const lines = body.split('\n')
      for (const ln of lines) {
        if (!pushRow(content, [textEl(ln || ' ', ['italic'])], maxRows)) break
      }
      continue
    }

    const lines = para.split('\n')
    for (let line of lines) {
      if (content.length >= maxRows) break
      line = line.trimEnd()
      if (!line.trim()) {
        pushRow(content, [textEl(' ')], maxRows)
        continue
      }

      const hm = /^(#{1,6})\s+(.+)$/.exec(line)
      if (hm) {
        const level = hm[1].length
        const body = hm[2].trim()
        if (!title && level <= 2 && body.length <= maxTitleLen) {
          title = body
          // post 已有 title 字段，正文不再重复同一行
          continue
        }
        if (!pushRow(content, [textEl(body, ['bold'])], maxRows)) break
        continue
      }

      const bullet = /^(\s*[-*]|\d+\.)\s+(.+)$/.exec(line)
      if (bullet) {
        const body = bullet[2]
        const row = [textEl('• '), ...parseInline(body)]
        if (!pushRow(content, row, maxRows)) break
        continue
      }

      if (!pushRow(content, parseInline(line), maxRows)) break
    }
  }

  if (content.length === 0) {
    content.push([textEl(String(markdown || ' ').slice(0, 5000))])
  }

  return {
    zh_cn: {
      title: title || '',
      content
    }
  }
}

module.exports = {
  markdownToFeishuPost,
  shouldUseFeishuRichPost
}
