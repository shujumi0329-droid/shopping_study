# MTurk Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-authoritative identity bridge that supports MTurk production, MTurk preview, and full internal testing while preserving the existing SurveyCake and shopping-task behavior.

**Architecture:** Vercel becomes the identity authority. `/start` and `/test` create a signed HttpOnly bridge session, persist its mapping through Apps Script, and redirect to SurveyCake; Shopping later resolves the same session through `/api/session`, while `/api/event` independently verifies the signed cookie and overwrites all client identity fields. Google Sheets remains the persistent store and gains `Bridge_Sessions` plus `run_mode`/`recruitment_source` columns.

**Tech Stack:** Vercel Node.js 24 serverless functions, Web Crypto/Node `crypto`, browser JavaScript, Google Apps Script, Google Sheets, Node built-in `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-03-mturk-bridge-design.md`

## Global Constraints

- Preserve SurveyCake as the questionnaire system and preserve the existing close/history return behavior.
- Preserve all 24 products, product images, prices, 1–7 selection constraint, Page 2 review requirement, and existing event names.
- Google Sheets remains the persistent research-data store; no new database is introduced.
- Do not commit `BRIDGE_SIGNING_SECRET`, `INTERNAL_TEST_TOKEN`, researcher passwords, or spreadsheet identifiers.
- Normal shopping events must use server-authoritative bridge identity; direct unlinked Shopping access must not create normal research events.
- Internal and preview data must be recorded but explicitly distinguishable from production.

---

### Task 1: Bridge cryptography and session primitives

**Files:**
- Create: `api/_bridge.js`
- Create: `tests/bridge.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `deriveProductionJoinId(assignmentId, secret) -> string`, `createRandomJoinId(prefix) -> string`, `signBridgeSession(session, secret, nowMs?) -> string`, `verifyBridgeSession(token, secret, nowMs?) -> object|null`, `parseCookieHeader(header) -> object`, `serializeBridgeCookie(token, maxAgeSeconds) -> string`, `readBridgeSession(req) -> object|null`.

- [ ] **Step 1: Write failing bridge tests**

Create `tests/bridge.test.js` using `node:test` and `assert/strict`. Tests must assert: same assignment + secret gives the same `ST_` ID; different assignments differ; random IDs use `TEST_`/`PREVIEW_`; signed token verifies; modified token fails; expired token fails; cookie parser finds `shopping_bridge`; serializer includes `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=21600`.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/bridge.test.js`
Expected: FAIL because `api/_bridge.js` does not exist.

- [ ] **Step 3: Implement bridge primitives**

Use only Node built-ins. Production IDs are `ST_` + first 24 uppercase hex chars of `HMAC-SHA256(secret, assignmentId)`. Random IDs use `crypto.randomBytes(12).toString('hex').toUpperCase()`. Signed session tokens are `base64url(JSON payload) + '.' + base64url(HMAC-SHA256(secret, encodedPayload))`; payload includes `join_id`, `run_mode`, `recruitment_source`, MTurk identifiers, `iat`, and `exp`. Verification uses `timingSafeEqual`, rejects malformed/expired tokens, and normalizes text lengths.

- [ ] **Step 4: Add test script and run tests**

Modify `package.json` to include `"scripts":{"test":"node --test tests/*.test.js"}`. Run `npm test`; expected PASS.

- [ ] **Step 5: Commit**

Commit message: `Add signed bridge session primitives`.

---

### Task 2: Bridge entry routes and read-only session endpoint

**Files:**
- Create: `api/start.js`
- Create: `api/test.js`
- Create: `api/session.js`
- Create: `tests/bridge-routes.test.js`
- Modify: `api/_collector.js`

**Interfaces:**
- Consumes: Task 1 bridge helpers and existing `collectorGet`/`collectorPost`.
- Produces: `/api/start`, `/api/test`, `/api/session`; collector helper `persistBridgeStart(session)` implemented as `collectorPost({action:'BRIDGE_START', ...})`.

- [ ] **Step 1: Write failing handler tests**

Use minimal mock `req`/`res` objects. Tests must cover: production `/start` rejects missing assignment with 400; preview sentinel creates `run_mode=preview`; production creates `run_mode=production`; `/test` rejects wrong token with 403; valid `/test` creates `run_mode=internal`; all successful entry routes persist before redirect, set the signed cookie, and redirect to configured SurveyCake URL; `/api/session` returns `{linked:false}` without a valid cookie and returns authoritative identity with a valid cookie.

Inject collector dependencies through exported pure handler factories (`makeStartHandler`, `makeTestHandler`) so tests never call the real collector.

- [ ] **Step 2: Run route tests and confirm failure**

Run: `node --test tests/bridge-routes.test.js`
Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement `/api/start`**

