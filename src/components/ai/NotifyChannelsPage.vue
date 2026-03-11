<template>
  <div class="feishu-page">
    <div class="feishu-header">
      <Send :size="16" />
      <span>消息通知</span>
    </div>
    <p class="feishu-desc">配置主流 IM 平台后，AI 或系统可向指定群/会话发送文本通知（任务完成、报错提醒等）；部分平台支持接收消息并触发 AI 会话。</p>

    <!-- 平台切换 -->
    <div class="notify-platform-tabs">
      <button
        v-for="p in platforms"
        :key="p.key"
        class="notify-tab"
        :class="{ active: activePlatform === p.key }"
        @click="activePlatform = p.key"
      >
        {{ p.label }}
      </button>
    </div>

    <!-- 飞书 -->
    <template v-if="activePlatform === 'feishu'">

    <div v-if="!receiveRunning && receiveEnabled" class="feishu-tip">
      <strong>若飞书控制台提示「应用未建立长连接」：</strong>请先在本页填写并保存 App ID、App Secret，勾选「接收飞书消息」后点击「开启接收」，待本应用与飞书建立长连接后，再回飞书开放平台保存或配置。
    </div>

    <section class="feishu-section">
      <h3 class="feishu-section-title">飞书 · 应用配置</h3>
      <div class="feishu-form">
        <div class="feishu-row">
          <label>App ID</label>
          <input
            v-model="appId"
            type="text"
            class="feishu-input"
            placeholder="飞书应用 App ID"
            @blur="saveConfigDebounced"
          />
        </div>
        <div class="feishu-row">
          <label>App Secret</label>
          <input
            v-model="appSecret"
            type="password"
            class="feishu-input"
            placeholder="飞书应用 App Secret"
            @blur="saveConfigDebounced"
          />
        </div>
        <div class="feishu-row">
          <label>默认会话 ID（可选）</label>
          <input
            v-model="defaultChatId"
            type="text"
            class="feishu-input"
            placeholder="群/会话 chat_id，AI 回复与任务完成通知时使用"
            @blur="saveConfigDebounced"
          />
        </div>
        <div class="feishu-row">
          <label>测试发往 chat_id（可选）</label>
          <input
            v-model="testChatId"
            type="text"
            class="feishu-input"
            placeholder="不填则用上方默认会话 ID；填任意群/会话 ID 即可点「测试发送」"
          />
        </div>
        <div class="feishu-row feishu-row-check">
          <label class="feishu-check-label">
            <input v-model="notifyOnComplete" type="checkbox" @change="saveConfigDebounced" />
            <span>会话结束时发送完成通知到默认会话</span>
          </label>
        </div>
        <div class="feishu-row feishu-row-check">
          <label class="feishu-check-label">
            <input v-model="receiveEnabled" type="checkbox" @change="saveConfigDebounced" />
            <span>接收飞书消息（长连接）：飞书后台需 <strong>事件与回调 → 事件订阅 → 添加事件 → 勾选「接收消息」</strong>，否则收不到推送。群里 @ 机器人或私聊机器人发文本即可触发，会话在「AI 助手」中查看；发 <code>/new</code> 开新会话。</span>
          </label>
        </div>
      </div>
      <div class="feishu-actions">
        <button class="feishu-btn primary" :disabled="saving" @click="saveConfig">
          <Loader v-if="saving" :size="13" class="spin" />
          {{ saving ? '保存中…' : '保存配置' }}
        </button>
        <button
          class="feishu-btn"
          :disabled="sending || !sendTestChatId"
          @click="sendTest"
          title="需填写「默认会话 ID」或「测试发往 chat_id」之一"
        >
          <Loader v-if="sending" :size="13" class="spin" />
          <Send v-else :size="13" />
          {{ sending ? '发送中…' : '测试发送' }}
        </button>
        <button
          v-if="receiveEnabled"
          class="feishu-btn"
          :disabled="receiveStarting"
          @click="toggleReceive"
        >
          <Loader v-if="receiveStarting" :size="13" class="spin" />
          <Wifi v-else :size="13" />
          {{ receiveRunning ? '已连接（点击断开）' : '开启接收' }}
        </button>
      </div>
      <div v-if="result" class="feishu-result" :class="result.ok ? 'ok' : 'err'">
        {{ result.message }}
      </div>
      <div v-if="receiveError" class="feishu-result err">
        {{ receiveError }}
        <span v-if="receiveError.includes('npm install')" class="feishu-err-hint">在终端进入项目根目录后执行上述命令，再重启应用。</span>
      </div>
    </section>
    </template>

    <!-- Telegram -->
    <template v-else-if="activePlatform === 'telegram'">
    <section class="feishu-section">
      <h3 class="feishu-section-title">Telegram · Bot 配置</h3>
      <p class="telegram-desc">在 BotFather 创建 Bot 后填入 Token；勾选「接收消息」并保存，私聊或群内 @ 机器人即可触发 AI，发 <code>/new</code> 开新会话。</p>
      <div class="feishu-form">
        <div class="feishu-row">
          <label>Bot Token</label>
          <input
            v-model="telegramBotToken"
            type="password"
            class="feishu-input"
            placeholder="从 BotFather 获取的 token"
            @blur="saveTelegramDebounced"
          />
        </div>
        <div class="feishu-row feishu-row-check">
          <label class="feishu-check-label">
            <input v-model="telegramEnabled" type="checkbox" @change="saveTelegramDebounced" />
            <span>接收 Telegram 消息（开启后与飞书等渠道一并启动）</span>
          </label>
        </div>
      </div>
      <div class="feishu-actions">
        <button class="feishu-btn primary" :disabled="telegramSaving" @click="saveTelegram">
          <Loader v-if="telegramSaving" :size="13" class="spin" />
          {{ telegramSaving ? '保存中…' : '保存配置' }}
        </button>
      </div>
      <div v-if="telegramStatusLoaded" class="feishu-result" :class="telegramRunning ? 'ok' : ''">
        接收状态：{{ telegramRunning ? '运行中' : '未连接' }}
        <span v-if="!telegramRunning && telegramError" class="feishu-result err-inline">{{ telegramError }}</span>
      </div>
    </section>
    </template>

    <!-- 钉钉 -->
    <template v-else-if="activePlatform === 'dingtalk'">
    <section class="feishu-section">
      <h3 class="feishu-section-title">钉钉 · 应用配置</h3>
      <p class="dingtalk-desc">在钉钉开放平台创建应用后填入 AppKey、AppSecret；可选填默认会话 ID 用于发送通知。勾选「接收消息」后，钉钉消息将触发 AI 会话（需后续实现接收能力）。</p>
      <div class="feishu-form">
        <div class="feishu-row">
          <label>AppKey</label>
          <input
            v-model="dingtalkAppKey"
            type="text"
            class="feishu-input"
            placeholder="钉钉应用 AppKey"
            @blur="saveDingtalkDebounced"
          />
        </div>
        <div class="feishu-row">
          <label>AppSecret</label>
          <input
            v-model="dingtalkAppSecret"
            type="password"
            class="feishu-input"
            placeholder="钉钉应用 AppSecret"
            @blur="saveDingtalkDebounced"
          />
        </div>
        <div class="feishu-row">
          <label>默认会话 ID（可选）</label>
          <input
            v-model="dingtalkDefaultChatId"
            type="text"
            class="feishu-input"
            placeholder="群/会话 ID，发送通知时使用"
            @blur="saveDingtalkDebounced"
          />
        </div>
        <div class="feishu-row feishu-row-check">
          <label class="feishu-check-label">
            <input v-model="dingtalkReceiveEnabled" type="checkbox" @change="saveDingtalkDebounced" />
            <span>接收钉钉消息（开启后与飞书等渠道一并启动，接收能力待实现）</span>
          </label>
        </div>
      </div>
      <div class="feishu-actions">
        <button class="feishu-btn primary" :disabled="dingtalkSaving" @click="saveDingtalk">
          <Loader v-if="dingtalkSaving" :size="13" class="spin" />
          {{ dingtalkSaving ? '保存中…' : '保存配置' }}
        </button>
      </div>
      <div v-if="dingtalkResult" class="feishu-result" :class="dingtalkResult.ok ? 'ok' : 'err'">
        {{ dingtalkResult.message }}
      </div>
    </section>
    </template>

    <!-- 其他 -->
    <section v-else class="feishu-section notify-placeholder">
      <h3 class="feishu-section-title">其他平台</h3>
      <p class="notify-placeholder-text">Slack 等主流平台后续支持。</p>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Send, Loader, Wifi } from 'lucide-vue-next'

