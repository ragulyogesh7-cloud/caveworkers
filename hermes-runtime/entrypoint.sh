#!/bin/sh
set -eu

: "${API_SERVER_KEY:?API_SERVER_KEY must be injected through the managed secret store}"
: "${OPENROUTER_API_KEY:?OPENROUTER_API_KEY must be injected through the managed secret store}"
: "${HERMES_MCP_BRIDGE_URL:?HERMES_MCP_BRIDGE_URL must point to the Caveworkers capability bridge}"
: "${HERMES_MCP_BRIDGE_TOKEN:?HERMES_MCP_BRIDGE_TOKEN must be injected through the managed secret store}"

export API_SERVER_ENABLED=true
export API_SERVER_HOST=0.0.0.0
export API_SERVER_PORT="${PORT:-8080}"
export HERMES_DASHBOARD=0
# Operators do not set this in production; the override exists only for a
# non-root smoke test and never accepts a generic upstream HERMES_HOME value.
export HERMES_HOME="${CAVEWORKERS_HERMES_HOME:-/opt/data}"

mkdir -p "$HERMES_HOME"
cat > "$HERMES_HOME/config.yaml" <<EOF
model:
  provider: openrouter
  default: "${HERMES_DEFAULT_MODEL:-anthropic/claude-sonnet-5}"
  base_url: "${OPENROUTER_BASE_URL:-https://openrouter.ai/api/v1}"
runtime:
  nofile_soft_limit: 4096
tool_loop_guardrails:
  hard_stop_enabled: true
  hard_stop_after:
    exact_failure: 3
    idempotent_no_progress: 3
# The legacy top-level toolsets key is ignored by current Hermes releases.
# Pin the OpenAI-compatible Runs API specifically to this one dynamic MCP set.
platform_toolsets:
  api_server:
    - mcp-caveworkers-bridge
# Defense in depth: the API-server preset and every local execution, browser,
# persistence, delegation, and scheduling set remain unavailable even if a
# future Hermes default changes. Caveworkers owns memory, queueing and approvals.
agent:
  disabled_toolsets:
    - hermes-api-server
    - hermes-cli
    - terminal
    - file
    - browser
    - web
    - vision
    - image_gen
    - skills
    - skills_hub
    - todo
    - memory
    - delegation
    - cronjob
    - tts
gateway:
  platforms:
    api_server:
      direct_model_requests: false
mcp_servers:
  caveworkers-bridge:
    url: "${HERMES_MCP_BRIDGE_URL}"
    headers:
      Authorization: "Bearer ${HERMES_MCP_BRIDGE_TOKEN}"
    timeout: 30
    connect_timeout: 10
    supports_parallel_tool_calls: false
    tools:
      include:
        - workspace_context_read
        - employee_memory_read
        - artifact_draft
        - sandbox_test_request
      resources: false
      prompts: false
EOF

exec hermes gateway run
