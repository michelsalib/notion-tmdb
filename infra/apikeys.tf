# Google Books API key for the `GBook` connector.
#
# Keyless calls to books.googleapis.com are attributed to a shared anonymous
# consumer project whose `defaultPerDayPerProject` quota Google set to **0** —
# so every unauthenticated request now returns 429 regardless of caller IP
# (reproducible from any network, so not a Cloud Run problem). A key moves the
# request onto this project's own quota.
#
# Deliberately *not* in Secret Manager, unlike every other credential here.
# This key authorizes nothing — it is quota attribution for one read-only
# public API, pinned by `api_targets` below — so the worst a leak costs is a
# day of book lookups. That does not justify a fourth secret, and the value
# would land in Terraform state either way. It goes to Cloud Run as a plain
# env var; `resolveEnv` treats it exactly like a blob-sourced key.
#
# Managing it here rather than by hand also fixes the restriction in place: a
# console-created key can be silently widened to "unrestricted", whereas
# `api_targets` is re-asserted on every apply.
resource "google_apikeys_key" "gbook" {
  name         = "notion-gbook"
  display_name = "Google Books API (notion-gbook connector)"
  project      = var.project_id

  # No `browser_key_restrictions`/`server_key_restrictions` block: Cloud Run
  # has no static egress IP and a server-to-server call sends no referrer, so
  # application restrictions can only be "None". `api_targets` is the one that
  # carries weight.
  restrictions {
    api_targets {
      service = "books.googleapis.com"
    }
  }

  depends_on = [google_project_service.apis]
}
