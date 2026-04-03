const {
  validateNestedSpawnEligibility,
  registerSubagentSpawn,
  unregisterSubagentChild,
  clearSubagentSpawnMeta,
  resetRegistryForTests
} = require('./subagent-spawn-registry')

describe('subagent-spawn-registry', () => {
  beforeEach(() => {
    if (typeof resetRegistryForTests === 'function') resetRegistryForTests()
  })

  it('validateNestedSpawnEligibility: main session can spawn depth 1', () => {
    const r = validateNestedSpawnEligibility('panel-abc', { maxSpawnDepth: 1 })
    expect(r.ok).toBe(true)
  })

  it('validateNestedSpawnEligibility: depth-1 executor cannot nest', () => {
    registerSubagentSpawn('main-1', 'sub-111', 'executor')
    const r = validateNestedSpawnEligibility('sub-111', { maxSpawnDepth: 2 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/coordinator/)
  })

  it('validateNestedSpawnEligibility: depth-1 coordinator can nest when maxSpawnDepth>=2', () => {
    registerSubagentSpawn('main-2', 'sub-222', 'coordinator')
    const r = validateNestedSpawnEligibility('sub-222', { maxSpawnDepth: 2 })
    expect(r.ok).toBe(true)
  })

  it('validateNestedSpawnEligibility: depth-2 leaf cannot spawn', () => {
    registerSubagentSpawn('main-3', 'sub-a', 'coordinator')
    registerSubagentSpawn('sub-a', 'sub-b', 'executor')
    const r = validateNestedSpawnEligibility('sub-b', { maxSpawnDepth: 3 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/叶子|depth=2/)
    unregisterSubagentChild('sub-a', 'sub-b')
    clearSubagentSpawnMeta('sub-b')
  })
})
