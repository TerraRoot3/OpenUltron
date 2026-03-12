# Agent Capability Routing Design (Channel-Agnostic)

## Background

Current behavior mixes orchestration, tool parameter shaping, and channel-specific delivery logic across main-agent and sub-agent flows. This causes:
- Result text and artifact delivery divergence ("task done" but no file/image delivered).
- External sub-agent output not consistently surfaced to main-agent state.
- Channel coupling (Feishu-specific behavior leaking into generic flows).
- Weak recovery semantics for tool failure/retry/cancel.

## Goals

1. Keep main-agent as orchestrator only: dispatch, state tracking, and user-facing status/result.
2. Move execution details to sub-agents (internal/external), but normalize their outputs into one contract.
3. Provide channel-agnostic delivery semantics, with adapter-specific implementation.
4. Guarantee artifact lifecycle consistency (create, map, deliver, replay, audit).
5. Enable incremental rollout without breaking current Feishu flows.
6. Prioritize Feishu document authoring/editing capabilities (create, append, rewrite, structured update, template-based generation).

## Non-Goals

1. Rewriting all existing tools in one release.
2. Replacing current chat session storage format.
3. Introducing multi-tenant distributed backend (local app architecture remains).

## Architecture

### 1) Capability Router

A new router resolves user intent into capability domains, then decides execution strategy:
- `docs` (docx/wiki/document read/write)
- `sheets` (sheet read/write)
- `bitable` (query/create/update)
- `browser` (open/navigate/screenshot)
- `artifact` (package/download/send/replay)
- `message` (channel reply/send)

Router output:
- `capability`
- `execution_mode` (`internal` | `external:<provider>`)
- `delivery_policy` (`auto_send` | `defer` | `tool_only`)
- `risk_level` (`safe` | `confirm_required`)

Feishu docs capability is first-class and must be resolved before generic text-generation fallback when user intent includes:
- write/create doc
- revise/update sections
- generate meeting notes/report/spec from prompt
- rewrite tone/structure
- continue writing based on existing doc

### 2) Unified Execution Contract

All sub-agent runs return a single envelope:
- `success`
- `summary`
- `artifacts[]`
- `logs[]`
- `tool_events[]`
- `error { code, message, retriable }`
- `metrics { elapsed_ms, retries, runtime }`

Main-agent only reads this envelope. It never parses provider-specific stdout protocol directly in business logic.

### 3) Artifact Hub (Source of Truth)

All generated/downloaded files are registered with immutable IDs:
- `artifact_id`
- `path`
- `mime/ext`
- `size`
- `sha256`
- `source` (`tool`, `subagent`, `download`, `manual_upload`)
- `session_id`, `run_id`, `message_id`
- `channel_refs` (sent message ids per channel)

Capabilities:
- resolve "send previous screenshot/file" by latest relevant artifact mapping.
- dedupe by content hash.
- prevent cross-run mistaken attachments.

### 4) Channel Delivery Interface

Introduce channel-agnostic interface:
- `sendText(binding, text)`
- `sendImage(binding, image)`
- `sendFile(binding, file)`
- `sendAudio(binding, audio)`
- `sendRich(binding, card/post)`

Feishu/Telegram/Dingtalk adapters implement these methods internally.
Main-agent produces `DeliveryPayload` only.

### 5) Run State Machine

Canonical states:
- `queued`
- `running`
- `tool_running`
- `waiting_user`
- `completed`
- `failed`
- `cancelled`

Rules:
- completion is emitted exactly once.
- retries are bounded and reasoned by `error.code` + `retriable`.
- progressive notice starts at 60s, then +60s intervals, max 5 times.

## Data Contracts

### TaskContext
- `session_id`
- `main_session_id`
- `run_session_id`
- `channel`
- `remote_id/chat_id`
- `user_message_id`
- `intent_hint`

### DeliveryPayload
- `text`
- `images[]` (artifact ref or base64)
- `files[]` (artifact ref)
- `audio[]`
- `meta` (run, capability, provider)

### Error Codes (minimum)
- `INVALID_PARAM`
- `AUTH_ERROR`
- `NETWORK_TIMEOUT`
- `RATE_LIMIT`
- `UNSUPPORTED_FORMAT`
- `RENDER_NOT_READY`
- `MISSING_CONTEXT`
- `CANCELLED`

## Feishu Document Capability Profile (P0)

### Supported operations

1. `doc.create_from_prompt`
- Input: title, topic/prompt, style, length, language.
- Output: document id/url + artifact ref.

2. `doc.append_section`
- Input: document id/url, section heading, content prompt.
- Output: appended block metadata.

3. `doc.rewrite_selection`
- Input: document id/url, selection locator (heading/paragraph range), rewrite instruction.
- Output: before/after summary + change block refs.

4. `doc.expand_outline`
- Input: document id/url or raw outline text.
- Output: expanded sections with heading hierarchy.

5. `doc.polish_document`
- Input: document id/url, target audience/tone.
- Output: normalized style report + changed paragraphs.

6. `doc.export_and_send`
- Input: document id/url, target format (docx/pdf), channel binding.
- Output: exported artifact + delivery result.

### Safety constraints

1. Destructive rewrite across whole document requires confirmation.
2. If locator ambiguity > 1 candidate, ask user to disambiguate.
3. If document cannot be resolved from context, ask for link or select from recent docs.

### Context resolution order

1. current run bound doc id
2. same session last successful doc artifact
3. explicit URL in user text
4. recent docs list (top N) with confirmation

## Rollout Plan

### Phase 1: Contract + Shim
- Add envelope/contract and map current internal/external outputs to it.
- Keep old behavior through compatibility shim.

### Phase 2: Artifact-Centric Delivery
- All outbound images/files must come from artifact refs.
- Remove raw-path text parsing as primary path (keep fallback only).

### Phase 3: Capability Packages
- Implement docs/sheets/bitable/browser domain handlers with router mapping.
- Add risk/confirmation policies per capability.
- P0 must ship with Feishu docs full authoring/editing profile before expanding Sheets/Bitable breadth.

### Phase 4: Cross-Channel Normalization
- Move Feishu-special handling behind adapter methods.
- Reuse identical payload pipeline for Telegram/Dingtalk.

## Observability

Required structured logs:
- `CapabilityRouteDecision`
- `SubAgentDispatchStart/Finish`
- `EnvelopeNormalize`
- `ArtifactRegister/Bind/Resolve`
- `DeliveryAttempt/Success/Fail`
- `RunStateTransition`

Required metrics:
- delivery success rate by channel/type
- artifact resolution hit rate
- retry count and terminal failure by error code
- false-positive completion count (must be zero)

## Backward Compatibility

1. Existing tools remain callable.
2. Old text-path extraction remains fallback with warning logs.
3. Existing Feishu command flows remain operational while adapter migrates to interface.

## Acceptance Criteria

1. "打包发我" sends zip successfully or returns deterministic failure with non-retriable reason.
2. "按上次页面再截一张" resolves last relevant artifact/session context without regenerating unrelated assets.
3. Main-agent state and user-visible status always match terminal run result.
4. External provider failures are captured in envelope and surfaced to user.
5. No channel-specific business logic in capability router.
6. Feishu docs scenarios pass:
- “帮我写一份周报并存成飞书文档”
- “把第2节改成更正式语气”
- “在结尾追加风险与行动项”
- “导出并发我 docx”