const platforms = [
  { key: 'feishu', label: '飞书' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'dingtalk', label: '钉钉' },
  { key: 'other', label: '其他' }
]
const activePlatform = ref('feishu')

const appId = ref('')
const appSecret = ref('')
const defaultChatId = ref('')
const notifyOnComplete = ref(false)
const receiveEnabled = ref(false)
const receiveRunning = ref(false)
const receiveStarting = ref(false)
const receiveError = ref('')
const saving = ref(false)
const sending = ref(false)
const result = ref(null)

const defaultChatIdTrimmed = computed(() => (defaultChatId.value || '').trim())
const testChatId = ref('')
const sendTestChatId = computed(() => defaultChatIdTrimmed.value || (testChatId.value || '').trim())

// Telegram（消息通知内子平台）
const telegramBotToken = ref('')
const telegramEnabled = ref(false)
const telegramSaving = ref(false)
const telegramStatusLoaded = ref(false)
const telegramRunning = ref(false)
const telegramError = ref('')

// 钉钉
const dingtalkAppKey = ref('')
const dingtalkAppSecret = ref('')
const dingtalkDefaultChatId = ref('')
const dingtalkReceiveEnabled = ref(false)
const dingtalkSaving = ref(false)
const dingtalkResult = ref(null)

const api = () => window.electronAPI?.feishu
const telegramApi = () => window.electronAPI?.telegram
const dingtalkApi = () => window.electronAPI?.dingtalk

