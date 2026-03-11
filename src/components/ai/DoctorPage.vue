<template>
  <div class="doctor-page">
    <div class="doctor-header">
      <h2 class="doctor-title">诊断</h2>
      <p class="doctor-desc">检查 Gateway、飞书连接、配置目录与文件是否正常。</p>
      <button class="doctor-run-btn" :disabled="loading" @click="runDoctor">
        {{ loading ? '检查中…' : '运行诊断' }}
      </button>
    </div>
    <div v-if="error" class="doctor-error">{{ error }}</div>
    <div v-else-if="result" class="doctor-result">
      <div
        v-for="c in result.checks"
        :key="c.id"
        class="doctor-check"
        :class="c.status"
      >
        <span class="check-icon">{{ statusIcon(c.status) }}</span>
        <div class="check-body">
          <div class="check-name">{{ c.name }}</div>
          <div class="check-message">{{ c.message }}</div>
          <div v-if="c.fixHint" class="check-fix">{{ c.fixHint }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const loading = ref(false)
const error = ref('')
const result = ref(null)

function statusIcon(status) {
  if (status === 'pass') return '✓'
  if (status === 'warn') return '⚠'
  return '✗'
}

async function runDoctor() {
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const api = window.electronAPI
    if (!api || typeof api.invoke !== 'function') {
      error.value = '无法调用主进程（仅 Electron 环境支持）'
      return
    }
    const data = await api.invoke('doctor-run', [])
    result.value = data
  } catch (e) {
    error.value = e.message || String(e)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.doctor-page {
  padding: 24px;
  max-width: 560px;
}
.doctor-header {
  margin-bottom: 20px;
}
.doctor-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--ou-text);
  margin: 0 0 6px 0;
}
.doctor-desc {
  font-size: 13px;
  color: var(--ou-text-muted);
  margin: 0 0 14px 0;
}
.doctor-run-btn {
  padding: 8px 16px;
  font-size: 13px;
  border-radius: 6px;
  border: 1px solid var(--ou-border);
  background: var(--ou-bg-main);
  color: var(--ou-text);
  cursor: pointer;
}
.doctor-run-btn:hover:not(:disabled) {
  background: var(--ou-bg-hover);
}
.doctor-run-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.doctor-error {
  font-size: 13px;
  color: var(--ou-danger, #c53030);
  margin-top: 12px;
}
.doctor-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.doctor-check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--ou-border);
  background: var(--ou-bg-sub);
}
.doctor-check.pass .check-icon { color: var(--ou-success, #2f855a); }
.doctor-check.warn .check-icon { color: var(--ou-warning, #b7791f); }
.doctor-check.fail .check-icon { color: var(--ou-danger, #c53030); }
.check-icon {
  font-size: 16px;
  line-height: 1.2;
  flex-shrink: 0;
}
.check-body {
  flex: 1;
  min-width: 0;
}
.check-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ou-text);
  margin-bottom: 2px;
}
.check-message {
  font-size: 12px;
  color: var(--ou-text-muted);
}
.check-fix {
  font-size: 12px;
  color: var(--ou-text-muted);
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--ou-border);
}
</style>
