# ── CI/CD identity + Workload Identity Federation ────────────────────────
# GitHub Actions authenticates to GCP without a JSON key by exchanging its
# per-run OIDC token for short-lived GCP credentials. The identity is
# `notion-tmdb-ci@…`; only the specified repo can impersonate it.

resource "google_service_account" "ci" {
  account_id   = "notion-tmdb-ci"
  display_name = "GitHub Actions deploy identity"
}

# Project-level roles the CI needs at apply time.
resource "google_project_iam_member" "ci_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}
resource "google_project_iam_member" "ci_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.ci.email}"
}
resource "google_project_iam_member" "ci_secret_admin" {
  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}
resource "google_project_iam_member" "ci_scheduler_admin" {
  project = var.project_id
  role    = "roles/cloudscheduler.admin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}
resource "google_project_iam_member" "ci_iam_admin" {
  project = var.project_id
  role    = "roles/iam.serviceAccountAdmin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}
resource "google_project_iam_member" "ci_wif_admin" {
  project = var.project_id
  role    = "roles/iam.workloadIdentityPoolAdmin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}
resource "google_project_iam_member" "ci_project_iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${google_service_account.ci.email}"
}

# Deploying a new Cloud Run revision requires actAs on the runtime SA (which
# the Service runs as). Same for the scheduler SA on the Job.
resource "google_service_account_iam_member" "ci_can_act_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.ci.email}"
}
resource "google_service_account_iam_member" "ci_can_act_as_scheduler" {
  service_account_id = google_service_account.scheduler.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.ci.email}"
}

# Terraform state lives here — CI needs read/write for state objects AND
# storage.buckets.getIamPolicy to reconcile this very binding on subsequent
# applies (objectAdmin isn't enough — it lacks bucket-IAM permissions).
resource "google_storage_bucket_iam_member" "ci_tf_state_writer" {
  bucket = "${var.project_id}-tf-state"
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.ci.email}"
}
resource "google_storage_bucket_iam_member" "ci_backup_bucket_admin" {
  bucket = google_storage_bucket.backup.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.ci.email}"
}

# WIF pool — the trust boundary for external OIDC issuers.
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "OIDC trust for GitHub Actions workflows"
}

# Provider — trusts tokens issued by GitHub's OIDC endpoint, restricted to
# our specific repo via attribute_condition (defense in depth against a
# stolen token from another repo in the same pool).
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Allow the specific GitHub repo (any workflow, any branch) to impersonate
# the CI SA. Tighten to a specific ref later if needed:
# `attribute.repository/${var.github_repo}` + `attribute.ref/refs/heads/main`.
resource "google_service_account_iam_member" "ci_wif_binding" {
  service_account_id = google_service_account.ci.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}
