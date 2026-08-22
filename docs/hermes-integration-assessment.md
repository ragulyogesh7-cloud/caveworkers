# Caveworkers Hermes Runtime Integration Assessment

**Status:** Architecture assessment complete; implementation is blocked only on the runtime delivery decision and the associated private service configuration.

## Executive assessment

Caveworkers already provides the parts of an agent control plane that must remain outside the model: Firebase-authenticated tenant resolution, Firestore-backed tasks and approvals, a bounded queue worker, task status streaming through Server-Sent Events, encrypted tenant connectors, role-specific workspace plans, and Razorpay approval controls. The Hermes integration should therefore **extend** these controls rather than replace them.

> **Architecture decision:** Caveworkers remains the product and control plane. Hermes is a private execution runtime. Hermes may propose tool use, but only Caveworkers may authorize, approve, audit, and execute a real-world action.

Hermes offers a supported HTTP API server with long-running `runs`, status polling, cancellation, approval, and Server-Sent Event lifecycle events. Its programmatic interface is appropriate for a language-agnostic Node backend. Hermes also supports MCP tool filtering, but MCP filtering alone is not an authorization boundary; Caveworkers must retain an independent tool gateway. [1][2]

An additional constraint applies to a multi-tenant integration: Hermes currently sends static credentials to remote MCP servers and does not propagate trusted per-run metadata. Therefore a single bridge cannot infer a tenant or employee identity from an MCP transport session. The Caveworkers bridge must use short-lived, one-purpose capability tokens that bind a tool call to an exact `{companyId, employeeId, taskId, intent}` scope, expiration, and one-time nonce. [7]

| Current Caveworkers component | Hermes integration role | Required change |
|---|---|---|
| Firebase session and company resolution | Establish immutable organization and owner context | Derive tenant identity only from the verified session; never accept it from the model or Hermes request. |
| Firestore tasks, approvals, audit events, and jobs | Remain the durable system of record | Add Hermes run/session references, execution events, retry metadata, artifact metadata, and idempotency keys. |
| Existing queue worker and SSE stream | Orchestrate work and present safe progress | Queue a Hermes-backed task, relay safe event labels, and retain Caveworkers as the public event source. |
| Employee plans, memory, and conversations | Supply approved, employee-scoped context | Create one Hermes session per `{companyId, employeeId, taskId}`; preserve Caveworkers memory as the business-memory source of truth. |
| Tenant connectors and approval records | Become policy-enforced tools | Implement a Caveworkers Tool Gateway/MCP bridge that checks policy and approval state before every execution. |
| OpenRouter configuration | Provides model credentials and role choice | Pass only server-side model selections to the private Hermes runtime. |

## Recommended production architecture

The recommended design is a **private Hermes API service** deployed alongside Caveworkers, with no public UI and no browser-direct access. The existing Node service calls the Hermes Runs API over a private authenticated endpoint. Hermes receives an employee-specific system instruction, approved skill bundle, fixed model route, a task session ID, and a minimal MCP tool set. It never receives raw tenant credentials or unrestricted local filesystem access.

```text
Caveworkers web UI
        │
        ▼
Caveworkers Node control plane
  ├─ verified Firebase user → company ID
  ├─ Firestore task / approval / audit records
  ├─ employee policy and limits
  ├─ public SSE task events
  └─ private Hermes adapter ── authenticated HTTP ──► Hermes API service
                                                        │
                                              constrained Caveworkers MCP bridge
                                                        │
                                    policy → approval → sanitization → connector/tool execution
```

The Node adapter maps a Caveworkers task to a Hermes run and maps Hermes lifecycle events into safe Caveworkers event types. Before creating the run, Caveworkers mints only the minimum capability tokens needed for the role’s allowed read or draft intents. The tool schema requires the appropriate token for each bridge call; the bridge verifies its HMAC, expiry, nonce, tenant, employee, task, and exact intent before reading any record. Approval-required actions receive no executable capability until the owner approves that specific action. The only event text shown to the browser is a bounded progress message, such as *“Inspecting the approved repository”* or *“Waiting for owner approval”*. Internal reasoning, hidden prompts, raw tool outputs, provider credentials, and chain-of-thought are not persisted or displayed.

