<template>
  <div class="ai-sub-page">
    <div class="amp-sidebar">
      <nav class="amp-nav">
        <button
          v-for="item in menuItems"
          :key="item.key"
          class="amp-nav-item"
          :class="{ active: activeTab === item.key }"
          @click="activeTab = item.key"
        >
          <component :is="item.icon" :size="14" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </div>
    <div class="amp-content">
      <!-- 首次使用引导：未配置 API 或可选通道时展示 -->
      <div v-if="onboarding.needsApiConfig || onboarding.needsFeishuConfig" class="onboarding-banner">
        <p class="onboarding-title">首次使用？请先完成以下配置</p>
        <ul class="onboarding-steps">
          <li v-if="onboarding.needsApiConfig">
            <strong>API 配置（必填）</strong>：填写 API Key 后才能使用 AI 对话。
            <button type="button" class="onboarding-btn" @click="activeTab = 'config'">去配置</button>
          </li>
          <li v-if="onboarding.needsFeishuConfig">
            <strong>消息通知（可选）</strong>：配置飞书/Telegram 可接收远程消息。
            <button type="button" class="onboarding-btn" @click="activeTab = 'feishu'">去配置</button>
          </li>
        </ul>
      </div>
      <AISettingsPage v-if="activeTab === 'config'" />
      <NotifyChannelsPage v-else-if="activeTab === 'feishu'" />
      <AIBackupPage v-else-if="activeTab === 'backup'" />
      <DoctorPage v-else-if="activeTab === 'doctor'" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Settings, Send, Archive, Activity } from 'lucide-vue-next'
import AISettingsPage from './AISettingsPage.vue'
import NotifyChannelsPage from './NotifyChannelsPage.vue'
import AIBackupPage from './AIBackupPage.vue'
import DoctorPage from './DoctorPage.vue'

const api = () => window.electronAPI?.ai

const props = defineProps({
  initialTab: { type: String, default: 'config' }
})

const menuItems = [
  { key: 'config', label: 'API 配置', icon: Settings },
  { key: 'feishu', label: '消息通知', icon: Send },
  { key: 'backup', label: '数据备份', icon: Archive },
  { key: 'doctor', label: '诊断', icon: Activity }
]

const activeTab = ref(menuItems.some(m => m.key === props.initialTab) ? props.initialTab : 'config')
const onboarding = ref({ needsApiConfig: false, needsFeishuConfig: false })

async function refreshOnboarding() {
  try {
    const ai = api()
    const status = ai ? await ai.getOnboardingStatus() : { needsApiConfig: true, needsFeishuConfig: true }
    onboarding.value = status
  } catch {
    onboarding.value = { needsApiConfig: true, needsFeishuConfig: true }
  }
}

onMounted(() => {
  refreshOnboarding()
  const ai = api()
  if (ai && typeof ai.onAIConfigUpdated === 'function') {
    ai.onAIConfigUpdated(refreshOnboarding)
  }
})
onUnmounted(() => {
  const ai = api()
  if (ai && typeof ai.removeAIConfigUpdatedListener === 'function') {
    ai.removeAIConfigUpdatedListener()
  }
})

watch(() => props.initialTab, (val) => {
  if (val && menuItems.some(m => m.key === val)) activeTab.value = val
})
</script>

<style scoped>
.onboarding-banner {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--ou-bg-elevated, #f5f5f5);
  border: 1px solid var(--ou-border);
  border-radius: 8px;
}
.onboarding-title {
  margin: 0 0 8px 0;
  font-weight: 600;
  font-size: 14px;
}
.onboarding-steps {
  margin: 0;
  padding-left: 20px;
}
.onboarding-steps li {
  margin-bottom: 6px;
}
.onboarding-btn {
  margin-left: 8px;
  padding: 2px 10px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid var(--ou-border);
  background: var(--ou-bg-main);
  cursor: pointer;
}
.onboarding-btn:hover {
  background: var(--ou-bg-elevated);
}

.ai-sub-page {
  display: flex;
  height: 100%;
  background: var(--ou-bg-main);
  overflow: hidden;
  padding: 0;
}
.amp-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: transparent;
  border-right: 1px solid var(--ou-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.amp-nav {
  display: flex;
  flex-direction: column;
  padding: 12px 24px 8px 24px;
  gap: 2px;
  flex: 1;
  overflow: auto;
}
.amp-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ou-text-muted);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s, color 0.12s;
  width: 100%;
}
.amp-nav-item:hover {
  background: var(--ou-bg-hover);
  color: var(--ou-text);
}
.amp-nav-item.active {
  background: color-mix(in srgb, var(--ou-primary) 22%, transparent);
  color: var(--ou-link);
}
.amp-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  padding: 0;
}
</style>
