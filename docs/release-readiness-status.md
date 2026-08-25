# Caveworkers release readiness status

**Assessment date:** 2026-08-22

## Verified operator baseline

| Item | Observed state |
|---|---|
| Google Cloud project | `caveworkers-505714` is selected in the authenticated Google Cloud Console session. |
| Cloud Run prerequisite | Cloud Run Admin API activation was initiated. Google Cloud requires a valid billing account before the project can deploy or operate Cloud Run services. |
| Billing account | The authenticated console confirms that `caveworkers-505714` currently has no linked billing account. |
| Public production health endpoint | `https://mycaveworkers.ai.studio/api/health` returned `healthy`. |
| Published configuration status | Firebase and the database reported active; payments, Google connector OAuth, SMTP, and error monitoring reported unconfigured; the analyst reported a Gemini fallback. |
| Local release gate | A clean `npm ci` install, lint, tests, production build, deployment-script syntax, and whitespace validation passed locally. The current suite contains 21 passing tests. |

## Required before customer invitation


See [`company-production-release.md`](company-production-release.md) for the complete staged release procedure.
