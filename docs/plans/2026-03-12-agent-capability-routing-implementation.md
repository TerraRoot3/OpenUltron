# Agent Capability Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a channel-agnostic capability routing and execution/delivery pipeline where main-agent orchestrates, sub-agents execute, and artifacts/messages are consistently delivered.

**Architecture:** Introduce a `Capability Router` + `Execution Envelope` + `Artifact-first Delivery` pipeline. Keep existing behavior via compatibility shims, then migrate Feishu-first flows and expand to other channels with shared interfaces.

**Tech Stack:** Electron main process, existing orchestrator/tool-registry/session-registry, chat-channel adapters (Feishu/Telegram/Dingtalk), Node.js fs/path/crypto, existing artifact registry.

**Priority:** Feishu document authoring/editing is P0 and must be implemented before broad channel parity work.

---

### Task 1: Define normalized execution envelope and adapters

**Files:**
- Create: `electron/ai/execution-envelope.js`
- Modify: `electron/ai/tools/sessions-spawn.js`
- Modify: `electron/main.js`

**Step 1: Add failing compatibility checks (manual assertions/log assertions)**
- Add assertions in run-complete path that envelope fields exist (`success`, `summary`, `artifacts`, `error`).

**Step 2: Run app path to verify assertion fails for old outputs**
Run: `npm run electron:dev`
Expected: legacy outputs trigger missing-field warnings.

**Step 3: Implement envelope normalizer**
- Normalize internal tool-call results and external stdout/stderr into one envelope.
- Map known failure patterns to typed `error.code`.

**Step 4: Wire normalizer into `sessions_spawn` result path**
- `sessions_spawn` must always return envelope JSON.

**Step 5: Verify via smoke flow**
Run: use one internal and one external task.
Expected: both emit normalized envelope logs.

**Step 6: Commit**
```bash
git add electron/ai/execution-envelope.js electron/ai/tools/sessions-spawn.js electron/main.js
git commit -m "feat(agent): normalize subagent outputs with execution envelope"
```

### Task 2: Add capability router and runtime policy

**Files:**
- Create: `electron/ai/capability-router.js`
- Modify: `electron/main.js`
- Modify: `electron/ai/orchestrator.js`

**Step 1: Add failing route tests (table-driven in comments + debug command fixtures)**
- Define sample user inputs and expected route decisions.

**Step 2: Implement route decision model**
- Output `capability`, `runtime`, `delivery_policy`, `risk_level`.
- Default runtime is `internal`; external only when user explicitly requests provider.

**Step 3: Integrate router before spawn dispatch**
- Replace ad-hoc runtime inference branches.

**Step 4: Validate with manual matrix**
Run: 12 prompts (docs author/edit heavy + sheets/bitable/screenshot/package/provider-specific).
Expected: route logs match expected decisions.

**Step 5: Commit**
```bash
git add electron/ai/capability-router.js electron/main.js electron/ai/orchestrator.js
git commit -m "feat(agent): route tasks by capability with explicit runtime policy"
```

### Task 3: Artifact-first delivery (remove text parsing as primary)

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/ai/artifact-registry.js` (or current artifact module)
- Modify: `electron/extensions/adapters/feishu.js`

**Step 1: Add failing case fixtures**
- Case: text contains a path but artifact missing.
- Case: artifact exists but text has no path.

**Step 2: Implement artifact resolution priority**
- Delivery must prefer artifact refs from envelope.
- Text path extraction only fallback with warning log.

**Step 3: Bind artifact to message/run consistently**
- Guarantee `session/run/message` linkage for outbound artifacts.

**Step 4: Validate via scenarios**
- “按上次页面再截一张图发给我” should reuse mapped artifact.
- “把网页整体打包发给我” should send zip artifact.

**Step 5: Commit**
```bash
git add electron/main.js electron/ai/artifact-registry.js electron/extensions/adapters/feishu.js
git commit -m "feat(artifact): prioritize envelope artifacts for channel delivery"
```

### Task 4: Channel delivery interface normalization

**Files:**
- Create: `electron/extensions/channel-delivery-interface.js`
- Modify: `electron/extensions/adapters/feishu.js`
- Modify: `electron/extensions/adapters/telegram.js`
- Modify: `electron/extensions/adapters/dingtalk.js`

**Step 1: Define interface contract**
- `sendText/sendImage/sendFile/sendAudio/sendRich`.

**Step 2: Implement Feishu adapter against interface**
- Convert current mixed `payload` branches to typed methods.

**Step 3: Shim Telegram/Dingtalk to interface**
- Preserve behavior; adapt signatures only.

**Step 4: Validate by sending one payload type per channel**
Expected: all channels log typed delivery attempts with consistent fields.

**Step 5: Commit**
```bash
git add electron/extensions/channel-delivery-interface.js electron/extensions/adapters/feishu.js electron/extensions/adapters/telegram.js electron/extensions/adapters/dingtalk.js
git commit -m "refactor(channel): unify delivery adapters behind typed interface"
```

### Task 5: Run lifecycle reliability and bounded retry

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/ai/session-registry.js`
- Modify: `electron/ai/tools/feishu-send-message.js`

