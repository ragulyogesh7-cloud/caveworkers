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
| Private Hermes runtime | Source, tests, deployment contracts, and feature gating exist. No bridge or Hermes Cloud Run service has yet been deployed, so `HERMES_ENABLED` remains `false`. |
| No-new-billing path | The existing managed publishing path can release the public control plane as a controlled candidate, with unconfigured providers and private Hermes execution kept fail-closed. |

## Required before customer invitation

The healthy public endpoint is not evidence that the company configuration is complete. The operator must configure managed production secrets, Firebase authorised domains, Google connector OAuth, Razorpay live webhook validation, Firestore rules and backups, monitoring/alert routing, and the controlled single-worker Cloud Run revision. The private bridge and Hermes runtime then require their own internal deployment, IAM grants, health checks, and staged Data Analyst draft-artifact test before private runtime execution is enabled.

See [`company-production-release.md`](company-production-release.md) for the complete staged release procedure.
