// SSE 流解析器 - 解析七牛 AI API 的 Server-Sent Events 响应

class SSEParser {
  constructor() {
    this.buffer = ''
  }

  // 解析 SSE 数据块，返回解析出的事件数组
  parse(chunk) {
    this.buffer += chunk
    const events = []
    const lines = this.buffer.split('\n')

    // 最后一行可能不完整，保留在 buffer 中
    this.buffer = lines.pop() || ''

    let currentData = ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') {
          events.push({ type: 'done' })
        } else {
          try {
            const parsed = JSON.parse(data)
            events.push({ type: 'data', data: parsed })
          } catch (e) {
            // 不完整的 JSON，拼接到下一条
            currentData += data
          }
        }
      } else if (line.trim() === '' && currentData) {
        // 空行分隔事件
        try {
          const parsed = JSON.parse(currentData)
          events.push({ type: 'data', data: parsed })
        } catch (e) { /* 忽略无法解析的数据 */ }
        currentData = ''
      }
    }

    return events
  }

  reset() {
    this.buffer = ''
  }
}

module.exports = { SSEParser }
