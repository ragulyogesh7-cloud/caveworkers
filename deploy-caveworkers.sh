#!/usr/bin/env sh
set -eu

# Run from an operator workstation authenticated to the intended Google Cloud
# project. This script accepts no secret values: create the named versions in
# Secret Manager before use and grant the selected runtime service account only
# the access it needs.
PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID to the Caveworkers Google Cloud project}"
REGION="${REGION:-asia-southeast1}"
SERVICE_NAME="${CAVEWORKERS_SERVICE_NAME:-caveworkers}"
IMAGE="${IMAGE:?Set IMAGE to the Cloud Build image URI}"
PUBLIC_APP_URL="${PUBLIC_APP_URL:?Set the public HTTPS Caveworkers URL}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:?Set the exact public HTTPS Caveworkers origin}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:?Set the dedicated Cloud Run runtime service-account email}"
GOOGLE_OAUTH_CLIENT_ID="${GOOGLE_OAUTH_CLIENT_ID:?Set the production Google connector OAuth client ID}"

# The initial public release is intentionally one continuously allocated Cloud
# Run instance. The application has durable Firestore tasks/approvals/jobs, but
# presence, SSE fan-out, and rate limits are not yet safe for horizontal scale.
gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --ingress=all \
  --cpu=1 \
  --memory=1Gi \
  --concurrency=20 \
  --timeout=180 \
  --min-instances=1 \
  --max-instances=1 \
  --no-cpu-throttling \
  --set-env-vars="CAVEWORKERS_ENV=production,COOKIE_SECURE=true,PUBLIC_APP_URL=$PUBLIC_APP_URL,ALLOWED_ORIGINS=$ALLOWED_ORIGINS,FIREBASE_PROJECT_ID=$PROJECT_ID,GOOGLE_OAUTH_CLIENT_ID=$GOOGLE_OAUTH_CLIENT_ID,ALWAYS_ON_WORKER_ENABLED=true,WORKER_POLL_MS=1500,WORKER_INSTANCE_ID=$SERVICE_NAME,WEB_RESEARCH_ENABLED=false,HERMES_ENABLED=false" \
  --set-secrets="FLASK_SECRET=caveworkers-session-secret:latest,MCP_TOKEN_ENCRYPTION_KEY=mcp-token-encryption-key:latest,OPENROUTER_API_KEY=openrouter-api-key:latest,RAZORPAY_KEY_ID=razorpay-key-id:latest,RAZORPAY_KEY_SECRET=razorpay-key-secret:latest,RAZORPAY_WEBHOOK_SECRET=razorpay-webhook-secret:latest,GOOGLE_OAUTH_CLIENT_SECRET=google-oauth-client-secret:latest,SCHEDULER_TICK_SECRET=caveworkers-scheduler-tick-secret:latest"

echo "Deployment submitted. Before inviting companies, verify /api/health, Firebase sign-in, a tenant-isolated employee task, Razorpay webhook verification, Firestore backups, and the Cloud Scheduler tick. Deploy the private Hermes bridge and runtime separately; Hermes remains disabled in this first public service deployment."