**Step 1: Add failure-policy table**
- Map error codes to `retryable/non-retryable`.

**Step 2: Enforce bounded retries per action**
- Max retries by category; no infinite loop for invalid params.

**Step 3: Ensure terminal state is emitted once**
- Add completion guard keyed by run session id.

**Step 4: Validate with induced failures**
- invalid receive_id
- invalid file format
- network timeout
Expected: deterministic terminal states and user-facing result.

**Step 5: Commit**
```bash
git add electron/main.js electron/ai/session-registry.js electron/ai/tools/feishu-send-message.js
git commit -m "fix(agent): enforce bounded retries and single terminal run state"
```

### Task 6: Capability packages for Feishu docs/sheets/bitable

**Files:**
- Create: `electron/ai/capabilities/feishu-docs.js`
- Create: `electron/ai/capabilities/feishu-sheets.js`
- Create: `electron/ai/capabilities/feishu-bitable.js`
- Modify: `electron/ai/tool-registry.js`
- Modify: `electron/ai/orchestrator.js`

**Step 1: Add package APIs wrapping existing MCP tool calls**
- Keep parameter validation and common error mapping in wrappers.

**Step 2: Route capability calls through wrappers**
- AI decides intent; wrappers enforce schema and retry policy.

**Step 3: Implement Feishu docs P0 operations first**
- `doc.create_from_prompt`
- `doc.append_section`
- `doc.rewrite_selection`
- `doc.expand_outline`
- `doc.polish_document`
- `doc.export_and_send`

**Step 4: Validate Feishu docs end-to-end scenarios**
- “帮我写一份项目周报并保存为飞书文档”
- “把第 2 节改成正式语气并保留要点”
- “在结尾追加风险与行动项”
- “导出 docx 并发送到当前会话”
Expected: all operations return stable envelope + artifact refs + delivery result.

**Step 5: Add sheets/bitable baseline wrappers**
- read sheet range
- create/search/update bitable record

**Step 6: Commit**
```bash
git add electron/ai/capabilities electron/ai/tool-registry.js electron/ai/orchestrator.js
git commit -m "feat(feishu-capability): add docs/sheets/bitable capability wrappers"
```

### Task 7: Observability and troubleshooting baseline

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/ai/orchestrator.js`
- Modify: `electron/extensions/adapters/feishu.js`
- Create: `docs/plans/2026-03-12-agent-capability-routing-observability.md`

**Step 1: Add structured logs for key events**
- `CapabilityRouteDecision`, `EnvelopeNormalize`, `ArtifactResolve`, `DeliveryAttempt`, `RunStateTransition`.

**Step 2: Ensure log redaction policy**
- mask secrets/tokens/file content.

**Step 3: Add troubleshooting doc with decision tree**
- missing file send
- wrong screenshot
- run completed too early
- external provider timeout.

**Step 4: Commit**
```bash
git add electron/main.js electron/ai/orchestrator.js electron/extensions/adapters/feishu.js docs/plans/2026-03-12-agent-capability-routing-observability.md
git commit -m "chore(observability): add structured diagnostics for capability pipeline"
```

### Task 8: Regression checklist and release gating

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Create: `scripts/check-capability-pipeline.sh`

**Step 1: Add pre-release check script**
- static syntax checks for touched files (`node --check ...`).
- grep for required log events in app.log sample run.

**Step 2: Document operational runbook**
- startup checks
- failure handling
- known limits.

**Step 3: Final verification**
Run:
- `node --check electron/main.js`
- `node --check electron/ai/orchestrator.js`
- `node --check electron/extensions/adapters/feishu.js`
- `bash scripts/check-capability-pipeline.sh`
Expected: pass.

Add mandatory Feishu docs regression:
- create doc from prompt
- rewrite selected section
- append section
- export docx and send in-channel

**Step 4: Commit**
```bash
git add README.md README.en.md scripts/check-capability-pipeline.sh
git commit -m "docs(release): add capability pipeline verification and runbook"
```

## Milestone Acceptance

1. Main-agent final reply must match sub-agent terminal envelope status.
2. Zip/doc/image/audio delivery success rate in Feishu improves and invalid-param loops are eliminated.
3. External agent output appears in main session live card, but only summary is persisted in final history.
4. "Previous artifact" requests resolve by mapping, not by random path reuse.
5. Same task can be routed to non-Feishu channels without business logic duplication.
6. Feishu docs author/edit P0 capability reaches release quality (>=95% success in scripted regression set).

## Rollback Strategy

1. Keep compatibility shim toggle: `capability_router_enabled`.
2. Keep old text-path extraction fallback until Milestone 2 passes.
3. Allow channel adapter fallback to legacy `send(binding, payload)` branch by feature flag.

## Delivery Sequence (Enforced)

1. Complete Task 1-3.
2. Execute Task 6 (Feishu docs P0) before Task 4 cross-channel normalization.
3. After Feishu docs P0 passes regression, continue Task 4/7/8.

Plan complete and saved to `docs/plans/2026-03-12-agent-capability-routing-implementation.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks.
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints.
