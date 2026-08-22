#!/usr/bin/env sh
set -eu

# Run from an authenticated operator shell after the image is built. Secret values
# are not accepted as arguments and must already exist in Secret Manager.
PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID to the Caveworkers Google Cloud project}"
REGION="${REGION:-asia-southeast1}"
SERVICE_NAME="${HERMES_BRIDGE_SERVICE_NAME:-caveworkers-hermes-bridge}"
IMAGE="${IMAGE:?Set IMAGE to the Cloud Build image URI}"

# The bridge uses Cloud Run internal-only ingress and an independent constant-time
# bearer. It is deliberately allow-unauthenticated at Cloud Run because Hermes is
# not a Google IAM client; external requests cannot reach internal-only ingress.
gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --allow-unauthenticated \
  --ingress=internal \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=20 \
  --timeout=60 \
  --min-instances=1 \
  --set-env-vars="CAVEWORKERS_ENV=production" \
  --set-secrets="HERMES_MCP_BRIDGE_TOKEN=hermes-mcp-bridge-token:latest,HERMES_CAPABILITY_SIGNING_KEY=hermes-capability-signing-key:latest"

echo "Use this service URL as HERMES_MCP_BRIDGE_URL when deploying caveworkers-hermes. The bridge uses internal-only ingress; do not assign it a public load balancer or custom domain."
