# MTurk bridge and internal-test design

Date: 2026-09-03

## Goal

Guarantee that shopping-task records can be mapped back to the recruitment record while keeping the existing SurveyCake questionnaire session and allowing full end-to-end internal testing before an MTurk HIT is live.

The bridge must not depend on SurveyCake preserving or forwarding query parameters. Vercel is the identity authority for the shopping task; Google Sheets remains the persistent research-data store.

## Current system to preserve

- SurveyCake remains the questionnaire system.
- `shopping-study-vercel/index.html` remains the participant shopping task.
- `/api/event` remains the only participant-event write endpoint exposed by Vercel.
- Google Apps Script remains the collector and writes `Event_Log` and `Participants`.
- Shopping return behavior continues to restore the existing SurveyCake tab/history rather than reopening the plain SurveyCake URL.
- Product stimuli, selection constraints, event names, and selection behavior do not change.

## Architecture

The canonical Vercel hostname used for `/start`, `/test`, and the Shopping link inside SurveyCake must be the same hostname so that the bridge cookie is available when the participant returns from SurveyCake to Shopping.

### Production MTurk flow

1. MTurk opens `/start?assignmentId=...&workerId=...&hitId=...` on the canonical Vercel hostname.
2. `/start` validates the MTurk parameters.
3. Vercel derives a stable opaque `join_id` from the MTurk `assignmentId` using HMAC-SHA256 and a private `BRIDGE_SIGNING_SECRET`. The raw assignment ID is not used as the public join ID.
4. Vercel writes/updates a `Bridge_Sessions` record through the Google Apps Script collector before redirecting.
5. Vercel sets a signed, HttpOnly, Secure, SameSite=Lax bridge cookie containing the authoritative bridge identity and metadata.
6. `/start` reads the configured SurveyCake URL from the collector and redirects there.
7. SurveyCake may use its existing fixed Shopping URL. It does not need to forward `join_id` or any MTurk parameters.
8. When Shopping opens on the same Vercel hostname, `/api/session` reads and verifies the bridge cookie.
9. Shopping uses the returned session state. `/api/event` independently verifies the cookie and overrides identity fields with the authoritative server-side values before forwarding the event to Apps Script.
10. Shopping returns to the original SurveyCake browser session using the existing close/history logic.

### Internal-test flow

1. Internal testers use `/test?access=<internal-test-token>` on the same canonical hostname.
2. Vercel verifies `INTERNAL_TEST_TOKEN` server-side. The token is never stored in research data and is not forwarded to SurveyCake.
3. Vercel creates a random `TEST_...` join ID and a bridge record with `run_mode=internal` and `recruitment_source=internal_test`.
4. Vercel sets the same signed bridge cookie and redirects to the same SurveyCake questionnaire.
5. The remainder of the flow is identical to production: SurveyCake -> Shopping -> Apps Script -> Google Sheet -> return to the existing SurveyCake session.
6. Internal-test events are retained for QA but are explicitly filterable from analysis.

### MTurk preview flow

If `assignmentId=ASSIGNMENT_ID_NOT_AVAILABLE`, `/start` creates a random `PREVIEW_...` bridge session with `run_mode=preview` and `recruitment_source=mturk_preview`. Preview users can run the whole questionnaire/shopping pipeline, but their records are never labeled production.

### Direct/unlinked Shopping access

Opening the Shopping root directly without a valid bridge cookie must not silently create a production participant. `/api/session` reports an unlinked state and the Shopping UI shows a clear entry-link message instead of recording normal research events. Internal testers must start from `/test`; MTurk users must start from `/start`.

## Identity model

### Authoritative fields

- `join_id`: opaque study-session key used across bridge, `Participants`, and `Event_Log`.
- `run_mode`: `production`, `internal`, or `preview`.
- `recruitment_source`: `mturk`, `internal_test`, or `mturk_preview`.
- `assignment_id`: MTurk assignment ID when available.
- `worker_id`: MTurk-provided worker ID when available.
- `hit_id`: MTurk HIT ID when available.
- `session_id`: browser shopping-session identifier; retained only as a diagnostic identifier and not used as the cross-system primary key.

### Production join-ID derivation

Production `join_id` is deterministic for one MTurk assignment so reopening `/start` for the same assignment does not create a second research identity. It is generated from an HMAC of the assignment ID with `BRIDGE_SIGNING_SECRET` and exposed with an `ST_` prefix. The full MTurk assignment ID is still stored separately for audit/matching.

Internal and preview sessions use cryptographically random IDs with `TEST_` and `PREVIEW_` prefixes respectively.

## Server-side session cookie

The bridge cookie is signed with HMAC-SHA256 using `BRIDGE_SIGNING_SECRET` and is never trusted without signature verification.

Cookie properties:

- HttpOnly
- Secure
- SameSite=Lax
- Path=/
- six-hour lifetime

The signed payload contains the join ID, run mode, recruitment source, MTurk identifiers when present, issue time, and expiration time. `/start` and `/test` overwrite any previous bridge cookie to avoid accidental mode carryover.

## Persistent mapping

Google Apps Script gains a `Bridge_Sessions` sheet. It is created automatically with a fixed schema if absent.

Columns:

