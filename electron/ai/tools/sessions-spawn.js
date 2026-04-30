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
  description: '派生子 Agent 执行一项可独立完成的子任务。适合多文件改造、独立调研/审查、耗时生成、可并行验证、或需要隔离上下文的任务；简单问答、单文件小改、一次工具调用能完成的任务不要派生。子 Agent 在独立会话中运行，最后返回最终回复文本；必须说明是否完成、改了哪些路径/文件、如何验证，不能只沉默改文件。工具返回值含 message 与 envelope.summary，会同步给主会话汇总。profile 建议：executor=执行改动，read_only_fast=只读探索/审查，coordinator=复杂任务二级编排。runtime 默认 auto；指定 provider/model 前建议先确认可用。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '交给子 Agent 执行的任务描述（作为一条 user 消息）。必须写清输入、目标、交付物、禁止事项和最终汇总要求。' },
      system_prompt: { type: 'string', description: '可选。注入子 Agent 的 system 提示，用于限定角色或步骤；不要放与任务无关的长上下文。' },
      role_name: { type: 'string', description: '可选。子 Agent 的角色名/显示名，便于在对话中区分（如「代码审查员」「翻译助手」）' },
      runtime: { type: 'string', description: '可选。子 Agent 运行时：auto（默认，先尝试可用外部子 Agent，失败自动回退）/ internal（仅内置）/ external:<name>。建议值：external:codex、external:claude、external:gateway（兼容别名 external:gateway_cli）、external:opencode。网关 CLI 可设环境变量 OPENULTRON_GATEWAY_CLI 指定可执行文件名。只会使用本机可用 CLI。' },
      provider: { type: 'string', description: '可选。子 Agent 使用的供应商：供应商名称（如「OpenAI」「DeepSeek」）或 base_url；不传则使用当前默认供应商' },
      model: { type: 'string', description: '可选。子 Agent 使用的模型 ID。根据任务复杂度选择：简单任务选 fast 模型；复杂代码/推理任务选 reasoning 模型。优先选已验证可用模型。' },
      project_path: { type: 'string', description: '可选。子 Agent 的项目路径上下文，默认与主会话一致' },
      profile: { type: 'string', description: '可选。子 Agent 配置 profile（executor / read_only_fast / coordinator 或 .openultron/agents/*.md），默认 executor。只读探索/审查用 read_only_fast；需要实际改动用 executor；只有需要二级编排时用 coordinator。' },
      agent: { type: 'string', description: '可选。与 profile 同义，便于兼容' },
      wait_for_result: { type: 'boolean', description: '默认 true（同步等待子 Agent 跑完）。仅长任务且用户可接受后台执行时设 false；之后必须用 sessions_subagent_poll(sub_session_id) 获取结果再汇总。' }
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
