/**
 * 派生子 Agent（多 Agent / 代理模式）：创建独立会话执行任务，执行完成后返回结果给主 Agent。
 * 多会话协调：sessions_spawn。
 */

const { buildExecutionEnvelope, truncateDelegationStdoutPreview } = require('../execution-envelope')
const { ingestEnvelopeArtifacts } = require('../artifact-hub')
const { getSubagentOrchestration } = require('../../openultron-config')
const { validateNestedSpawnEligibility } = require('../subagent-spawn-registry')
const { sanitizeInjectedSystemPrompt } = require('../system-prompt-guard')

const definition = {
  description: '派生子 Agent 执行一项任务。主 Agent 将任务与可选系统提示交给子 Agent，子 Agent 在独立会话中运行直至完成，最后把最终回复文本返回给主 Agent。子 Agent **必须在最后一轮用自然语言说明**：是否已按要求实现、改了哪些路径/文件、若涉及页面/功能如何验证；勿在仅改文件后沉默结束。工具返回值含 **message** 与 **envelope.summary** 会同步给主会话。可通过 provider 与 model 指定子 Agent 使用的供应商与模型（先调用 list_providers_and_models 获取可用列表）。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '交给子 Agent 执行的任务描述（作为一条 user 消息）' },
      system_prompt: { type: 'string', description: '可选。注入子 Agent 的 system 提示，用于限定角色或步骤' },
      role_name: { type: 'string', description: '可选。子 Agent 的角色名/显示名，便于在对话中区分（如「代码审查员」「翻译助手」）' },
      runtime: { type: 'string', description: '可选。子 Agent 运行时：auto（默认，先尝试可用外部子 Agent，失败自动回退）/ internal（仅内置）/ external:<name>（如 external:codex、external:gateway；兼容别名 external:gateway_cli；网关 CLI 可设环境变量 OPENULTRON_GATEWAY_CLI 指定可执行文件名）' },
      provider: { type: 'string', description: '可选。子 Agent 使用的供应商：供应商名称（如「OpenAI」「DeepSeek」）或 base_url；不传则使用当前默认供应商' },
      model: { type: 'string', description: '可选。子 Agent 使用的模型 ID。根据任务复杂度选择：简单任务选 fast 模型；复杂代码/推理任务选 reasoning 模型。优先选已验证可用模型。' },
      project_path: { type: 'string', description: '可选。子 Agent 的项目路径上下文，默认与主会话一致' },
      profile: { type: 'string', description: '可选。子 Agent 配置 profile（executor / read_only_fast / coordinator 或 .openultron/agents/*.md），默认 executor' },
      agent: { type: 'string', description: '可选。与 profile 同义，便于兼容' },
      wait_for_result: { type: 'boolean', description: '默认 true（同步等待子 Agent 跑完）。为 false 时立即返回 sub_session_id，后台执行，稍后通过 sessions_subagent_poll 取结果（需 openultron.json 允许 allowAsyncSpawn）。' }
    },
    required: ['task']
  }
}

function normalizeParentSessionId(sid) {
  const s = String(sid || '').trim()
  if (!s) return ''
  const m = s.match(/^(.*)-run-\d+$/)
  return m && m[1] ? String(m[1]).trim() : s
}

