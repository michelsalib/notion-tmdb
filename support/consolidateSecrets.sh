#!/usr/bin/env bash
# One-off migration: 18 Secret Manager secrets -> 1 APP_SECRETS JSON blob.
#
# Secret Manager bills $0.06 per active secret version per month with the first
# 6 free, so 18 secrets cost ~$0.78/mo while one blob costs nothing. See the
# header comment in infra/secrets.tf for the reasoning and why MONGO_URL stays
# separate.
#
# Reads the *existing* per-key secrets and writes them into APP_SECRETS. Values
# only ever move between gcloud and jq in a pipe — nothing is written to disk.
#
# This script creates *and* populates APP_SECRETS with gcloud, deliberately
# ahead of any Terraform run. A targeted `terraform apply` can't be used to
# create it first, because secrets.tf carries a `moved` block for MONGO_URL and
# Terraform refuses to exclude moved instances from a targeted plan — obeying
# its suggestion to add `-target=google_secret_manager_secret.secret` would
# destroy the 17 source secrets before this script has read them.
#
# Usage (run once, from the repo root, before pushing the consolidation):
#
#   1. PROJECT_ID=micheldev-notion-tmdb ./support/consolidateSecrets.sh
#
#   2. Adopt the secret Terraform now expects to own:
#        cd infra/
#        terraform import google_secret_manager_secret.app_secrets \
#          projects/${PROJECT_ID}/secrets/APP_SECRETS
#
#   3. Push to main. CI's (untargeted, so the `moved` block resolves cleanly)
#      terraform apply repoints Cloud Run at APP_SECRETS and destroys the 17
#      now-unused secrets.
#
# Nothing the running service reads changes until step 3, so steps 1-2 are safe
# to sit on. Idempotent — re-running just adds another APP_SECRETS version built
# from the same sources. Prune extras afterwards (see the tail of this script).

set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID=... (the GCP project holding the secrets)}"

# Must match local.app_secret_keys in infra/secrets.tf. MONGO_URL is
# intentionally absent: Terraform generates it into its own secret.
KEYS=(
  NOTION_TMDB_CLIENT_ID
  NOTION_TMDB_CLIENT_SECRET
  NOTION_IGDB_CLIENT_ID
  NOTION_IGDB_CLIENT_SECRET
  NOTION_GBOOK_CLIENT_ID
  NOTION_GBOOK_CLIENT_SECRET
  NOTION_BILLETREDUC_CLIENT_ID
  NOTION_BILLETREDUC_CLIENT_SECRET
  NOTION_BACKUP_CLIENT_ID
  NOTION_BACKUP_CLIENT_SECRET
  TMDB_API_KEY
  IGDB_CLIENT_ID
  IGDB_CLIENT_SECRET
)

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

echo "== reading ${#KEYS[@]} secrets from ${PROJECT_ID} =="
args=()
for key in "${KEYS[@]}"; do
  # --secret-file=- would be cleaner, but `versions access` only writes stdout.
  if ! value=$(gcloud secrets versions access latest \
    --secret="$key" --project="$PROJECT_ID" 2>/dev/null); then
    echo "  MISSING $key — aborting so the blob can't ship half-populated" >&2
    exit 1
  fi
  echo "  ok      $key (${#value} chars)"
  args+=(--arg "$key" "$value")
done

echo "== creating APP_SECRETS =="
if gcloud secrets describe APP_SECRETS --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "  already exists"
else
  # Must match the `replication { auto {} }` in infra/secrets.tf, or the
  # import in step 2 will show permanent drift.
  gcloud secrets create APP_SECRETS \
    --project="$PROJECT_ID" --replication-policy=automatic
fi

echo "== writing APP_SECRETS =="
jq -n "${args[@]}" '$ARGS.named' \
  | gcloud secrets versions add APP_SECRETS \
      --project="$PROJECT_ID" --data-file=-

cat <<EOF

Done. APP_SECRETS now holds ${#KEYS[@]} keys.

Verify it round-trips (prints key names only, no values):
  gcloud secrets versions access latest --secret=APP_SECRETS \\
    --project=${PROJECT_ID} | jq -r 'keys[]'

Next, hand the secret to Terraform, then push to main:
  cd infra/
  terraform import google_secret_manager_secret.app_secrets \\
    projects/${PROJECT_ID}/secrets/APP_SECRETS
  terraform plan   # expect: 17 secrets destroyed, Cloud Run revised, no APP_SECRETS create

Afterwards, prune any superseded versions — they stay billable while enabled,
and MONGO_URL currently carries a stale one:
  gcloud secrets versions list APP_SECRETS --project=${PROJECT_ID}
  gcloud secrets versions destroy VERSION --secret=APP_SECRETS --project=${PROJECT_ID}
EOF
