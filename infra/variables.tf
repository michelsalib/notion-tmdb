variable "project_id" {
  description = "GCP project ID (must already exist, billing linked)"
  type        = string
}

variable "region" {
  description = "GCP region. Cloud Run Always Free tier is US-only — keep this in us-* unless paying."
  type        = string
  default     = "us-central1"
}

variable "image" {
  description = "Full Artifact Registry image URI (e.g. us-central1-docker.pkg.dev/PROJ/notion-tmdb/app:TAG)"
  type        = string
}

variable "domain_apex" {
  description = "Apex domain for subdomain mappings (must be verified in Search Console)"
  type        = string
  default     = "micheldev.com"
}
