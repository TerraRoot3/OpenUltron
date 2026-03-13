import { ref } from 'vue'

const STORAGE_KEY = 'ou-last-chat-session'

function readPersisted() {
  if (typeof window === 'undefined' || !window.localStorage) return { projectPath: '__main_chat__', sessionId: null }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { projectPath: '__main_chat__', sessionId: null }
    const obj = JSON.parse(raw)
    return {
      projectPath: typeof obj?.projectPath === 'string' ? obj.projectPath : '__main_chat__',
      sessionId: obj?.sessionId != null ? String(obj.sessionId) : null
    }
  } catch {
    return { projectPath: '__main_chat__', sessionId: null }
  }
}

function writePersisted(projectPath, sessionId) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      projectPath: projectPath ?? '__main_chat__',
      sessionId: sessionId != null ? sessionId : null
    }))
  } catch { /* ignore */ }
}

const persisted = readPersisted()
// 模块级状态：切换页面或重启应用后仍保留「上次打开的会话」
const lastProjectPath = ref(persisted.projectPath)
const lastSessionId = ref(persisted.sessionId)

export function useLastChatSession() {
  return {
    lastProjectPath,
    lastSessionId,
    setLast(projectPath, sessionId) {
      if (projectPath != null) lastProjectPath.value = projectPath
      if (sessionId !== undefined) lastSessionId.value = sessionId || null
      writePersisted(lastProjectPath.value, lastSessionId.value)
    }
  }
}
