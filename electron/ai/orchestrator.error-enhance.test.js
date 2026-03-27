const { Orchestrator } = require('./orchestrator')

describe('orchestrator llm error enhancement', () => {
  it('adds relogin hint for chatgpt codex session-expired 401', () => {
    const orchestrator = new Orchestrator(() => ({}), null, null)
    const message = 'Error [401] chatgpt.com/backend-api/codex/responses: Your ChatGPT session expired before this request finished.'
    const out = orchestrator._enhanceLlmErrorForUser({ message, httpStatus: 401 })
    expect(out).toContain('session expired')
    expect(out).toContain('重新登录')
    expect(out).toContain('ChatGPT')
  })
})
