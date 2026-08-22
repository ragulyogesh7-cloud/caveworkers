# Private Hermes runtime service

This directory contains the container entry point for the **private**, non-user-facing Hermes runtime. The Caveworkers Node service remains the public control plane; the Hermes dashboard is disabled and must not be exposed.

The runtime exports `HERMES_HOME=/opt/data` before generating its profile, so the controlled `config.yaml` is the profile Hermes actually loads. `CAVEWORKERS_HERMES_HOME` is a non-production smoke-test override and must not be configured in Cloud Run. It uses the documented `platform_toolsets.api_server` allow-list to enable only the dynamic `mcp-caveworkers-bridge` toolset and its four tool names. The deprecated top-level `toolsets` setting is intentionally not used. Terminal, filesystem, browser, native memory, delegation, cron, dashboard, and generic connector toolsets are disabled. The bridge must require a short-lived Caveworkers capability token for every tool call, in addition to its private service bearer.

## Cloud Run contract

Deploy this as a separate Cloud Run service in the same project as Caveworkers with unauthenticated access disabled. Grant the Caveworkers runtime service account `roles/run.invoker` only on the Hermes service. `HERMES_CLOUD_RUN_AUDIENCE` in Caveworkers must equal the Hermes service URL, allowing the Node application to send a Google-issued ID token on `X-Serverless-Authorization` while retaining `Authorization` for the Hermes API bearer. The separately deployed capability bridge is internal-only and reachable from Hermes through its Cloud Run internal URL plus a dedicated bridge bearer.

The Hermes service needs Secret Manager access only to `API_SERVER_KEY`, `OPENROUTER_API_KEY`, and `HERMES_MCP_BRIDGE_TOKEN`. It must not receive Razorpay, Firebase Admin, Google OAuth, Gmail, or tenant connector secrets.

## Required runtime variables

| Variable | Purpose |
|---|---|
| `API_SERVER_KEY` | Hermes API bearer secret, injected only at runtime. |
| `OPENROUTER_API_KEY` | Server-side model credential. |
| `HERMES_MCP_BRIDGE_URL` | HTTPS URL of the Caveworkers capability bridge. |
| `HERMES_MCP_BRIDGE_TOKEN` | Static transport bearer for the bridge; it does not authorize tenant data. |
| `HERMES_DEFAULT_MODEL` | Default model only; Caveworkers still supplies role-scoped instructions. |
| `PORT` | Cloud Run injected port, automatically passed through to Hermes. |

No persistent volume is assumed. Hermes session state and skill learning are not Caveworkers’ system of record; Caveworkers persists task, approval, memory, artifact, and audit records in its own tenant stores.