Read `assignmentId`, `workerId`, `hitId`. Classify `ASSIGNMENT_ID_NOT_AVAILABLE` as preview with random `PREVIEW_` ID; otherwise require a non-empty assignment and derive deterministic `ST_` ID. Load `survey_url` with `collectorGet({action:'config'})`, persist bridge mapping with `collectorPost({action:'BRIDGE_START', ...})`, set six-hour signed cookie, return HTTP 302 to SurveyCake. On missing SurveyCake URL return 503 without redirect.

- [ ] **Step 4: Implement `/api/test` and `/api/session`**

`/api/test` requires `access === process.env.INTERNAL_TEST_TOKEN`, generates random `TEST_` ID, persists `run_mode=internal`, sets cookie, and redirects. `/api/session` never creates identity; it verifies the cookie and returns `{ok:true,linked:false}` or `{ok:true,linked:true,join_id,run_mode,recruitment_source,assignment_id,worker_id,hit_id}` with `Cache-Control:no-store`.

- [ ] **Step 5: Run all tests**

Run: `npm test`; expected PASS.

- [ ] **Step 6: Commit**

Commit message: `Add MTurk and internal bridge entry routes`.

---

### Task 3: Make event identity server-authoritative

**Files:**
- Modify: `api/event.js`
- Create: `tests/event-identity.test.js`

**Interfaces:**
- Consumes: `readBridgeSession(req)` from Task 1.
- Produces: ordinary event payloads whose `join_id`, `assignment_id`, `worker_id`, `hit_id`, `run_mode`, and `recruitment_source` come only from the verified bridge cookie.

- [ ] **Step 1: Write failing event identity tests**

Refactor `api/event.js` to export `makeEventHandler({collectorPostImpl, readBridgeSessionImpl})` plus the default handler. Tests assert unlinked request returns 401 and never calls collector; linked request with spoofed body identity is forwarded using signed session identity; existing product and selection validation still rejects invalid payloads.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test tests/event-identity.test.js`
Expected: FAIL until handler is refactored.

- [ ] **Step 3: Implement authoritative identity override**

Require a valid bridge session before normal shopping events. Keep current `event_id`, product, selected-count, and CONTINUE consistency validation. Build collector payload with identity exclusively from bridge session and append `run_mode` and `recruitment_source`. Client `session_id` remains diagnostic and may come from the body.

- [ ] **Step 4: Run all tests**

Run: `npm test`; expected PASS.

- [ ] **Step 5: Commit**

Commit message: `Require bridge identity for shopping events`.

---

### Task 4: Persist bridge mapping and run mode in Apps Script

**Files:**
- Modify: `shopping-study/AppsScript_Collector.gs`
- Create: `tests/appsscript-schema.test.js`

**Interfaces:**
- Consumes: `BRIDGE_START` action from Task 2 and ordinary event payload from Task 3.
- Produces: `Bridge_Sessions` sheet mapping plus `run_mode`/`recruitment_source` in `Event_Log` and `Participants`.

- [ ] **Step 1: Write failing schema/static contract tests**

The test reads `shopping-study/AppsScript_Collector.gs` and asserts presence of `BRIDGE_SHEET = "Bridge_Sessions"`, `data.action === "BRIDGE_START"`, a `handleBridgeStart_` function, event row fields `data.run_mode` and `data.recruitment_source`, and participant writes for columns 20–21. It also asserts existing `eventExists_` deduplication and `CONTINUE` behavior remain present.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/appsscript-schema.test.js`; expected FAIL.

- [ ] **Step 3: Implement bridge-sheet persistence**

Add `BRIDGE_SHEET`, `ensureBridgeSheet_`, and `handleBridgeStart_`. `ensureBridgeSheet_` creates the sheet if absent and writes the exact nine headers from the spec. `handleBridgeStart_` validates `join_id` and allowed `run_mode`, upserts by `join_id`, preserves initial `created_at`, updates `last_seen_at`, and writes MTurk identifiers/source/version.

- [ ] **Step 4: Extend event/participant schema**

Append `run_mode` and `recruitment_source` to each new Event_Log row. Ensure Event_Log header cells U1:V1 and Participants T1:U1 contain those labels. New participant rows write mode/source to columns 20–21; existing participant rows update these values on each event. Do not alter existing columns 1–19.

- [ ] **Step 5: Run all tests**

Run: `npm test`; expected PASS.

- [ ] **Step 6: Commit**

Commit message: `Persist bridge mappings and run modes`.

---

### Task 5: Bootstrap Shopping from bridge session and block unlinked direct access

**Files:**
- Modify: `shopping-study-vercel/index.html`
- Create: `tests/frontend-bridge.test.js`