1. `join_id`
2. `run_mode`
3. `recruitment_source`
4. `assignment_id`
5. `worker_id`
6. `hit_id`
7. `created_at`
8. `last_seen_at`
9. `study_version`

`BRIDGE_START` is an Apps Script collector action, separate from ordinary shopping events. Production bridge starts upsert on `join_id`; internal and preview starts create their own random join IDs.

The bridge write must succeed before redirecting to SurveyCake. If the mapping cannot be persisted, the participant receives an initialization error rather than proceeding with an unlinked study session.

## Event and participant schema

Ordinary shopping events retain the current event schema and additionally carry server-authoritative:

- `run_mode`
- `recruitment_source`

`Event_Log` appends these as columns 21 and 22. `Participants` stores them as columns 20 and 21. Apps Script ensures the header labels exist without modifying prior rows.

This allows analysis to filter `run_mode=production` while retaining internal and preview records for QA.

## SurveyCake worker-ID field

The existing SurveyCake question asking participants to type their MTurk Worker ID is retained. It becomes an independent quality-control field rather than the primary technical key.

After export:

- `Bridge_Sessions.worker_id` is the MTurk-supplied Worker ID captured automatically at `/start`.
- the SurveyCake reported Worker ID can be compared against it.
- mismatches can be flagged during data cleaning.

The bridge does not require SurveyCake to expose or preserve a hidden join ID. If a future SurveyCake integration can export `join_id`, that can be added as an additional validation field, but it is not required for this design.

## New Vercel routes and modules

- `api/_bridge.js`: cryptographic ID generation, cookie signing/verifying, cookie parsing/serialization, session normalization.
- `api/start.js`: production/preview MTurk bridge entry; persist mapping; set cookie; redirect to SurveyCake.
- `api/test.js`: internal-test bridge entry; verify internal token; persist mapping; set cookie; redirect to SurveyCake.
- `api/session.js`: read-only session state for the Shopping frontend.
- `api/event.js`: require a valid bridge session for normal research events and replace client-supplied identity fields with server-authoritative identity.
- `shopping-study/AppsScript_Collector.gs`: `BRIDGE_START`, bridge-sheet management, and run-mode/source persistence.
- `shopping-study-vercel/index.html`: bootstrap from `/api/session`; block unlinked direct access; preserve all existing Shopping and return behavior.
- `vercel.json`: optional explicit friendly rewrites `/start` -> `/api/start` and `/test` -> `/api/test` if required by Vercel routing.
- `README.md`: document production, preview, and internal-test entry URLs plus private environment configuration.

## Private configuration

Existing:

- `SHOPPING_COLLECTOR_URL`
- Apps Script `SPREADSHEET_ID`
- Apps Script `ADMIN_PASSWORD`

New Vercel environment variables:

- `BRIDGE_SIGNING_SECRET`: high-entropy secret used for production join-ID derivation and signed session cookies.
- `INTERNAL_TEST_TOKEN`: shared server-side token used only to authorize `/test`.

Neither value may be committed to GitHub or exposed to browser JavaScript.

## Failure handling

- Production `/start` without a real assignment ID: reject unless the MTurk preview sentinel is present.
- Invalid internal test token: HTTP 403, no bridge record, no cookie.
- Collector/config unavailable during bridge initialization: HTTP 503, no redirect.
- Missing SurveyCake URL: initialization error, no redirect.
- Invalid/expired/tampered bridge cookie: `/api/session` reports unlinked and `/api/event` rejects normal event writes.
- Reopening production `/start` for the same assignment: reuse the deterministic join ID and update `last_seen_at`.
- Existing SurveyCake return logic remains unchanged so the bridge does not reopen a plain questionnaire URL.

## Testing and acceptance criteria

Automated tests must cover:

1. deterministic production join ID for the same assignment and different IDs for different assignments;
2. random, correctly prefixed internal and preview IDs;
3. signed cookie round-trip, expiration, and tamper rejection;
4. `/start` classification of production vs MTurk preview vs invalid missing assignment;
5. `/test` token rejection and successful internal session creation;
6. `/api/session` linked/unlinked responses;
7. `/api/event` rejecting unlinked requests and overriding spoofed client identity with signed bridge identity;
8. Apps Script `BRIDGE_START` upsert behavior and run-mode/source persistence;
9. existing selection validation and SurveyCake return behavior remain unchanged.

Deployment verification must demonstrate without contaminating production data:

- `/test` can initialize an internal session before any HIT is live;
- internal flow reaches SurveyCake, returns to Shopping, and records `run_mode=internal` under one join ID;
- MTurk preview records `run_mode=preview`;
- a simulated production start records `run_mode=production` and stable assignment mapping in a controlled diagnostic context;
- direct Shopping access without bridge state cannot create a normal research participant;
- current product catalog, Page 2 requirement, 1-7 selection limit, event delivery, researcher settings, and SurveyCake return behavior still work.

## Out of scope

- Changing SurveyCake questionnaire content except for entry/link instructions if necessary.
- Removing the manually entered Worker ID question.
- Automatic MTurk submission/payment logic.
- New database infrastructure; Google Sheets remains the persistent store.
- Changing the shopping stimuli or behavioral event definitions.