# Google ADK research notes

Research captured on 2026-08-25 from Google’s current documentation.

## Verified capabilities

Google describes ADK as an open-source framework for building, debugging, evaluating, deploying, and scaling agents. It supports predictable workflow orchestration and dynamic agent-coordinated routing, native multi-agent composition, specialized teams, tool integrations, trajectory evaluation, and deployment through Runtime, Cloud Run, or Google Kubernetes Engine. The current documentation lists Python, TypeScript, Go, and Java support.

Source: https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/adk

## MCP boundary

The ADK MCP documentation states that ADK can use external MCP servers as an MCP client and can expose ADK tools through an MCP server. The page lists support in Python, TypeScript, Go, and Java and describes MCP as the communication mechanism for resources, prompts, and tools. Caveworkers should keep authorization outside MCP: the application permission engine must authorize a tool request before an MCP adapter executes it.

Source: https://github.com/google/adk-docs/blob/main/docs/mcp/index.md

## Design implication for Caveworkers

The attached brief’s separation is consistent with the documentation: ADK should provide the agent runtime and orchestration, A2A should be reserved for independently deployed agent-to-agent communication, MCP should handle external tools, and Caveworkers should enforce tenant-scoped permissions, approvals, task state, and audit records around every tool call.

## TypeScript SDK choice

The official TypeScript ADK repository documents `@google/adk` as the core package and `@google/adk-devtools` as the development UI/CLI package. It describes TypeScript support for Node.js and browser runtimes, ESM/CommonJS/web bundles, Zod v3/v4 tool schemas, MCP, code execution, sequential/parallel/loop/routed workflows, and A2A delegation. Its quickstart constructs agents with `LlmAgent` and tools such as `GOOGLE_SEARCH`; the current quickstart page lists Node.js 24.13.0+ and npm 11.8.0+ as prerequisites.

Sources:
- https://github.com/google/adk-js
- https://adk.dev/get-started/typescript/

Caveworkers now targets Node.js 24 in package, Docker, and CI files, matching the current ADK TypeScript prerequisite. The existing Node service’s TypeScript architecture makes the official TypeScript SDK the lowest-friction first implementation while preserving the option to split independently deployed agents later.