**Interfaces:**
- Consumes: `/api/session` from Task 2.
- Produces: Shopping event payloads that use the linked bridge identity for display/diagnostics and never start ordinary event logging when unlinked.

- [ ] **Step 1: Write failing frontend contract tests**

Static tests read the HTML and assert it fetches `/api/session` before sending `OPEN`, no longer sets `joinId` from `assignmentId || sessionId`, and contains an explicit unlinked message directing MTurk users to the study link and internal testers to `/test`. Tests also assert existing Page 2 gating, selection limits, and return functions are still present.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/frontend-bridge.test.js`; expected FAIL.

- [ ] **Step 3: Implement asynchronous bridge bootstrap**

Keep browser `sessionId` generation for diagnostics. On load call `/api/session`. If linked, copy authoritative IDs to a `bridge` object, then render and send `OPEN`. Event payload still includes identity fields for observability, but server remains authoritative. If unlinked, render a blocking panel and do not call `/api/event`.

- [ ] **Step 4: Preserve return behavior**

Do not change `window.close()`, `history.back()`, or manual-return fallback semantics. Ensure Continue still waits for successful event save before returning.

- [ ] **Step 5: Run all tests**

Run: `npm test`; expected PASS.

- [ ] **Step 6: Commit**

Commit message: `Bootstrap shopping task from bridge session`.

---

### Task 6: Friendly routes and operator documentation

**Files:**
- Modify: `vercel.json`
- Modify: `README.md`
- Create: `tests/config-contract.test.js`

**Interfaces:**
- Produces: `/start` -> `/api/start`, `/test` -> `/api/test`, documented environment variables and entry URLs.

- [ ] **Step 1: Write failing config contract tests**

Assert `vercel.json` contains rewrites for `/start` and `/test`, and README documents `BRIDGE_SIGNING_SECRET`, `INTERNAL_TEST_TOKEN`, production `/start`, internal `/test`, MTurk preview handling, canonical-host requirement, and `run_mode=production` analysis filter.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/config-contract.test.js`; expected FAIL.

- [ ] **Step 3: Add rewrites and documentation**

Add rewrites without changing existing root/Shopping rewrites. README must show conceptual URLs but never actual secret values. Explain that SurveyCake's Shopping link must return to the same canonical Vercel hostname used by `/start` or `/test`.

- [ ] **Step 4: Run full test suite**

Run: `npm test`; expected PASS.

- [ ] **Step 5: Commit**

Commit message: `Document bridge entry and internal test workflow`.

---

### Task 7: Deploy and verify without production-data contamination

**Files:**
- No source change unless verification exposes a defect.

**Interfaces:**
- Consumes: completed GitHub main and Vercel project `shopping-study-live-20260902`.
- Produces: verified production deployment and an operational internal-test entry link.

- [ ] **Step 1: Configure private Vercel environment**

Set high-entropy `BRIDGE_SIGNING_SECRET` and a separate `INTERNAL_TEST_TOKEN` in the production/preview environments, keeping `SHOPPING_COLLECTOR_URL` intact. Never print secret values in logs or final output.

- [ ] **Step 2: Deploy current GitHub main to the existing production project**

Do not create a new long-term production project unless the existing project is inaccessible. Preserve the canonical production hostname.

- [ ] **Step 3: Verify read-only endpoints**

Confirm deployment `READY`, `/api/config` returns 200, direct `/api/session` returns linked=false, direct Shopping access shows the unlinked panel and does not produce a normal event.

- [ ] **Step 4: Verify internal flow**

Use `/test?access=<token>` to create an internal session, confirm redirect to SurveyCake and bridge cookie creation, then use the same browser session to open Shopping. Verify Apps Script/Sheet contains one `Bridge_Sessions` row and Shopping records with one `TEST_...` join ID and `run_mode=internal`. Delete only explicit diagnostic rows if the test is not intended to remain as QA history.

- [ ] **Step 5: Verify preview classification**

Call `/start?assignmentId=ASSIGNMENT_ID_NOT_AVAILABLE` in a controlled session and confirm `PREVIEW_...`, `run_mode=preview`, and no production label.

- [ ] **Step 6: Verify production classification without using a real participant**

Use a clearly synthetic diagnostic assignment ID in a controlled browser session, verify deterministic `ST_...`, `run_mode=production`, and mapping fields. Remove the explicitly synthetic diagnostic rows after verification.

- [ ] **Step 7: Verify runtime health**

Check current production deployment runtime errors and confirm no new 5xx clusters for `/api/start`, `/api/test`, `/api/session`, `/api/event`, or `/api/config`.

- [ ] **Step 8: Final repository and deployment verification**

Confirm GitHub main includes all expected commits, `npm test` passes, production deployment is READY, and no product/catalog or SurveyCake-return regression was introduced.