async function loadConfig() {
  const res = await api()?.getConfig?.()
  if (res?.success) {
    appId.value = res.app_id || ''
    appSecret.value = res.app_secret || ''
    defaultChatId.value = res.default_chat_id || ''
    notifyOnComplete.value = res.notify_on_complete === true
    receiveEnabled.value = res.receive_enabled === true
  }
  const status = await api()?.receiveStatus?.()
  if (status) {
    receiveRunning.value = !!status.running
    receiveError.value = status.error || ''
  }
  // 冷启动：若配置为开启接收但当前未连接，自动尝试连接一次
  if (receiveEnabled.value && !receiveRunning.value && api()?.receiveStart) {
    receiveStarting.value = true
    try {
      const startRes = await api().receiveStart()
      receiveRunning.value = !!startRes?.running
      if (startRes?.error) receiveError.value = startRes.error
      else receiveError.value = ''
    } catch (_) { /* 保持 receiveRunning/receiveError 由上面 status 决定 */ }
    finally { receiveStarting.value = false }
  }
}

async function loadTelegramConfig() {
  const c = await telegramApi()?.getConfig?.()
  if (c) {
    telegramBotToken.value = c.bot_token || ''
    telegramEnabled.value = !!c.enabled
  }
  const status = await telegramApi()?.receiveStatus?.()
  if (status) {
    telegramRunning.value = !!status.running
    telegramError.value = status.error || ''
  }
  telegramStatusLoaded.value = true
}

