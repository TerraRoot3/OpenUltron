const { markPending, complete, poll, resetForTests } = require('./subagent-async-outcomes')

describe('subagent-async-outcomes', () => {
  beforeEach(() => resetForTests())

  it('poll running then completed', () => {
    markPending('sub-1', { parentSessionId: 'p1' })
    expect(poll('sub-1').status).toBe('running')
    complete('sub-1', { success: true, result: 'ok', subSessionId: 'sub-1', envelope: { summary: 'done' } })
    const p = poll('sub-1')
    expect(p.status).toBe('completed')
    expect(p.fullOut.result).toBe('ok')
  })
})
