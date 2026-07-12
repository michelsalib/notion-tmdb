# Secret Manager: one secret per env value that should never appear in tf state.
# Terraform only creates the secret *resources* — populate values out-of-band
# with `gcloud secrets versions add NAME --data-file=path/to/value`. The
# README documents this step.

locals {
  secret_env_names = [
    # Notion OAuth — one client_id + client_secret per distro
    "NOTION_TMDB_CLIENT_ID",
    "NOTION_TMDB_CLIENT_SECRET",
    "NOTION_IGDB_CLIENT_ID",
    "NOTION_IGDB_CLIENT_SECRET",
    "NOTION_GBOOK_CLIENT_ID",
    "NOTION_GBOOK_CLIENT_SECRET",
    "NOTION_BACKUP_CLIENT_ID",
    "NOTION_BACKUP_CLIENT_SECRET",
    "NOTION_GOCARDLESS_CLIENT_ID",
    "NOTION_GOCARDLESS_CLIENT_SECRET",
    # Third-party API credentials
    "TMDB_API_KEY",
    "IGDB_CLIENT_ID",
    "IGDB_CLIENT_SECRET",
    "GOCARDLESS_ID",
    "GOCARDLESS_SECRET",
    # Mongo Atlas connection string (with credentials baked in)
    "MONGO_URL",
  ]
}

resource "google_secret_manager_secret" "secret" {
  for_each  = toset(local.secret_env_names)
  secret_id = each.key

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# Runtime service account can read every secret.
resource "google_secret_manager_secret_iam_member" "runtime_can_read" {
  for_each  = google_secret_manager_secret.secret
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}
