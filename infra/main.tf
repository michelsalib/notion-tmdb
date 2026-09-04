terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.20"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State lives in a GCS bucket that's created out-of-band before `terraform
  # init` (see README.md). Pass `-backend-config="bucket=<name>"` to init.
  backend "gcs" {
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  # Route API calls that don't attach to a project (billing budgets, org
  # policies) through this project's quota so they don't fail with
  # SERVICE_DISABLED against Google's default shared project.
  billing_project       = var.project_id
  user_project_override = true
}

# ── APIs ──────────────────────────────────────────────────────────────────
# `cloudresourcemanager`, `iam`, and `storage` must already be enabled before
# `terraform apply` (the README's bootstrap covers that). These are
# safe to manage declaratively from this point on.
#
# `books` + `apikeys` back the GBook connector's API key (see apikeys.tf).
# Adding a *new* entry here is a create, which needs
# `roles/serviceusage.serviceUsageAdmin` on the caller — see the note in ci.tf.
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbilling.googleapis.com",
    "books.googleapis.com",
    "apikeys.googleapis.com",
  ])
  service                    = each.key
  disable_dependent_services = false
  disable_on_destroy         = false
}

# ── Service accounts ──────────────────────────────────────────────────────
resource "google_service_account" "runtime" {
  account_id   = "notion-tmdb-runtime"
  display_name = "Cloud Run service runtime identity (notion-tmdb)"
}

resource "google_service_account" "scheduler" {
  account_id   = "notion-tmdb-scheduler"
  display_name = "Cloud Scheduler invoker for the weekly backup job"
}

# ── Artifact Registry (Docker images) ─────────────────────────────────────
resource "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "notion-tmdb"
  format        = "DOCKER"
  description   = "notion-tmdb container images"

  depends_on = [google_project_service.apis]
}

# ── GCS backup bucket ─────────────────────────────────────────────────────
# Versioning on, 60d retention for archived versions (matches the old Azure
# storage account's blob-versioning policy).
resource "google_storage_bucket" "backup" {
  name                        = "${var.project_id}-notion-backup"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age        = 60
      with_state = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket_iam_member" "runtime_can_write" {
  bucket = google_storage_bucket.backup.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

# ── Cloud Run Service (HTTP) ──────────────────────────────────────────────
resource "google_cloud_run_v2_service" "app" {
  name                = "notion-tmdb"
  location            = var.region
  deletion_protection = false

  # Cloud Run auto-populates a service-level `scaling` block (distinct from
  # `template.scaling`) with all-zero manual-instance-count values on every
  # revision. We don't manage it — ignore it so plan/apply stops flapping.
  lifecycle {
    ignore_changes = [scaling]
  }

  template {
    service_account       = google_service_account.runtime.email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
    timeout               = "1800s" # /api/sync streams progress (SSE)

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      # No `command`/`args` — defers to the container image's CMD
      # (Dockerfile sets `["bun", "backend/index.ts"]`). Also means the
      # placeholder hello image works out of the box for bootstrap.
      image = var.image

      resources {
        cpu_idle = true
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "DB_ENGINE"
        value = "MONGO"
      }
      env {
        name  = "STORAGE_ENGINE"
        value = "GCS"
      }
      env {
        name  = "LOGGER_ENGINE"
        value = "GCP"
      }
      env {
        name  = "STORAGE_BUCKET"
        value = google_storage_bucket.backup.name
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      # STORAGE_ENDPOINT intentionally unset in prod (SDK uses the default
      # https://storage.googleapis.com endpoint).

      # Version-tracking env var: changes when MONGO_URL secret gets a new
      # version, which forces a new Cloud Run revision so `versions/latest`
      # is re-resolved.
      env {
        name  = "_MONGO_URL_VERSION"
        value = google_secret_manager_secret_version.mongo_url.name
      }

      # Secret-backed env values. Two refs, not one per credential — see the
      # header comment in secrets.tf. The backend expands APP_SECRETS into
      # individual keys at startup.
      env {
        name = "APP_SECRETS"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app_secrets.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "MONGO_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.mongo_url.secret_id
            version = "latest"
          }
        }
      }

      # Plain value, not a secret ref — see the header comment in apikeys.tf.
      env {
        name  = "GBOOK_API_KEY"
        value = google_apikeys_key.gbook.key_string
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.runtime_can_read,
  ]
}

# Allow unauthenticated invocations (the app handles its own cookie-based auth).
resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Cloud Run Job (weekly Bitwarden backup) ───────────────────────────────
resource "google_cloud_run_v2_job" "backup" {
  name                = "notion-bitwarden-backup"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account       = google_service_account.runtime.email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
      timeout               = "1800s"
      max_retries           = 1

      containers {
        image   = var.image
        command = ["bun"]
        args    = ["backend/job.ts"]

        resources {
          limits = {
            cpu = "1"
            # Assets stream straight into the upload now, so the peak is the
            # item metadata a run holds to write data.json — headroom for a
            # large workspace rather than the whole zip it used to buffer.
            memory = "2Gi"
          }
        }

        env {
          name  = "DB_ENGINE"
          value = "MONGO"
        }
        env {
          name  = "STORAGE_ENGINE"
          value = "GCS"
        }
        env {
          name  = "LOGGER_ENGINE"
          value = "GCP"
        }
        env {
          name  = "STORAGE_BUCKET"
          value = google_storage_bucket.backup.name
        }
        env {
          name  = "GCP_PROJECT_ID"
          value = var.project_id
        }

        env {
          name = "APP_SECRETS"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.app_secrets.secret_id
              version = "latest"
            }
          }
        }
        env {
          name = "MONGO_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.mongo_url.secret_id
              version = "latest"
            }
          }
        }

        # No GBOOK_API_KEY here: this Job resolves the container scoped to
        # "BitwardenBackup" (backend/job.ts) and never constructs GBookClient.
        # GBook sync runs in the Service, via GET /api/sync.
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.runtime_can_read,
  ]
}

# Scheduler invokes the Job via run.invoker.
resource "google_cloud_run_v2_job_iam_member" "scheduler_can_invoke" {
  location = google_cloud_run_v2_job.backup.location
  name     = google_cloud_run_v2_job.backup.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# ── Cloud Scheduler (weekly cron) ─────────────────────────────────────────
resource "google_cloud_scheduler_job" "weekly_backup" {
  name        = "notion-bitwarden-backup-weekly"
  description = "Triggers the Bitwarden backup Job every Sunday at 00:00 UTC"
  schedule    = "0 0 * * 0"
  time_zone   = "UTC"
  region      = var.region

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.backup.name}:run"

    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  depends_on = [google_project_service.apis]
}

# ── Domain mappings (one per subdomain) ───────────────────────────────────
# Requires apex (`micheldev.com`) verified in Search Console under the same
# Google account that owns the project. Cert provisioning takes 15-60 min.
locals {
  subdomains = [
    "notion-tmdb",
    "notion-gbook",
    "notion-igdb",
    "notion-billetreduc",
    "notion-backup",
    "bitwarden-backup",
  ]
}

resource "google_cloud_run_domain_mapping" "subdomain" {
  for_each = var.enable_domain_mappings ? toset(local.subdomains) : toset([])

  location = var.region
  name     = "${each.value}.${var.domain_apex}"

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.app.name
  }
}
