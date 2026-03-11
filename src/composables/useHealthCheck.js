import { ref, onMounted, onUnmounted } from 'vue'

const INTERVAL_MS = 60 * 1000 // 60 秒轮询一次

/**
 * 健康检查：请求 /api/health，用于左下角状态展示。
 * @returns { status: 'idle'|'checking'|'ok'|'error', label: string, check: () => Promise<void> }
 */
export function useHealthCheck() {
  const status = ref('idle') // idle | checking | ok | error
  const label = ref('')

  async function check() {
    const api = typeof window !== 'undefined' && window.electronAPI?.getApiBaseUrl
    if (!api) {
      status.value = 'idle'
      label.value = ''
      return
    }
    status.value = 'checking'
    label.value = '检查中…'
    try {
      const { url } = await api()
      if (!url) {
        status.value = 'error'
        label.value = '未连接'
        return
      }
      const res = await fetch(`${url}/api/health`, { method: 'GET' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ok) {
        status.value = 'ok'
        label.value = '正常'
      } else {
        status.value = 'error'
        label.value = '异常'
      }
    } catch {
      status.value = 'error'
      label.value = '异常'
    }
  }

  let timer = null
  onMounted(() => {
    check()
    timer = setInterval(check, INTERVAL_MS)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return { status, label, check }
}
