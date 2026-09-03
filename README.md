# Shopping Study

This repository contains the fake shopping task used by the study, its product images, Vercel API routes, and the matching Google Apps Script collector.

## Repository structure

- `shopping-study-vercel/index.html` — current participant-facing shopping task
- `shopping-study/assets/products/` — canonical product images; the participant page loads these from this repository's GitHub Raw URLs
- `api/` — Vercel API routes for configuration, direct event collection, and researcher administration
- `shopping-study/AppsScript_Collector.gs` — Google Apps Script collector and researcher-password authority
- `vercel.json` — Vercel rewrites and API response headers
- `package.json` — Node runtime metadata for Vercel

The old team-completion dashboard from `teamcomplete/index.html` is intentionally not included. Obsolete shopping pages that embedded researcher credential material are also excluded; the current Vercel version is included.

## Required private configuration

Do not commit researcher passwords or spreadsheet identifiers.

Set these values outside the repository:

- Vercel environment variable `SHOPPING_COLLECTOR_URL` — the deployed Google Apps Script web-app `/exec` URL
- Vercel environment variable `BRIDGE_SIGNING_SECRET` — high-entropy secret used to derive production join IDs and sign bridge cookies
- Vercel environment variable `INTERNAL_TEST_TOKEN` — private token authorizing the internal `/test` entry
- Google Apps Script property `ADMIN_PASSWORD` — researcher password used by the hidden settings panel
- Google Apps Script property `SPREADSHEET_ID` — destination study spreadsheet

If `BRIDGE_SIGNING_SECRET` or `INTERNAL_TEST_TOKEN` is not configured, the deployment has a **Vercel system identity fallback** so the bridge remains operational: the signing key is deterministically derived server-side from Vercel's project system identity, and the internal test token is derived from that key. Explicit high-entropy environment variables remain the preferred hardening option; the fallback exists so pre-launch testing is not blocked by environment-variable provisioning.

The Vercel app no longer stores a separate administrator-password hash. Researcher authentication is delegated to the Google Apps Script collector, so there is a single password authority.

## Event delivery

Participant events are validated by `/api/event` and then written directly to the Google Apps Script collector. The collector retains `event_id` deduplication and updates the `Event_Log` and `Participants` sheets. Vercel Queue is not required.

## Survey return behavior

The participant page preserves the existing SurveyCake session whenever possible:

- a shopping task opened in a child tab attempts to close that tab and reveal the original questionnaire tab;
- a same-tab shopping task uses browser history when a prior entry is available;
- if neither path can restore the session, a SurveyCake questionnaire URL is never opened automatically because a plain SurveyCake URL can restart the questionnaire at Page 1;
- non-SurveyCake fallback URLs may still be opened when configured.

## Deployment notes

Deploy this repository as a Vercel project and set `SHOPPING_COLLECTOR_URL` for the deployment environment. The root route and `/shopping-study` are rewritten to the current participant task. Configure the Google Apps Script web app and its access policy according to the study's participant-access requirements and institutional data-handling rules.

## Identity bridge and entry URLs

The study uses a server-authoritative bridge so MTurk identifiers do not have to survive SurveyCake URL forwarding. `/start` and `/test` must use the same canonical Vercel hostname as the Shopping link embedded in SurveyCake.

- Production MTurk entry: `/start?assignmentId=...&workerId=...&hitId=...`
- MTurk preview: `/start?assignmentId=ASSIGNMENT_ID_NOT_AVAILABLE` creates a `PREVIEW_...` session and never labels it production.
- Internal pre-launch testing: `/test?access=<INTERNAL_TEST_TOKEN>` creates a `TEST_...` session and runs the same SurveyCake -> Shopping -> collector pipeline even before a HIT is live.
- Direct Shopping access without a valid signed bridge cookie is blocked from normal research-event collection.

Production records use `run_mode=production`; internal and preview records use `internal` and `preview`. When exporting for analysis, filter to `run_mode=production` (or, with the legacy deployed collector, the equivalent `ST_` join-ID prefix / run-mode value preserved in `extra_json`).

The repository collector source supports a dedicated `Bridge_Sessions` sheet and explicit `run_mode`/`recruitment_source` columns. Bridge-start payloads remain backward-compatible with an older deployed Apps Script collector by also carrying `event_type=BRIDGE_START` plus run-mode metadata in `extra_json`.
