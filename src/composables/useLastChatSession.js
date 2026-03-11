import { ref } from 'vue'

// 模块级状态：切换页面再回到聊天时保留「当前会话」，避免因侧栏 to="/chat" 无 query 导致 ChatPanel key 变化被销毁
const lastProjectPath = ref('__main_chat__')
const lastSessionId = ref(null)

export function useLastChatSession() {
  return {
    lastProjectPath,
    lastSessionId,
    setLast(projectPath, sessionId) {
      if (projectPath != null) lastProjectPath.value = projectPath
      if (sessionId !== undefined) lastSessionId.value = sessionId || null
    }
  }
}
