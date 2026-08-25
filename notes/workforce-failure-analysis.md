# Workforce failure analysis

## Historical observation

The earlier room transcript showed a rich-looking collaboration trace generated mostly by the server routing function rather than by a verified multi-agent execution. The result was a simulated-feeling room, unclear completion semantics, and insufficient separation between role prompts, tools, approvals, and durable task state.

## Current corrected operating model

1. The **Caveworkers Manager** is the Google ADK root agent. It delegates to exactly four specialized employee agents: Maya (Data Analyst), Iris (Cybersecurity Analyst), Arav (Full Stack Backend Developer), and Priya (Software QA/Automation Engineer).
2. Direct employee assignment remains supported. Whole-team assignment sends the tenant-scoped objective to the ADK manager with the active employee roster and evidence context.
3. Every task retains explicit states: queued, working, waiting for approval, completed, failed, and completed-with-action. A task is not marked completed while it is only a draft or waiting for an external action.
4. The final answer is a first-class task result. The collaboration trace remains supporting evidence and now records the ADK manager path without exposing private system prompts.
5. External actions remain approval-gated and tenant-scoped. ADK permission tools return `ALLOW`, `DENY`, or `APPROVAL_REQUIRED`; the existing Caveworkers approval records and dispatchers remain authoritative for execution.
6. Connector access remains limited by employee, capability, tenant, and environment. Read-only evidence is passed to the ADK context after server-side collection; credentials are never placed in prompts.
7. If a connector, permission, model, or required input is unavailable, the employee reports the missing requirement and stops rather than claiming completion.
8. The current implementation uses the official TypeScript ADK SDK in the existing Node service. A2A and independently deployed employee services are deferred until the in-process contracts and evaluation suite justify the split.

## Required verification

The ADK role registry, manager topology, permission outcomes, fail-closed credential behavior, tenant isolation, approval gates, public employee roster, TypeScript build, and full regression suite must remain covered by automated tests. Production model calls and external connector writes require separately configured credentials and explicit approval; local tests must not create external side effects.
