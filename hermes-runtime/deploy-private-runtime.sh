#!/usr/bin/env sh
set -eu

# Run from an authenticated operator shell. This script never accepts secret values;
# add the named secrets to Secret Manager before invoking it.
PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID to the Caveworkers Google Cloud project}"
REGION="${REGION:-asia-southeast1}"
SERVICE_NAME="${HERMES_SERVICE_NAME:-caveworkers-hermes}"
IMAGE="${IMAGE:?Set IMAGE to the Cloud Build image URI}"
BRIDGE_URL="${HERMES_MCP_BRIDGE_URL:?Set the HTTPS Caveworkers bridge URL}"

gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --no-allow-unauthenticated \
  --ingress=internal-and-cloud-load-balancing \
  --cpu=1 \
  --memory=1Gi \
  --concurrency=2 \
  --timeout=180 \
  --min-instances=1 \
  --set-env-vars="HERMES_MCP_BRIDGE_URL=$BRIDGE_URL,OPENROUTER_BASE_URL=https://openrouter.ai/api/v1" \
  --set-secrets="API_SERVER_KEY=hermes-api-server-key:latest,OPENROUTER_API_KEY=openrouter-api-key:latest,HERMES_MCP_BRIDGE_TOKEN=hermes-mcp-bridge-token:latest"

echo "Grant the Caveworkers runtime service account roles/run.invoker on $SERVICE_NAME, then set HERMES_API_URL and HERMES_CLOUD_RUN_AUDIENCE to the deployed service URL in Caveworkers."
