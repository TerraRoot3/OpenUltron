const {
  normalizeModelPool,
  normalizeModelBindings,
  finalizeAiModelFields
} = require('./ai-config-normalize')

describe('ai-config-normalize', () => {
  describe('normalizeModelPool', () => {
    it('trims, dedupes, and prepends defaultModel when missing', () => {
      expect(normalizeModelPool([' a ', 'b', 'a'], 'c')).toEqual(['c', 'a', 'b'])
    })

    it('keeps order when defaultModel already in pool', () => {
      expect(normalizeModelPool(['x', 'y'], 'y')).toEqual(['x', 'y'])
    })

    it('handles non-array pool', () => {
      expect(normalizeModelPool(null, 'm')).toEqual(['m'])
      expect(normalizeModelPool(undefined, '')).toEqual([])
    })
  })

  describe('normalizeModelBindings', () => {
    const providers = [{ baseUrl: 'https://a.com' }, { baseUrl: 'https://b.com' }]

    it('drops bindings to unknown baseUrl when allow set is non-empty', () => {
      const out = normalizeModelBindings(
        { m1: 'https://a.com', m2: 'https://evil' },
        providers,
        ['m1', 'm2'],
        'https://b.com'
      )
      expect(out.m1).toBe('https://a.com')
      expect(out.m2).toBe('https://b.com')
    })

    it('fills pool models with fallbackProvider', () => {
      const out = normalizeModelBindings({}, [], ['p1', 'p2'], 'https://z')
      expect(out).toEqual({ p1: 'https://z', p2: 'https://z' })
    })

    it('skips empty keys', () => {
      expect(normalizeModelBindings({ '': 'x', ok: '' }, [], [], '')).toEqual({})
    })
  })

  describe('finalizeAiModelFields', () => {
    it('mutates data object in place with normalized fields', () => {
      const data = {
        defaultModel: 'dm',
        defaultProvider: 'https://p.dev',
        providers: [{ baseUrl: 'https://p.dev' }],
        modelPool: ['  x ', 'x'],
        modelBindings: { dm: 'https://p.dev' }
      }
      finalizeAiModelFields(data)
      expect(data.modelPool).toEqual(['dm', 'x'])
      expect(data.modelBindings.dm).toBe('https://p.dev')
      expect(data.modelBindings.x).toBe('https://p.dev')
    })

    it('returns non-objects unchanged', () => {
      expect(finalizeAiModelFields(null)).toBe(null)
    })
  })
})
