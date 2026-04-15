const {
  applyProxyEnvFromConfig,
  resolveProxyRuntimeState,
  buildSessionProxyConfig,
  parseWindowsRegProxyOutput,
  parseLinuxGsettingsProxy
} = require('./proxy-and-ai-config-helpers')

describe('proxy-and-ai-config-helpers', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    for (const key of ['http_proxy', 'https_proxy', 'all_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'no_proxy', 'NO_PROXY']) {
      delete process.env[key]
    }
  })

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  it('prefers manual proxy when enabled and populated', () => {
    const state = resolveProxyRuntimeState({
      proxyConfig: {
        enabled: true,
        http_proxy: 'http://127.0.0.1:7890',
        https_proxy: '',
        all_proxy: '',
        no_proxy: '127.0.0.1,localhost'
      },
      systemProxyEnv: {
        http_proxy: 'http://system:8888',
        https_proxy: 'http://system:8888'
      }
    })

    expect(state.source).toBe('manual')
    expect(state.env.http_proxy).toBe('http://127.0.0.1:7890')
    expect(state.env.https_proxy).toBe('http://127.0.0.1:7890')
  })

  it('falls back to system proxy when manual proxy is disabled', () => {
    const state = resolveProxyRuntimeState({
      proxyConfig: {
        enabled: false,
        http_proxy: '',
        https_proxy: '',
        all_proxy: '',
        no_proxy: ''
      },
      systemProxyEnv: {
        http_proxy: 'http://system:8888',
        https_proxy: 'http://system:9999',
        no_proxy: 'localhost'
      }
    })

    expect(state.source).toBe('system')
    expect(state.env.http_proxy).toBe('http://system:8888')
    expect(state.env.https_proxy).toBe('http://system:9999')
    expect(state.env.no_proxy).toBe('localhost')
  })

  it('clears proxy env when neither manual nor system proxy exists', () => {
    process.env.http_proxy = 'http://stale:7890'
    process.env.https_proxy = 'http://stale:7890'

    const result = applyProxyEnvFromConfig({
      getProxyConfig: () => ({
        enabled: false,
        http_proxy: '',
        https_proxy: '',
        all_proxy: '',
        no_proxy: ''
      }),
      getSystemProxyEnv: () => ({})
    })

    expect(result.source).toBe('direct')
    expect(process.env.http_proxy).toBeUndefined()
    expect(process.env.https_proxy).toBeUndefined()
  })

  it('builds fixed session proxy config from manual proxy', () => {
    const sessionProxy = buildSessionProxyConfig({
      source: 'manual',
      env: {
        http_proxy: 'http://127.0.0.1:7890',
        https_proxy: 'http://127.0.0.1:7891',
        no_proxy: 'localhost,127.0.0.1'
      }
    })

    expect(sessionProxy.mode).toBe('fixed_servers')
    expect(sessionProxy.proxyRules).toContain('http=http://127.0.0.1:7890')
    expect(sessionProxy.proxyRules).toContain('https=http://127.0.0.1:7891')
    expect(sessionProxy.proxyBypassRules).toBe('localhost,127.0.0.1')
  })

  it('uses system session proxy mode when runtime source is system', () => {
    const sessionProxy = buildSessionProxyConfig({
      source: 'system',
      env: {
        http_proxy: 'http://system:8888'
      }
    })

    expect(sessionProxy).toEqual({ mode: 'system' })
  })

  it('parses windows registry proxy output', () => {
    const env = parseWindowsRegProxyOutput(`
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ       http=127.0.0.1:7890;https=127.0.0.1:7891;socks=127.0.0.1:7892
    ProxyOverride  REG_SZ       localhost;127.*;<local>
`)

    expect(env.http_proxy).toBe('http://127.0.0.1:7890')
    expect(env.https_proxy).toBe('http://127.0.0.1:7891')
    expect(env.all_proxy).toBe('socks5://127.0.0.1:7892')
    expect(env.no_proxy).toContain('localhost')
  })

  it('parses linux gsettings proxy output', () => {
    const env = parseLinuxGsettingsProxy({
      mode: "'manual'",
      httpHost: "'127.0.0.1'",
      httpPort: '7890',
      httpsHost: "'127.0.0.1'",
      httpsPort: '7891',
      socksHost: "'127.0.0.1'",
      socksPort: '7892',
      ignoreHosts: "['localhost', '127.0.0.1']"
    })

    expect(env.http_proxy).toBe('http://127.0.0.1:7890')
    expect(env.https_proxy).toBe('http://127.0.0.1:7891')
    expect(env.all_proxy).toBe('socks5://127.0.0.1:7892')
    expect(env.no_proxy).toBe('localhost,127.0.0.1')
  })
})
