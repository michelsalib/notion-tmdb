output "service_url" {
  description = "Raw Cloud Run service URL (use with `Host:` header before DNS cutover)"
  value       = google_cloud_run_v2_service.app.uri
}

output "artifact_registry_repository" {
  description = "Docker image repo path (push images here)"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "runtime_service_account" {
  description = "Email of the runtime service account (grant any extra IAM here)"
  value       = google_service_account.runtime.email
}

output "backup_bucket" {
  description = "GCS bucket name for NotionBackup zips"
  value       = google_storage_bucket.backup.name
}

output "app_secret_keys" {
  description = "Keys expected inside the APP_SECRETS JSON blob, which must be populated out-of-band (see bootstrap.sh)"
  value       = local.app_secret_keys
}

output "domain_mappings" {
  description = "Configured subdomains (each needs DNS records returned by `gcloud run domain-mappings describe`)"
  value       = [for s in local.subdomains : "${s}.${var.domain_apex}"]
}

output "workload_identity_provider" {
  description = "Full resource name of the GitHub Actions WIF provider. Put in GitHub as vars.WORKLOAD_IDENTITY_PROVIDER."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "ci_service_account_email" {
  description = "CI service account email. Put in GitHub as vars.CI_SERVICE_ACCOUNT."
  value       = google_service_account.ci.email
}
