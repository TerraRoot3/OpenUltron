<template>
  <div class="chat-view">
    <!-- 左上角会话切换 tab + 下拉（与其他页面一致的头部高度、左右留白、分割线不到两头） -->
    <div class="chat-view-header">
      <div class="chat-view-header-inner">
        <div class="session-tab-wrap" ref="sessionTabWrapRef">
        <button
          type="button"
          class="session-tab"
          :title="t('sessions.switchSession')"
          @click="sessionDropdownOpen = !sessionDropdownOpen"
        >
          <MessageSquare :size="14" class="session-tab-icon" />
          <span class="session-tab-label">{{ currentSessionLabel }}</span>
          <ChevronDown :size="14" class="session-tab-chevron" :class="{ open: sessionDropdownOpen }" />
        </button>
        <Transition name="session-dropdown">
          <div v-show="sessionDropdownOpen" class="session-dropdown" @click.stop>
            <button
              v-for="s in dropdownSessions"
              :key="(s.projectPath || '') + s.id"
              type="button"
              class="session-dropdown-item"
              :class="{ active: isCurrentSession(s) }"
              @click="selectSession(s)"
            >
              <MessageSquare :size="12" class="session-dropdown-icon" />
              <span class="session-dropdown-title">{{ sessionTitle(s) }}</span>
              <span class="session-dropdown-source">{{ sourceLabel(s.source) }}</span>
            </button>
            <p v-if="dropdownSessions.length === 0" class="session-dropdown-empty">{{ t('sessions.empty') }}</p>
          </div>
        </Transition>
        </div>
      </div>
    </div>
    <ChatPanel
      :key="projectPath"
      :project-path="projectPath"
      :initial-session-id="currentSessionId"
      :session-type-label="currentSessionLabel"
      :system-prompt="''"
      :model="''"
      :enable-mention="false"
      @first-message="(payload) => payload?.sessionId && updateSessionTitle(payload.sessionId, payload.text)"
      @session-loaded="onSessionLoaded"
      @session-created="onSessionCreated"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onActivated, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessageSquare, ChevronDown } from 'lucide-vue-next'
import ChatPanel from '../components/ai/ChatPanel.vue'
import { useLastChatSession } from '../composables/useLastChatSession.js'
import { useI18n } from '../composables/useI18n.js'

defineOptions({ name: 'ChatView' })

const MAIN_CHAT_PROJECT = '__main_chat__'
const FEISHU_PROJECT = '__feishu__'
const DROPDOWN_SESSIONS_MAX = 8

