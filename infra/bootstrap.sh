#!/usr/bin/env bash
# One-time bootstrap that runs *before* `terraform init`/`apply`. Creates the
# things Terraform itself depends on: the project's billing link, the APIs
# that the Terraform google provider calls, and the GCS bucket that holds
# Terraform state.
#
# Usage:
#   PROJECT_ID=notion-tmdb-prod BILLING_ACCOUNT=01ABCD-... ./bootstrap.sh
#
# Idempotent — safe to re-run.

set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID=...}"
: "${BILLING_ACCOUNT:?set BILLING_ACCOUNT=... (find it via 'gcloud billing accounts list')}"
REGION="${REGION:-us-central1}"
STATE_BUCKET="${STATE_BUCKET:-${PROJECT_ID}-tf-state}"

echo "== project =="
gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud projects create "$PROJECT_ID"
gcloud config set project "$PROJECT_ID"

echo "== billing =="
gcloud beta billing projects link "$PROJECT_ID" \
  --billing-account="$BILLING_ACCOUNT"

echo "== bootstrap APIs (everything Terraform needs to call) =="
gcloud services enable \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  serviceusage.googleapis.com \
  storage.googleapis.com

echo "== terraform-state bucket gs://${STATE_BUCKET} =="
if ! gsutil ls -b "gs://${STATE_BUCKET}" >/dev/null 2>&1; then
  gsutil mb -l "$REGION" -p "$PROJECT_ID" "gs://${STATE_BUCKET}"
fi
gsutil versioning set on "gs://${STATE_BUCKET}"
gsutil uniformbucketlevelaccess set on "gs://${STATE_BUCKET}"

echo
echo "Bootstrap done. Next:"
echo
echo "  cd infra/"
echo "  cp terraform.tfvars.example terraform.tfvars && \$EDITOR terraform.tfvars"
echo "  terraform init -backend-config=\"bucket=${STATE_BUCKET}\""
echo "  terraform apply"
echo
echo "Then populate secrets — one shot:"
echo "  for s in \$(terraform output -json secret_names | jq -r '.[]'); do"
echo "    read -srp \"\$s: \" v; echo"
echo "    printf '%s' \"\$v\" | gcloud secrets versions add \"\$s\" --data-file=-"
echo "  done"
echo
echo "Verify the apex (${PROJECT_ID%-*}.com) in Search Console *before* the"
echo "first 'terraform apply' — domain mappings fail otherwise."
