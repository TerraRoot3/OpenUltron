// 工具：结构化 AI 子任务（独立 LLM 调用，返回 JSON，不污染主上下文）
// 适合：摘要提取、分类、评分、格式转换等纯推理任务

const https = require('https')
const http = require('http')
const { URL } = require('url')

const definition = {
  description: '调用 AI 完成一个独立的结构化子任务，返回 JSON 格式结果。适合：摘要提取、内容分类、评分、数据格式转换、关键信息抽取等不需要工具调用的推理任务。结果不影响主对话上下文。',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '任务描述，需明确说明期望的 JSON 输出格式' },
      input: { type: 'string', description: '需要处理的输入内容' },
      output_schema: {
        type: 'string',
        description: '期望输出的 JSON 结构描述（示例格式），如：{"summary": "string", "tags": ["string"]}'
      },
      max_tokens: { type: 'number', description: '最大 token 数，默认 1000' }
    },
    required: ['prompt']
  }
}

function createLlmTaskTool(getAIConfig) {
  async function execute(args) {
    const { prompt, input, output_schema, max_tokens = 1000 } = args

    if (!prompt?.trim()) return { success: false, error: '缺少 prompt 参数' }

    const legacy = typeof getAIConfig === 'function' ? getAIConfig() : null
    if (!legacy?.config?.apiKey) return { success: false, error: '未配置 API Key' }

    const config = legacy.config
    const baseUrl = (config.apiBaseUrl || 'https://api.openai.com/v1').trim()
    const model = config.defaultModel || 'deepseek-v3'
    const isClaude = model.toLowerCase().startsWith('claude-')

    const systemPrompt = [
      '你是一个结构化数据提取助手。',
      '只返回 JSON 格式的结果，不要包含任何解释、markdown 代码块或其他文字。',
      output_schema ? `输出格式示例：${output_schema}` : '根据任务要求自行决定合适的 JSON 结构。'
    ].join('\n')

    const userMsg = input ? `${prompt}\n\n输入内容：\n${input}` : prompt

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg }
    ]

    return new Promise((resolve) => {
      let url, reqBody, headers

      if (isClaude) {
        url = new URL('https://api.anthropic.com/v1/messages')
        reqBody = JSON.stringify({
          model,
          max_tokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }]
        })
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(reqBody)
        }
      } else {
        url = new URL(`${baseUrl}/chat/completions`)
        reqBody = JSON.stringify({ model, messages, max_tokens, temperature: 0 })
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Length': Buffer.byteLength(reqBody)
        }
      }

      const requester = url.protocol === 'https:' ? https : http
      const req = requester.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
        timeout: 30000
      }, (res) => {
        const chunks = []
        res.setEncoding('utf-8')
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          try {
            const body = JSON.parse(chunks.join(''))
            let text = ''
            if (isClaude) {
              text = body.content?.[0]?.text || ''
            } else {
              text = body.choices?.[0]?.message?.content || ''
            }
            // 尝试解析 JSON
            const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0])
                resolve({ success: true, result: parsed })
                return
              } catch { /* fallthrough */ }
            }
            // 返回原始文本
            resolve({ success: true, result: text, warning: '返回内容不是有效 JSON' })
          } catch (e) {
            resolve({ success: false, error: e.message })
          }
        })
        res.on('error', e => resolve({ success: false, error: e.message }))
      })

      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: '请求超时' }) })
      req.on('error', e => resolve({ success: false, error: e.message }))
      req.write(reqBody)
      req.end()
    })
  }

  return { definition, execute }
}

module.exports = { createLlmTaskTool }
