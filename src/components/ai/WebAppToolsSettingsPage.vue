<template>
  <div class="wat-settings-page">
    <div class="wat-header">
      <LayoutGrid :size="16" />
      <span>{{ t('webappAi.title') }}</span>
    </div>

    <p class="wat-desc">{{ t('webappAi.desc') }}</p>

    <section class="wat-section">
      <label class="wat-row">
        <input v-model="enabled" type="checkbox" :disabled="!hasApi" />
        <span>{{ t('webappAi.enable') }}</span>
      </label>
    </section>

    <div class="wat-footer">
      <button type="button" class="wat-btn primary" :disabled="saving || !hasApi" @click="save">
        <Loader v-if="saving" :size="14" class="spin" />
        {{ saving ? t('webappAi.saving') : t('webappAi.save') }}
      </button>
      <span v-if="saveMsg" class="wat-save-msg" :class="saveOk ? 'ok' : 'err'">{{ saveMsg }}</span>
    </div>

    <p class="wat-footer-link">
      <router-link to="/web-apps">{{ t('webappAi.goLibrary') }}</router-link>
    </p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { LayoutGrid, Loader } from 'lucide-vue-next'
import { useI18n } from '../../composables/useI18n.js'

const { t } = useI18n()
const api = window.electronAPI?.ai

const hasApi = computed(() => !!(api?.getWebAppAiSettings && api?.setWebAppAiSettings))

const enabled = ref(true)
const saving = ref(false)
const saveMsg = ref('')
const saveOk = ref(true)

async function loadSettings() {
  if (!api?.getWebAppAiSettings) return
  try {
    const r = await api.getWebAppAiSettings()
    if (r?.success) {
      enabled.value = r.aiWebAppToolsEnabled !== false
    }
  } catch {
    /* ignore */
  }
}

async function save() {
  if (!api?.setWebAppAiSettings) return
  saveMsg.value = ''
  saving.value = true
  try {
    const r = await api.setWebAppAiSettings({
      aiWebAppToolsEnabled: enabled.value
    })
    if (r?.success) {
      saveMsg.value = t('webappAi.saveDone')
      saveOk.value = true
    } else {
      saveMsg.value = r?.error || t('webappAi.saveFail')
      saveOk.value = false
    }
  } catch (e) {
    saveMsg.value = e?.message || String(e)
    saveOk.value = false
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadSettings()
})

defineExpose({ reload: loadSettings })
</script>

<style scoped>
.wat-settings-page {
  padding: 20px 28px 32px;
  max-width: 720px;
}
.wat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--ou-text);
  margin-bottom: 10px;
}
.wat-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--ou-text-muted);
  line-height: 1.55;
}
.wat-section {
  margin-bottom: 18px;
}
.wat-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  color: var(--ou-text);
  cursor: pointer;
}
.wat-row input {
  margin-top: 2px;
}
.wat-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.wat-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  border: 1px solid var(--ou-border);
  background: var(--ou-bg-elevated);
  color: var(--ou-text);
  cursor: pointer;
}
.wat-btn.primary {
  background: var(--ou-accent);
  color: var(--ou-on-accent, #fff);
  border-color: transparent;
}
.wat-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.wat-save-msg {
  font-size: 12px;
}
.wat-save-msg.ok {
  color: var(--ou-success, #16a34a);
}
.wat-save-msg.err {
  color: var(--ou-danger, #dc2626);
}
.wat-footer-link {
  margin: 16px 0 0;
  font-size: 13px;
}
.wat-footer-link a {
  color: var(--ou-accent);
}
.spin {
  animation: wat-spin 0.8s linear infinite;
}
@keyframes wat-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
