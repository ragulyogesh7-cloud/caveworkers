# Caveworkers Google ADK workforce architecture

## Decision

Caveworkers will use the official **Google ADK TypeScript SDK** as an in-process modular monolith first. This preserves the existing Express, Firebase, tenant, task, memory, approval, and connector boundaries while replacing the old prompt-only employee execution path with a real ADK agent tree. The runtime will be upgraded to Node.js 24 to match the current TypeScript quickstart prerequisite.[1]

The first production shape is deliberately not four independent microservices. A manager agent owns routing and synthesis; four specialized employee agents perform role-scoped reasoning; the existing Caveworkers permission engine remains the enforcement point for tools, approvals, tenant identity, and audit. A2A is reserved for a later split when an employee must run as an independently deployed service. MCP remains the external-tool protocol and is never treated as the authorization layer.[2]

## Agent topology

```text
User / Company Room
        |
        v
Caveworkers API + tenant resolver
        |
        v
ADK Manager Agent
        |
        +--> Data Analyst Agent
        +--> Cybersecurity Analyst Agent
        +--> Backend Developer Agent
        +--> QA Automation Engineer Agent
        |
        v
Caveworkers permission engine
        |
        +--> approved native tools
        +--> tenant-scoped MCP connectors
        +--> approval queue / audit log
        |
        v
Company memory + task state + workroom trace
```

The manager receives the user objective, tenant-scoped knowledge, active employees, each employee’s capability profile, and pre-collected evidence. It delegates to the relevant employees, combines their outputs, states what is verified, and records the collaboration trace. Employee tools are wrapped so they cannot bypass the server-side permission decision.

## Four employee contracts

| Employee | Mission | Default tool capabilities | Forbidden or approval-gated actions |
|---|---|---|---|
| Data Analyst | Produce evidence-backed metrics, KPI analysis, anomaly detection, and decision briefs. | Read analytics data, read approved files, parse CSV/XLSX, calculate metrics, draft reports and visualizations. | Production writes, payment actions, unapproved external dispatch, cross-tenant data access. |
| Cybersecurity Analyst | Assess vulnerabilities, access controls, logs, configuration, and defensive risk. | Read repositories, dependency metadata, logs, infrastructure metadata, and approved security sources; draft findings. | Destructive scans, offensive actions, production changes, privilege elevation, unapproved issue writes. |
| Backend Developer | Inspect and improve application code, APIs, schemas, and development workflows. | Read repositories/issues, inspect files, run bounded development checks, create branches and draft pull requests. | Production deployment, production database writes, protected-branch merges, billing or identity changes without approval. |
| QA Automation Engineer | Reproduce defects and provide unit, integration, API, browser, regression, and release evidence. | Read repositories, run bounded tests, inspect test databases, write test artifacts and reports. | Production mutation, destructive test activity, release approval, unapproved external writes. |

## Permission model

Every ADK tool request is evaluated with `{ company_id, user_id, agent_id, task_id, session_id, environment, capability }`. The result is one of `ALLOW`, `DENY`, or `APPROVAL_REQUIRED`. ADK’s tool-confirmation feature may provide the conversational interruption, but Caveworkers’ own permission and approval records remain authoritative for tenant policy, auditability, and resumption.[3]

## State and memory

Caveworkers remains the system of record for task lifecycle, workroom events, company knowledge, employee memory, connector credentials, approvals, and audit events. ADK sessions are execution context, not a replacement for tenant persistence. Each run gets a deterministic session identity derived from the company, task, and user context; prompts contain redacted evidence and capability metadata, never raw credentials.

## Delivery sequence

The redesign is delivered in stages within the existing repository: install the official ADK TypeScript SDK and upgrade the runtime; add a typed employee registry and permission matrix; add the manager and employee agent tree; route workforce narratives through ADK with the existing safe model fallback; expose ADK execution metadata in task traces; add deterministic unit tests for the registry, routing, permission gates, and fallback behavior; then connect real MCP tools one connector family at a time. A2A and background autonomous work remain later extensions rather than being introduced before the in-process contracts are verified.

## References

[1]: https://adk.dev/get-started/typescript/ "TypeScript - Agent Development Kit (ADK)"
[2]: https://github.com/google/adk-docs/blob/main/docs/mcp/index.md "adk-docs/docs/mcp/index.md at main"
[3]: https://github.com/google/adk-docs/blob/main/tools/feature-matrix/start.md "adk-docs/tools/feature-matrix/start.md at main"