## Viable runtime choices

| Approach | Trade-offs | Operating cost and complexity | Suitability |
|---|---|---|---|
| **Private Hermes API service with Caveworkers MCP bridge** | Keeps a clear service boundary, works naturally with the supported Hermes Runs API, supports streaming/cancellation, and prevents Hermes from directly calling customer systems. Requires a second private runtime service and deployment secrets. | Additional managed runtime and deployment configuration. | **Recommended** for the requested production-grade, tool-using workforce. |
| **Hermes Python worker embedded behind a narrow internal HTTP adapter** | Can use Hermes directly as a library, but Caveworkers must own more lifecycle, streaming, crash recovery, and process isolation behavior. The official library is installed from a Hermes checkout rather than a standard published package. | Higher implementation and maintenance complexity. | Viable only when the team needs lower-level Python control that the Runs API cannot provide. |
| **Current OpenRouter worker with no Hermes runtime** | Lowest deployment complexity and preserves the current single-service model, but does not meet the requested Hermes-based autonomous-runtime requirement. | No new runtime service. | A temporary stability-only option, not a valid completion of this Hermes integration. |

## Employee execution contracts

All four employees remain configurable and isolated. The role names, identities, workspace plans, and approvals already present in Caveworkers remain authoritative.

| Employee | Hermes skill families | Default allowed capability | Never auto-execute |
|---|---|---|---|
| Data Analyst | data analysis, SQL analysis, anomaly detection, reporting | Read-only bounded data queries and artifact drafting | Database writes, row deletion, production mutations, delivery actions, and payments. |
| Cybersecurity Analyst | log analysis, dependency audit, configuration audit, incident triage | Defensive analysis of authorized repositories, logs, and configurations | Exploitation, credential handling, arbitrary scanning, destructive testing, or external attacks. |
| Full Stack Backend Developer | repository analysis, debugging, API development, migration planning, code review | Development-repository inspection, branch/diff proposal, tests | Production deployment, production data changes, merging, secret changes, and payment integration operations. |
| Software QA/Automation Engineer | test design, regression, API testing, browser testing, defect analysis | Isolated test execution and report drafting | Personal-browser control, production mutation, non-test payment activity, or shared-environment writes. |

## Non-negotiable security controls

The integration will implement each control outside the LLM and outside Hermes prompt text.

| Control | Enforcement point |
|---|---|
| Tenant binding | Verified Firebase session in Caveworkers creates signed, short-lived capability tokens; no model or Hermes-supplied tenant identifier is trusted. |
| Employee scoping | `{companyId, employeeId, taskId}` session key and role-specific MCP allow-list. |
| Authorization | Caveworkers capability bridge verifies an exact, one-time token and then resolves employee policy, tenant grant, environment, rate limit, and action risk before execution. |
| Human approval | A privileged tool request creates a Caveworkers approval record and leaves the task in `WAITING_FOR_APPROVAL`; the model cannot approve its own action. |
| Razorpay safety | No live Razorpay operation is exposed to Hermes. Hermes can only draft a recommendation or prepare a request for explicit owner action. |
| Result sanitization | Secret redaction, output limits, private-network URL controls, and audit metadata occur before data is returned to Hermes or the browser. |
| Idempotency | Every consequential tool request carries an idempotency key and records a durable audit event before execution. |
| Cost and runaway limits | Per-tenant and per-employee concurrency, max runtime, max tool calls, iteration ceilings, and model-budget limits are checked by Caveworkers. |

## Required runtime configuration

The selected deployment path needs private, server-side configuration. No values should be committed to GitHub, browser code, task payloads, or screenshots.

| Variable | Purpose |
|---|---|
| `HERMES_ENABLED` | Explicit feature flag; disabled until runtime health checks pass. |
| `HERMES_API_URL` | Private base URL for the Hermes API service. |
| `HERMES_API_KEY` | Service-to-service bearer credential, stored in the managed secret store. |
| `HERMES_RUN_TIMEOUT_MS` | Caveworkers-enforced upper runtime bound for one agent task. |
| `HERMES_MAX_TOOL_CALLS` | Caveworkers-enforced tool-call ceiling per task. |
| `HERMES_MAX_CONCURRENT_RUNS` | Tenant- and worker-level concurrency ceiling. |
| `HERMES_MODEL_*` | Optional per-role model routing overrides; OpenRouter credentials remain server-side. |
| `HERMES_MCP_BRIDGE_URL` | Private Caveworkers policy-gateway MCP endpoint, if the bridge is deployed separately. |

