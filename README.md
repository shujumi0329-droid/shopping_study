# Shopping Study

This repository contains the fake shopping task used by the study, its product images, Vercel API routes, and the matching Google Apps Script collector.

## Repository structure

- `shopping-study-vercel/index.html` — current participant-facing shopping task
- `shopping-study/assets/products/` — product images
- `api/` — Vercel API routes for configuration, event collection, and researcher administration
- `shopping-study/AppsScript_Collector.gs` — Google Apps Script collector
- `vercel.json` — Vercel rewrites, headers, and queue trigger
- `package.json` — Vercel runtime dependency

The old team-completion dashboard from `teamcomplete/index.html` is intentionally not included.

## Required private configuration

Do not commit researcher passwords.

- Set `SHOPPING_ADMIN_PASSWORD_SHA256` as a Vercel environment variable.
- Set `ADMIN_PASSWORD` in Google Apps Script Project Settings → Script properties.
- Set `SHOPPING_COLLECTOR_URL` in Vercel if the collector URL changes.

The Vercel and Apps Script password settings must represent the same researcher password.

## Deployment notes

Deploy this repository as a Vercel project. The root route is rewritten to the current shopping task. Configure the Google Apps Script web app and its access policy according to the study's participant-access requirements and institutional data-handling rules.
