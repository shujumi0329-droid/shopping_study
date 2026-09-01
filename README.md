# Shopping Study

This repository contains the fake shopping task used by the study, its product images, Vercel API routes, and the matching Google Apps Script collector.

## Repository structure

- `shopping-study-vercel/index.html` — current participant-facing shopping task
- `shopping-study/assets/products/` — product images
- `api/` — Vercel API routes for configuration, event collection, and researcher administration
- `shopping-study/AppsScript_Collector.gs` — Google Apps Script collector
- `vercel.json` — Vercel rewrites, headers, and queue trigger
- `package.json` — Vercel runtime dependency

The old team-completion dashboard from `teamcomplete/index.html` is intentionally not included. Obsolete shopping pages that embedded researcher credential material are also excluded; the current Vercel version is included.

## Required private configuration

Do not commit researcher passwords or study resource identifiers.

Set these values outside the repository:

- Vercel environment variable `SHOPPING_ADMIN_PASSWORD_SHA256`
- Vercel environment variable `SHOPPING_COLLECTOR_URL`
- Google Apps Script property `ADMIN_PASSWORD`
- Google Apps Script property `SPREADSHEET_ID`

The Vercel password hash and Apps Script password must represent the same researcher password.

## Deployment notes

Deploy this repository as a Vercel project. The root route is rewritten to the current shopping task, and product images are served from this repository. Configure the Google Apps Script web app and its access policy according to the study's participant-access requirements and institutional data-handling rules.