## Private container contract

Hermes’ official container guidance supports the API server behind a bearer key and a non-loopback bind. The private service will run the gateway with its API server enabled, bind only to its Cloud Run ingress, retain its mutable state outside the immutable image, and **not** enable the Hermes dashboard. The Caveworkers web application will be the sole browser-facing interface. [3][5]

```text
Hermes service: Cloud Run service, unauthenticated access disabled
Ingress: internal/private service-to-service only
API server: enabled, bearer-authenticated, non-public
Dashboard: disabled
Hermes built-in terminal/file/browser tools: disabled for the production profile
Allowed execution surface: only the Caveworkers policy-gateway MCP toolset
Execution sandbox: separately constrained per task; no customer credential is forwarded by default
```

The adapter will use Hermes’ `POST /v1/runs`, `GET /v1/runs/{id}`, event stream, stop, and approval endpoints rather than reaching into Hermes internals. API-server capability discovery will run during health checks, and the feature flag will remain off unless the required runs, status, events, stop, and approval capability flags are present. [1][3]

The Caveworkers capability bridge will use the official Node MCP SDK over Streamable HTTP. It will expose no resources or prompts, and exactly four tool names that correspond to the role contracts: read task context, read employee memory, draft an artifact, and request a QA sandbox test. Every request must carry the bridge transport bearer and a separate short-lived capability token; these two checks are intentionally independent. [8]

## Implementation sequence after the runtime decision

The implementation will start with a disabled-by-default adapter and a deterministic test harness. It will not claim a real agent task executed until a healthy Hermes service responds and a tool result is recorded by the Caveworkers gateway.

1. Add the `AgentRuntime` interface and a `HermesAgentRuntime` HTTP adapter with run creation, status, event ingestion, stop, and approval-resume methods.
2. Introduce versioned employee manifests, skill packages, role-specific model routes, budgets, and tool policy allow-lists for exactly four employees.
3. Add a Caveworkers MCP Tool Gateway with a small initial tool surface: read-only task context, read-only repository metadata, read-only data/artifact access, and test-environment execution. No direct access to live Razorpay operations is implemented.
4. Extend Firestore task and audit schemas with runtime session/run IDs, event cursors, artifact metadata, execution leases, retries, cancellation, and idempotency metadata.
5. Connect existing queue and SSE interfaces to the adapter, exposing only safe status events and retaining the current approval UI as the owner decision point.
6. Start with the Data Analyst in an isolated, read-only test configuration; then implement and test Cybersecurity, Backend, and QA contracts sequentially.
7. Add failure, timeout, cancellation, approval, tool-redaction, tenant-isolation, and artifact lifecycle tests before enabling the feature in production.

## Blocking decision

To deliver genuine Hermes-backed execution rather than mock behavior, Caveworkers needs a reachable private Hermes service. Please choose one of the runtime choices above, preferably the **private Hermes API service with the Caveworkers MCP bridge**, and confirm whether it should be deployed in the same Google Cloud project as Caveworkers. After that decision, the adapter can be implemented against the selected endpoint contract and released behind `HERMES_ENABLED=false` until integration validation succeeds.

## References

[1]: https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration "Hermes Agent programmatic integration"
[2]: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp "Hermes Agent MCP integration"
[3]: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server "Hermes Agent API server"
[4]: https://hermes-agent.nousresearch.com/docs/guides/python-library "Using Hermes as a Python library"
[5]: https://hermes-agent.nousresearch.com/docs/user-guide/docker "Hermes Agent Docker"
[6]: https://hermes-agent.nousresearch.com/docs/user-guide/features/tools "Hermes Agent tools and toolsets"
[7]: https://github.com/NousResearch/hermes-agent/issues/64890 "Hermes per-run metadata propagation issue"
[8]: https://ts.sdk.modelcontextprotocol.io/ "MCP TypeScript SDK documentation"
