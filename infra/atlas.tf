provider "mongodbatlas" {
  public_key  = var.atlas_public_key
  private_key = var.atlas_private_key
}

resource "mongodbatlas_project" "app" {
  name   = "notion-tmdb"
  org_id = var.atlas_org_id
}

# Free tier — one M0 replicaset. GCP us-central1 (Atlas region CENTRAL_US);
# co-located with the Cloud Run Service + Job so Mongo latency is ~1-2ms.
resource "mongodbatlas_cluster" "app" {
  project_id = mongodbatlas_project.app.id
  name       = "notion-tmdb"

  provider_name               = "TENANT"
  backing_provider_name       = "GCP"
  provider_region_name        = "CENTRAL_US"
  provider_instance_size_name = "M0"
}

# Cloud Run outbound has no static IPs on the shared network. `0.0.0.0/0` +
# strong DB user password is the standard M0 pairing; tighten via VPC
# connector if traffic/threat model changes.
resource "mongodbatlas_project_ip_access_list" "app_allow_all" {
  project_id = mongodbatlas_project.app.id
  cidr_block = "0.0.0.0/0"
  comment    = "Cloud Run dynamic egress"
}

resource "random_password" "atlas_db_user" {
  length  = 32
  special = false # keep URL-safe without url-encoding
}

resource "mongodbatlas_database_user" "app" {
  project_id         = mongodbatlas_project.app.id
  username           = "notiontmdb"
  password           = random_password.atlas_db_user.result
  auth_database_name = "admin"

  roles {
    role_name     = "readWrite"
    database_name = "notion-plugins"
  }
}

# Build the mongodb+srv:// URL by splicing user:password into the cluster's
# standard_srv host, then pipe it into a new version of the MONGO_URL secret.
# Cloud Run will pick it up on the next revision (see the version-tracking
# env var on the Service in main.tf).
locals {
  atlas_host = replace(
    mongodbatlas_cluster.app.connection_strings[0].standard_srv,
    "mongodb+srv://",
    "",
  )
  mongo_url = "mongodb+srv://${mongodbatlas_database_user.app.username}:${random_password.atlas_db_user.result}@${local.atlas_host}/?retryWrites=true&w=majority"
}

resource "google_secret_manager_secret_version" "mongo_url" {
  secret      = google_secret_manager_secret.secret["MONGO_URL"].id
  secret_data = local.mongo_url
}
