import { ref, computed, onMounted, onUnmounted } from 'vue'

const STORAGE_KEY = 'openultron-theme'

/** @type {'light'|'dark'|'system'} */
const stored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch (_) {}
  return 'system'
}

const theme = ref(stored())

const systemDark = ref(false)
let mediaQuery = null

function updateSystemDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return
  systemDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
}

function bindSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', updateSystemDark)
  updateSystemDark()
}

function unbindSystemTheme() {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', updateSystemDark)
    mediaQuery = null
  }
}

/** 实际生效的主题：light | dark */
const effectiveTheme = computed(() => {
  if (theme.value === 'system') return systemDark.value ? 'dark' : 'light'
  return theme.value
})

function setTheme(value) {
  if (value !== 'light' && value !== 'dark' && value !== 'system') return
  theme.value = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch (_) {}
  applyThemeToDocument(value)
}

function cycleTheme() {
  // 一次点击即在浅色/深色间切换（太阳 <-> 月亮），不再经过 system
  const next = effectiveTheme.value === 'light' ? 'dark' : 'light'
  setTheme(next)
}

function applyThemeToDocument(preference) {
  if (typeof document === 'undefined' || !document.documentElement) return
  const effective = preference === 'system'
    ? (systemDark.value ? 'dark' : 'light')
    : preference
  document.documentElement.setAttribute('data-theme', effective)
  document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-system')
  document.documentElement.classList.add(`theme-${effective}`)
  if (preference === 'system') document.documentElement.classList.add('theme-system')
}

/** 在 App 启动时尽早应用持久化主题，减少闪烁 */
export function initTheme() {
  const t = stored()
  theme.value = t
  updateSystemDark() // 先更新 systemDark，再应用，保证 system 时显示正确
  applyThemeToDocument(t)
}

export function useTheme() {
  onMounted(() => {
    bindSystemTheme()
    // 同步一次，防止入口未挂载到 html 时或 hydration 后状态漂移
    updateSystemDark()
    applyThemeToDocument(theme.value)
  })
  onUnmounted(() => {
    unbindSystemTheme()
  })
  return {
    theme,
    effectiveTheme,
    setTheme,
    cycleTheme
  }
}
