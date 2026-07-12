# ── Budget alerts ─────────────────────────────────────────────────────────
# Personal-project safety net. Three thresholds at €1/€5/€10 monthly spend
# alert the billing admins (that's you) via email. Cloud Run + Atlas M0
# should sit at €0 under normal load — a €1 breach means something's
# unexpectedly on. Currency matches the billing account (EUR).

resource "google_project_service" "billing_budgets_api" {
  service            = "billingbudgets.googleapis.com"
  disable_on_destroy = false
}

resource "google_billing_budget" "monthly_alerts" {
  billing_account = var.billing_account
  display_name    = "notion-tmdb monthly spend alerts"

  budget_filter {
    projects = ["projects/${data.google_project.current.number}"]
  }

  amount {
    specified_amount {
      currency_code = "EUR"
      units         = "10"
    }
  }

  # Thresholds are expressed as fractions of the budget amount (€10):
  # 10% = €1, 50% = €5, 100% = €10.
  threshold_rules {
    threshold_percent = 0.1
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  # Default notifications go to billing account admins + project owners.

  depends_on = [google_project_service.billing_budgets_api]
}

data "google_project" "current" {
  project_id = var.project_id
}
