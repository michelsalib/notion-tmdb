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

variable "enable_domain_mappings" {
  description = "Create the 6 Cloud Run domain mappings. Requires `domain_apex` verified in Search Console — set to false for the first apply, flip to true after verification."
  type        = bool
  default     = false
}

variable "atlas_org_id" {
  description = "MongoDB Atlas organization ID (24-char hex, from Atlas UI Organization Settings)"
  type        = string
}

variable "atlas_public_key" {
  description = "MongoDB Atlas API public key"
  type        = string
  sensitive   = true
}

variable "atlas_private_key" {
  description = "MongoDB Atlas API private key"
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "owner/repo of the GitHub repository allowed to authenticate via WIF"
  type        = string
  default     = "michelsalib/notion-tmdb"
}