async function saveTelegram() {
  if (!telegramApi()) return
  telegramSaving.value = true
  try {
    await telegramApi().setConfig?.({ bot_token: telegramBotToken.value, enabled: telegramEnabled.value })
    await loadTelegramConfig()
  } finally {
    telegramSaving.value = false
  }
}

let saveTelegramDebounceTimer = null
function saveTelegramDebounced() {
  clearTimeout(saveTelegramDebounceTimer)
  saveTelegramDebounceTimer = setTimeout(saveTelegram, 400)
}

async function loadDingtalkConfig() {
  const c = await dingtalkApi()?.getConfig?.()
  if (c) {
    dingtalkAppKey.value = c.app_key || ''
    dingtalkAppSecret.value = c.app_secret || ''
    dingtalkDefaultChatId.value = c.default_chat_id || ''
    dingtalkReceiveEnabled.value = !!c.receive_enabled
  }
}

async function saveDingtalk() {
  if (!dingtalkApi()) return
  dingtalkSaving.value = true
  dingtalkResult.value = null
  try {
    await dingtalkApi().setConfig?.({
      app_key: dingtalkAppKey.value?.trim() || '',
      app_secret: dingtalkAppSecret.value?.trim() || '',
      default_chat_id: (dingtalkDefaultChatId.value || '').trim(),
      receive_enabled: dingtalkReceiveEnabled.value
    })
    dingtalkResult.value = { ok: true, message: '已保存' }
  } catch (e) {
    dingtalkResult.value = { ok: false, message: e?.message || '保存失败' }
  } finally {
    dingtalkSaving.value = false
  }
}

let saveDingtalkDebounceTimer = null
function saveDingtalkDebounced() {
  clearTimeout(saveDingtalkDebounceTimer)
  saveDingtalkDebounceTimer = setTimeout(saveDingtalk, 400)
}

async function saveConfig() {
  if (!api()) return
  saving.value = true
  result.value = null
  try {
    const res = await api().setConfig({
      app_id: appId.value?.trim() || '',
      app_secret: appSecret.value?.trim() || '',
      default_chat_id: defaultChatIdTrimmed.value,
      notify_on_complete: notifyOnComplete.value,
      receive_enabled: receiveEnabled.value
    })
    if (res?.success) {
      result.value = { ok: true, message: '已保存' }
    } else {
      result.value = { ok: false, message: res?.message || '保存失败' }
    }
  } finally {
    saving.value = false
  }
}

let saveDebounceTimer = null
function saveConfigDebounced() {
  clearTimeout(saveDebounceTimer)
  saveDebounceTimer = setTimeout(saveConfig, 400)
}

async function sendTest() {
  const chatId = sendTestChatId.value
  if (!api() || !chatId) return
  sending.value = true
  result.value = null
  try {
    const res = await api().sendMessage({
      chat_id: chatId,
      text: '【OpenUltron】飞书通知测试消息'
    })
    result.value = { ok: !!res?.success, message: res?.message || (res?.success ? '发送成功' : '发送失败') }
  } catch (e) {
    result.value = { ok: false, message: e?.message || '发送失败' }
  } finally {
    sending.value = false
  }
}

async function toggleReceive() {
  if (!api()) return
  receiveStarting.value = true
  receiveError.value = ''
  try {
    if (receiveRunning.value) {
      await api().receiveStop()
      receiveRunning.value = false
      // 断开时持久化状态，下次启动不再自动连接
      await api().setConfig({ receive_enabled: false })
      receiveEnabled.value = false
    } else {
      const res = await api().receiveStart()
      receiveRunning.value = !!res?.running
      if (res?.error) receiveError.value = res.error
      else if (res?.running) {
        // 连接成功时持久化状态，下次启动自动连接
        await api().setConfig({ receive_enabled: true })
        receiveEnabled.value = true
      }
    }
  } catch (e) {
    receiveError.value = e?.message || '连接失败'
  } finally {
    receiveStarting.value = false
  }
}

onMounted(() => {
  loadConfig()
  loadTelegramConfig()
  loadDingtalkConfig()
})
</script>

