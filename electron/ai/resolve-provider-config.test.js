const {
  getResolvedAIConfigForProvider,
  mergeModelSelectionIntoConfig,
  getProviderOpenAiWireMode,
  mergeContextCompressionFromLegacy,
  mergeToolDefinitionsFromLegacy
} = require('./resolve-provider-config')
const { DEFAULT_CONFIG } = require('./context-compressor')

describe('resolve-provider-config', () => {
  const legacyBase = {
    config: { temperature: 0.5, maxTokens: 100, maxToolIterations: 3 },
    providerKeys: { 'https://api.openai.com': 'sk-test' },
    raw: {
      defaultModel: 'gpt-4',
      defaultProvider: 'https://api.openai.com',
      modelPool: ['gpt-4', 'gpt-4o'],
      modelBindings: { 'gpt-4': 'https://api.openai.com', 'gpt-4o': 'https://api.openai.com' },
      providers: [
        { name: 'OpenAI', baseUrl: 'https://api.openai.com', apiKey: 'ignored' },
        { name: 'Other', baseUrl: 'https://other.example' }
      ]
    }
  }

  it('getResolvedAIConfigForProvider returns null without key or apiKey', () => {
    expect(getResolvedAIConfigForProvider('', { legacy: legacyBase })).toBe(null)
    expect(getResolvedAIConfigForProvider('https://other.example', { legacy: legacyBase })).toBe(null)
  })

  it('getResolvedAIConfigForProvider resolves by baseUrl and merges pool', () => {
    const cfg = getResolvedAIConfigForProvider('https://api.openai.com', { legacy: legacyBase })
    expect(cfg).not.toBeNull()
    expect(cfg.apiKey).toBe('sk-test')
    expect(cfg.apiBaseUrl).toBe('https://api.openai.com')
    expect(cfg.defaultModel).toBe('gpt-4')
    expect(cfg.modelPool.length).toBeGreaterThan(0)
    expect(cfg.contextCompression).toMatchObject({ threshold: DEFAULT_CONFIG.threshold })
    expect(cfg.toolDefinitions.slimMode).toBe('always')
  })

  it('does not append aiModelsValidatedByProvider catalog to fallbackModels', () => {
    const store = {
      get: (k) => (k === 'aiModelsValidatedByProvider'
        ? { 'https://api.openai.com': [{ id: 'gpt-4' }, { id: 'x/y-1' }, { id: 'x/y-2' }] }
        : {})
    }
    const cfg = getResolvedAIConfigForProvider('https://api.openai.com', { legacy: legacyBase, store })
    expect(cfg.fallbackModels).toEqual(['gpt-4o'])
    expect(cfg.modelPool).toEqual(['gpt-4', 'gpt-4o'])
  })

  it('getResolvedAIConfigForProvider resolves by provider name', () => {
    const cfg = getResolvedAIConfigForProvider('OpenAI', { legacy: legacyBase })
    expect(cfg?.apiBaseUrl).toBe('https://api.openai.com')
  })

  it('getProviderOpenAiWireMode reads per-provider setting', () => {
    const leg = {
      raw: {
        providers: [{ baseUrl: 'https://x.com', openAiWireMode: 'responses' }]
      }
    }
    expect(getProviderOpenAiWireMode(leg, 'https://x.com')).toBe('responses')
    expect(getProviderOpenAiWireMode(leg, 'https://missing')).toBe('')
    expect(getProviderOpenAiWireMode({ raw: { providers: [{ baseUrl: 'https://y.com', openAiWireMode: 'auto' }] } }, 'https://y.com')).toBe('')
  })

  it('mergeContextCompressionFromLegacy merges raw.contextCompression', () => {
    const merged = mergeContextCompressionFromLegacy({
      raw: { contextCompression: { threshold: 999, enabled: false } }
    })
    expect(merged.threshold).toBe(999)
    expect(merged.enabled).toBe(false)
    expect(merged.keepRecent).toBe(DEFAULT_CONFIG.keepRecent)
  })

  it('mergeToolDefinitionsFromLegacy applies overrides', () => {
    const t = mergeToolDefinitionsFromLegacy({
      raw: { toolDefinitions: { slimMode: 'never', maxDescriptionChars: 10 } }
    })
    expect(t.slimMode).toBe('never')
    expect(t.maxDescriptionChars).toBe(10)
  })

  it('mergeModelSelectionIntoConfig uses fallbackRoutes', () => {
    const base = {
      defaultModel: 'a',
      modelPool: ['a', 'b'],
      modelBindings: {},
      fallbackRoutes: [{ model: 'b', config: { apiBaseUrl: 'https://route', apiKey: 'rk' } }]
    }
    const out = mergeModelSelectionIntoConfig(base, 'b', () => legacyBase, null)
    expect(out.defaultModel).toBe('b')
    expect(out.apiBaseUrl).toBe('https://route')
    expect(out.modelPool).toEqual(base.modelPool)
  })

  it('mergeModelSelectionIntoConfig returns unchanged when pick equals default', () => {
    const base = { defaultModel: 'a', modelPool: ['a'] }
    expect(mergeModelSelectionIntoConfig(base, 'a', () => legacyBase, null)).toBe(base)
  })
})