function createSessionsSpawnTool(runSubChat) {
  if (typeof runSubChat !== 'function') {
    return {
      definition,
      execute: async () => ({ success: false, error: 'sessions_spawn 未配置（缺少 runSubChat）' })
    }
  }

  async function execute(args, context = {}) {
    const { task, system_prompt, provider, model, project_path, role_name, runtime, profile, agent, wait_for_result } = args || {}
    if (!task || String(task).trim() === '') {
      return { success: false, error: '缺少 task 参数' }
    }
    const parentSessionId = normalizeParentSessionId(context.sessionId || '')
    const nest = validateNestedSpawnEligibility(parentSessionId || '', getSubagentOrchestration())
    if (!nest.ok) {
      return { success: false, error: nest.error }
    }

    const projectPath = (project_path != null && String(project_path).trim() !== '')
      ? String(project_path).trim()
      : (context.projectPath || '__main_chat__')

    try {
      const stream = {
        sendToolResult: (obj) => {
          try {
            if (!context?.sender || !context?.sessionId || !context?.toolCallId) return
            context.sender.send('ai-chat-tool-result', {
              sessionId: context.sessionId,
              toolCallId: context.toolCallId,
              name: 'sessions_spawn',
              result: JSON.stringify(obj || {})
            })
          } catch (_) {}
        }
      }

      const parentRunId = String(context.runId || '').trim()
      const out = await runSubChat({
        task: String(task).trim(),
        systemPrompt: (() => {
          const raw = system_prompt != null && String(system_prompt).trim() ? String(system_prompt).trim() : ''
          const sanitized = sanitizeInjectedSystemPrompt(raw, { source: 'sessions_spawn' })
          if (!sanitized.ok) {
            throw new Error(sanitized.error || 'system_prompt 注入校验失败')
          }
          return sanitized.value
        })(),
        systemPromptSource: 'sessions_spawn',
        roleName: role_name != null && String(role_name).trim() !== '' ? String(role_name).trim() : undefined,
        runtime: runtime != null && String(runtime).trim() !== '' ? String(runtime).trim() : undefined,
        parentSessionId,
        parentRunId: parentRunId || undefined,
        feishuChatId: context.feishuChatId || context.remoteId || '',
        feishuTenantKey: context.feishuTenantKey || '',
        feishuDocHost: context.feishuDocHost || '',
        feishuSenderOpenId: context.feishuSenderOpenId || '',
        feishuSenderUserId: context.feishuSenderUserId || '',
        stream,
        provider: provider != null && String(provider).trim() !== '' ? String(provider).trim() : undefined,
        model: model && String(model).trim() ? String(model).trim() : undefined,
        projectPath,
        profile: profile != null && String(profile).trim() !== '' ? String(profile).trim() : undefined,
        agent: agent != null && String(agent).trim() !== '' ? String(agent).trim() : undefined,
        waitForResult: wait_for_result !== false
      })

      if (out && out.async && out.accepted) {
        const envelope = buildExecutionEnvelope(
          {
            success: true,
            result: out.message || '后台任务已接受',
            subSessionId: out.sub_session_id || out.subSessionId,
            parentRunId,
            exitKind: 'completed'
          },
          'internal'
        )
        try {
          ingestEnvelopeArtifacts(envelope, {
            sessionId: parentSessionId,
            runSessionId: out.sub_session_id != null ? String(out.sub_session_id) : '',
            parentRunId,
            chatId: String(context.feishuChatId || context.remoteId || ''),
            channel: String(context.channel || ''),
            source: 'sessions_spawn'
          })
        } catch (_) {}
        return {
          success: true,
          message: envelope.summary,
          envelope,
          async: true,
          accepted: true,
          sub_session_id: out.sub_session_id ?? out.subSessionId ?? null,
          parent_run_id: parentRunId || undefined,
          hint: '请用 sessions_subagent_poll(sub_session_id=...) 轮询直至完成。'
        }
      }

      const envelope = buildExecutionEnvelope(out || {}, out?.runtime || 'internal')
      try {
        ingestEnvelopeArtifacts(envelope, {
          sessionId: parentSessionId,
          runSessionId: out?.subSessionId != null ? String(out.subSessionId) : '',
          parentRunId,
          chatId: String(context.feishuChatId || context.remoteId || ''),
          channel: String(context.channel || ''),
          source: 'sessions_spawn'
        })
      } catch (_) {}
      const stdoutPreview = truncateDelegationStdoutPreview(out?.commandLogs)
      if (!out || !out.success) {
        return {
          success: false,
          message: envelope.summary,
          envelope,
          error: out?.error || '子 Agent 执行失败',
          stdout: stdoutPreview
        }
      }
      return {
        success: true,
        message: envelope.summary,
        envelope,
        result: out.result ?? '',
        sub_session_id: out.subSessionId ?? null,
        runtime: out.runtime || 'internal',
        attempted_runtimes: Array.isArray(out.attemptedRuntimes) ? out.attemptedRuntimes : [],
        stdout: stdoutPreview
      }
    } catch (e) {
      const parentRunIdCatch = String(context.runId || '').trim()
      const out = {
        success: false,
        error: e.message || String(e),
        runtime: 'internal',
        parentRunId: parentRunIdCatch || undefined
      }
      const envCatch = buildExecutionEnvelope(out, 'internal')
      try {
        ingestEnvelopeArtifacts(envCatch, {
          sessionId: normalizeParentSessionId(context.sessionId || ''),
          runSessionId: '',
          parentRunId: parentRunIdCatch,
          chatId: String(context.feishuChatId || context.remoteId || ''),
          channel: String(context.channel || ''),
          source: 'sessions_spawn'
        })
      } catch (_) {}
      return { ...out, message: envCatch.summary, envelope: envCatch }
    }
  }

  return { definition, execute }
}

module.exports = { definition, createSessionsSpawnTool }