<style scoped>
.feishu-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: var(--ou-bg-main);
  color: var(--ou-text);
  padding: 20px 24px;
  gap: 24px;
}

.feishu-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--ou-text);
  padding-bottom: 12px;
  border-bottom: 1px solid var(--ou-border);
}

.feishu-desc {
  font-size: 12px;
  color: var(--ou-text-muted);
  margin: 0;
}

.notify-platform-tabs {
  display: flex;
  gap: 4px;
}
.notify-tab {
  padding: 6px 14px;
  border: 1px solid var(--ou-border);
  border-radius: 6px;
  background: var(--ou-bg-hover);
  color: var(--ou-text-muted);
  font-size: 12px;
  cursor: pointer;
}
.notify-tab:hover { color: var(--ou-text); }
.notify-tab.active {
  background: color-mix(in srgb, var(--ou-primary) 25%, transparent);
  border-color: color-mix(in srgb, var(--ou-primary) 45%, transparent);
  color: var(--ou-link);
}

.telegram-desc { font-size: 12px; color: var(--ou-text-muted); margin: 0 0 12px 0; }
.telegram-desc code { font-size: 11px; color: var(--ou-link); padding: 0 4px; }
.dingtalk-desc { font-size: 12px; color: var(--ou-text-muted); margin: 0 0 12px 0; }
.feishu-result.err-inline { margin-left: 8px; }

.notify-placeholder { margin-top: 8px; }
.notify-placeholder-text { font-size: 12px; color: var(--ou-text-muted); margin: 0; }

.feishu-tip {
  font-size: 12px;
  color: var(--ou-text);
  background: color-mix(in srgb, var(--ou-warning) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--ou-warning) 35%, transparent);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 16px;
}
.feishu-tip strong { color: var(--ou-warning); }

.feishu-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feishu-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ou-text);
  margin: 0;
}

.feishu-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.feishu-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.feishu-row label {
  font-size: 12px;
  color: var(--ou-text-muted);
}
.feishu-row-check { margin-top: 4px; }
.feishu-check-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ou-text);
  cursor: pointer;
}
.feishu-check-label input[type="checkbox"] { cursor: pointer; }
.feishu-check-label code { font-size: 11px; color: var(--ou-link); padding: 0 4px; }

.feishu-input {
  max-width: 420px;
  padding: 8px 12px;
  border: 1px solid var(--ou-border);
  border-radius: 5px;
  background: var(--ou-bg-hover);
  color: var(--ou-text);
  font-size: 12px;
}
.feishu-input::placeholder { color: var(--ou-text-muted); }
.feishu-input:focus {
  outline: none;
  border-color: var(--ou-primary);
}

.feishu-actions {
  display: flex;
  gap: 8px;
}

.feishu-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--ou-border);
  border-radius: 5px;
  background: var(--ou-bg-hover);
  color: var(--ou-text);
  font-size: 12px;
  cursor: pointer;
}
.feishu-btn.primary {
  background: color-mix(in srgb, var(--ou-primary) 35%, transparent);
  border-color: var(--ou-primary);
  color: var(--ou-link);
}
.feishu-btn.primary:hover:not(:disabled),
.feishu-btn:hover:not(:disabled) { opacity: 0.9; }
.feishu-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.feishu-result {
  font-size: 12px;
  padding: 8px 12px;
  border-radius: 5px;
}
.feishu-result.ok { background: color-mix(in srgb, var(--ou-success) 15%, transparent); color: var(--ou-success); border: 1px solid color-mix(in srgb, var(--ou-success) 30%, transparent); }
.feishu-result.err { background: color-mix(in srgb, var(--ou-error) 15%, transparent); color: var(--ou-error); border: 1px solid color-mix(in srgb, var(--ou-error) 30%, transparent); }
.feishu-err-hint { display: block; margin-top: 6px; font-size: 11px; opacity: 0.9; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