/** 飞书 chat_id 显示片段（后 8 位，便于区分不同群/会话） */
function chatIdSnippet(chatId) {
  const s = String(chatId || '').trim()
  if (!s) return ''
  if (s.length <= 8) return s
  return s.slice(-8)
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { lastProjectPath, lastSessionId, setLast } = useLastChatSession()

const sessions = ref([])
const sessionDropdownOpen = ref(false)
const sessionTabWrapRef = ref(null)

const loadSessions = async () => {
  try {
    const res = await window.electronAPI?.ai?.getSessions?.()
    if (res?.success) sessions.value = res.sessions || []
  } catch { /* ignore */ }
}

/** 带「主」/「飞书」标签的会话标题，用于 tab 与下拉列表 */
const sessionTitle = (s) => {
  const tag = s?.source === 'feishu' ? t('sessions.sourceFeishu') : s?.source === 'main' ? t('sessions.sourceMain') : s?.source === 'telegram' ? 'Telegram' : s?.source === 'dingtalk' ? t('sessions.sourceDingtalk') : s?.source === 'gateway' ? 'Gateway' : ''
  const base = s?.title || (s?.source === 'feishu' ? t('sessions.sourceFeishuSession') : s?.source === 'telegram' ? t('sessions.sourceTelegramSession') : s?.source === 'dingtalk' ? t('sessions.sourceDingtalkSession') : s?.source === 'gateway' ? t('sessions.sourceGatewaySession') : t('sessions.newChat'))
  const parts = [tag, base]
  if (s?.source === 'feishu' && s?.feishuChatId) {
    const snip = chatIdSnippet(s.feishuChatId)
    if (snip) parts.push(snip)
  }
  return parts.filter(Boolean).join(' · ')
}
const sourceLabel = (source) => {
  return source === 'feishu' ? t('sessions.sourceFeishu') : source === 'telegram' ? 'Telegram' : source === 'dingtalk' ? t('sessions.sourceDingtalk') : source === 'main' ? t('sessions.sourceMain') : source === 'gateway' ? 'Gateway' : source || ''
}

const dropdownSessions = computed(() => sessions.value.slice(0, DROPDOWN_SESSIONS_MAX))

const isCurrentSession = (s) => {
  const pid = s.projectPath || MAIN_CHAT_PROJECT
  const sid = currentSessionId.value
  return sid === s.id && projectPath.value === pid
}

const currentSessionLabel = computed(() => {
  const pid = projectPath.value
  const sid = currentSessionId.value
  const found = sessions.value.find((s) => (s.projectPath || MAIN_CHAT_PROJECT) === pid && s.id === sid)
  if (found) return sessionTitle(found)
  if (pid === MAIN_CHAT_PROJECT) return t('sessions.sourceMain')
  if (pid === FEISHU_PROJECT) return t('sessions.sourceFeishu')
  return t('sessions.newChat')
})

const selectSession = (s) => {
  sessionDropdownOpen.value = false
  router.push({ path: '/chat', query: { sessionId: s.id, projectPath: s.projectPath || MAIN_CHAT_PROJECT } })
}

const closeSessionDropdown = (e) => {
  if (sessionDropdownOpen.value && sessionTabWrapRef.value && !sessionTabWrapRef.value.contains(e.target)) {
    sessionDropdownOpen.value = false
  }
}

// 优先用 URL，无则用「上次聊天会话」——避免侧栏 to="/chat" 导致 key 变化、ChatPanel 被销毁
const projectPath = computed(() =>
  route.query.projectPath || lastProjectPath.value || MAIN_CHAT_PROJECT
)
const currentSessionId = ref(
  route.query.sessionId ?? lastSessionId.value ?? null
)

const ensureSession = () => {
  if (route.query.sessionId) currentSessionId.value = route.query.sessionId
  else if (lastSessionId.value != null) currentSessionId.value = lastSessionId.value
}

const onSessionLoaded = (sessionId) => {
  if (sessionId && currentSessionId.value !== sessionId) {
    currentSessionId.value = sessionId
    setLast(projectPath.value, sessionId)
    router.replace({ path: '/chat', query: { sessionId, projectPath: projectPath.value } })
  }
  loadSessions()
}
const onSessionCreated = (sessionId) => {
  if (sessionId) {
    currentSessionId.value = sessionId
    setLast(projectPath.value, sessionId)
    router.replace({ path: '/chat', query: { sessionId, projectPath: projectPath.value } })
  } else {
    currentSessionId.value = null
    setLast(projectPath.value, null)
    router.replace({ path: '/chat', query: projectPath.value !== MAIN_CHAT_PROJECT ? { projectPath: projectPath.value } : {} })
  }
  loadSessions()
}

const updateSessionTitle = async (sessionId, firstMessage) => {
  if (!sessionId || !firstMessage) return
  const title = firstMessage.slice(0, 24).trim() || t('sessions.newChat')
  try {
    await window.electronAPI.ai.saveSession({
      projectPath: projectPath.value,
      id: sessionId,
      title,
      updatedAt: Date.now()
    })
  } catch { /* ignore */ }
}

// URL 有 sessionId 时跟 URL；无时保留 last（避免切回页面时 key 变掉）
watch(() => route.query.sessionId, (id) => {
  currentSessionId.value = id ?? lastSessionId.value ?? null
}, { immediate: true })

// 从会话列表打开某会话后，一旦 URL 带 sessionId/projectPath 就立即写入 last，这样用户再点侧栏「聊天」时不会切回主会话
watch(
  () => ({ path: route.path, sessionId: route.query.sessionId, projectPath: route.query.projectPath }),
  (q) => {
    if (q.path !== '/chat') return
    if (q.sessionId != null || (q.projectPath != null && q.projectPath !== MAIN_CHAT_PROJECT)) {
      setLast(q.projectPath || lastProjectPath.value || MAIN_CHAT_PROJECT, q.sessionId ?? lastSessionId.value ?? null)
    }
  },
  { immediate: true }
)

onMounted(() => {
  ensureSession()
  loadSessions()
  document.addEventListener('click', closeSessionDropdown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closeSessionDropdown)
})

// keep-alive 切回时：若 URL 无 session 则用上次会话并同步到 URL，避免 ChatPanel key 变化；并刷新会话列表
onActivated(() => {
  if (route.path !== '/chat') return
  loadSessions()
  const q = route.query
  if (q.sessionId != null || (q.projectPath != null && q.projectPath !== MAIN_CHAT_PROJECT)) return
  if (lastSessionId.value != null || lastProjectPath.value !== MAIN_CHAT_PROJECT) {
    router.replace({
      path: '/chat',
      query: {
        ...(lastSessionId.value ? { sessionId: lastSessionId.value } : {}),
        ...(lastProjectPath.value !== MAIN_CHAT_PROJECT ? { projectPath: lastProjectPath.value } : {})
      }
    })
  }
})
</script>

<style scoped>
.chat-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ou-bg-main);
}
.chat-view-header {
  flex-shrink: 0;
  padding: 20px 24px 0;
  background: var(--ou-bg-main);
}
.chat-view-header-inner {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--ou-border);
}
.session-tab-wrap {
  position: relative;
  display: inline-block;
}
.session-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--ou-border);
  border-radius: 8px;
  background: var(--ou-bg-elevated);
  color: var(--ou-text);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.session-tab:hover {
  background: var(--ou-bg-hover);
  border-color: var(--ou-border-strong);
}
.session-tab-icon {
  flex-shrink: 0;
  color: var(--ou-text-muted);
}
.session-tab-label {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-tab-chevron {
  flex-shrink: 0;
  color: var(--ou-text-muted);
  transition: transform 0.2s;
}
.session-tab-chevron.open {
  transform: rotate(180deg);
}
.session-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 220px;
  max-width: 320px;
  max-height: 320px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--ou-border);
  border-radius: 10px;
  background: var(--ou-bg-main);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 100;
}
.session-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 10px;
  border: none;
  border-radius: 6px;
  background: var(--ou-bg-main);
  color: var(--ou-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}
.session-dropdown-item:hover {
  background: var(--ou-bg-hover);
}
.session-dropdown-item.active {
  background: color-mix(in srgb, var(--ou-success) 18%, var(--ou-bg-main));
  color: var(--ou-success);
}
.session-dropdown-icon {
  flex-shrink: 0;
  color: var(--ou-text-muted);
}
.session-dropdown-item.active .session-dropdown-icon {
  color: inherit;
}
.session-dropdown-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-dropdown-source {
  flex-shrink: 0;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--ou-bg-hover);
  color: var(--ou-text-muted);
}
.session-dropdown-item.active .session-dropdown-source {
  background: color-mix(in srgb, var(--ou-success) 22%, var(--ou-bg-main));
  color: var(--ou-success);
}
.session-dropdown-empty {
  margin: 0;
  padding: 12px;
  font-size: 13px;
  color: var(--ou-text-muted);
}
.session-dropdown-enter-active,
.session-dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.session-dropdown-enter-from,
.session-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.chat-view > :deep(.chat-panel) {
  flex: 1;
  min-height: 0;
}
</style>
