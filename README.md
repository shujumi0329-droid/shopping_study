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
- Google Apps Script property `ADMIN_PASSWORD` — researcher password used by the hidden settings panel
- Google Apps Script property `SPREADSHEET_ID` — destination study spreadsheet

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
