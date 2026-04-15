# System Proxy Default Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make OpenUltron follow the OS system proxy by default when manual proxy is not enabled, while preserving manual proxy precedence when it is configured.

**Architecture:** Keep proxy precedence centralized in `proxy-and-ai-config-helpers.js`. Split the logic into two layers: Node-side environment proxy application and Electron-session proxy application. Reuse the same manual-vs-system decision in startup and proxy-save flows.

**Tech Stack:** Electron main process, `session.setProxy`, macOS `scutil --proxy`, Vitest.

---

### Task 1: Add failing tests for proxy precedence

**Files:**
- Create: `electron/main-process/proxy-and-ai-config-helpers.test.js`
- Modify: `electron/main-process/proxy-and-ai-config-helpers.js`

**Step 1: Write the failing tests**

Cover:
- manual proxy enabled => manual env wins
- manual proxy disabled => system env fallback wins
- no manual proxy and no system proxy => env cleared
- session proxy picks `fixed_servers` for manual proxy and `system` otherwise

**Step 2: Run test to verify it fails**

Run: `npm test -- electron/main-process/proxy-and-ai-config-helpers.test.js`

**Step 3: Write minimal implementation**

Add helper functions to resolve effective proxy source and apply session proxy.

**Step 4: Run test to verify it passes**

Run: `npm test -- electron/main-process/proxy-and-ai-config-helpers.test.js`

### Task 2: Wire startup path

**Files:**
- Modify: `electron/main-process/ai-core-stack-bootstrap.js`
- Modify: `electron/main-process/app-ready-bootstrap.js`
- Modify: `electron/main.js`

**Step 1: Route startup env proxy through the new helper**

Keep existing bootstrap call site, but let helper fall back to system proxy automatically.

**Step 2: Apply Electron session proxy**

On app ready, apply proxy config to `session.defaultSession` and `persist:main`.

**Step 3: Run focused verification**

Run: `npm test -- electron/main-process/proxy-and-ai-config-helpers.test.js`

### Task 3: Wire save flow

**Files:**
- Modify: `electron/main-process/ipc/ai/ai-config-proxy-ipc.js`

**Step 1: Re-apply both env and session proxy after saving**

When user saves proxy settings, immediately recompute effective proxy and apply to BrowserWindow sessions.

**Step 2: Run focused verification**

Run: `npm test -- electron/main-process/proxy-and-ai-config-helpers.test.js`
