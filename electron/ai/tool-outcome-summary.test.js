const { summarizeToolFailuresFromMessages } = require('./tool-outcome-summary')

describe('tool-outcome-summary', () => {
  it('summarizeToolFailuresFromMessages picks role:tool failures with tool name', () => {
    const messages = [
      {
        role: 'assistant',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'feishu_send_message', arguments: '{}' } }]
      },
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: JSON.stringify({ success: false, error: 'invalid receive_id' })
      }
    ]
    const s = summarizeToolFailuresFromMessages(messages, { maxItems: 5 })
    expect(s).toContain('feishu_send_message')
    expect(s).toContain('INVALID_PARAM')
  })

  it('returns empty when no failures', () => {
    const messages = [
      { role: 'assistant', content: 'ok' },
      { role: 'tool', tool_call_id: 'x', content: JSON.stringify({ success: true }) }
    ]
    expect(summarizeToolFailuresFromMessages(messages)).toBe('')
  })
})
