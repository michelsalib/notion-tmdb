import LockOutlined from "@mui/icons-material/LockOutlined";
import {
  Box,
  Chip,
  Container,
  Paper,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { ALL_DOMAINS, type DOMAIN, DOMAINS } from "backend/src/domains";
import { useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";
import { DomainContext } from "./Context";
import { BitwardenLogin } from "./Login/BitwardenLogin";
import { NotionLogin } from "./Login/NotionLogin";
import { Search } from "./Search";
import { connectorStyle } from "./theme";

/**
 * The landing page.
 *
 * This was two `Select`s rendered at `h2` and a Connect button — no statement
 * of what the product does, no picture of it, and no answer to the obvious
 * hesitation about what it would read in someone's workspace. The switcher
 * concept was good (the product name *is* the relationship it creates) but as a
 * pair of raw form controls it read as an unfinished form, so it is set as type
 * here and the switching moved to the connector row at the bottom.
 */
export function Login() {
  const { domain, pre } = useContext(DomainContext);
  const { t } = useTranslation();
  const theme = useTheme();
  const style = connectorStyle(domain);

  const switchTo = useCallback((next: DOMAIN) => {
    window.location.href = window.location.origin.replace(
      /(notion|bitwarden)-\w+/,
      DOMAINS[next].subdomain,
    );
  }, []);

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, sm: 8 } }}>
      <Stack spacing={5}>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box
              component="img"
              src={style.logo}
              alt=""
              sx={{ height: 20, width: 20, objectFit: "contain" }}
            />
            <Typography
              variant="overline"
              sx={{ letterSpacing: "0.14em", color: "text.secondary" }}
            >
              {pre}{" "}
              <Box component="span" sx={{ color: "primary.main" }}>
                ⇄
              </Box>{" "}
              {DOMAINS[domain].label}
            </Typography>
          </Stack>

          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              textWrap: "balance",
            }}
          >
            {t("PITCH_TITLE")}
          </Typography>

          <Typography variant="body1" color="text.secondary">
            {t("PITCH_BODY")}
          </Typography>
        </Stack>

        {/* The demo is the pitch: it answers "what is this" faster than any
            amount of copy. `/api/search` is unauthenticated, so it works before
            anyone connects anything — only adding needs an account. */}
        {DOMAINS[domain].searchable ? (
          <Stack spacing={1}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Search
                onChange={() => {}}
                placeholder={t("SEARCH_PLACEHOLDER")}
              />
            </Paper>
            <Typography variant="caption" color="text.secondary">
              {t("DEMO_HINT")}
            </Typography>
          </Stack>
        ) : null}

        <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
          {pre == "Notion" && <NotionLogin />}
          {pre == "Bitwarden" && <BitwardenLogin />}

          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <LockOutlined sx={{ fontSize: 15, color: "text.secondary" }} />
            <Typography variant="caption" color="text.secondary">
              {t("PERMISSION_NOTE")}
            </Typography>
          </Stack>
        </Stack>

        <Stack spacing={1.5}>
          <Typography variant="overline" color="text.secondary">
            {t("HOW_IT_WORKS")}
          </Typography>
          <Stack spacing={1}>
            {[t("HOW_STEP_1"), t("HOW_STEP_2"), t("HOW_STEP_3")].map(
              (step, i) => (
                <Stack
                  key={step}
                  direction="row"
                  spacing={1.5}
                  sx={{ alignItems: "baseline" }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: "primary.main",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </Typography>
                  <Typography variant="body2">{step}</Typography>
                </Stack>
              ),
            )}
          </Stack>
        </Stack>

        <Stack spacing={1.5}>
          <Typography variant="overline" color="text.secondary">
            {t("ALSO_CONNECTS")}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            {ALL_DOMAINS.filter((d) => d !== domain).map((d) => (
              <Chip
                key={d}
                clickable
                variant="outlined"
                onClick={() => switchTo(d)}
                avatar={
                  <Box
                    component="img"
                    src={connectorStyle(d).logo}
                    alt=""
                    sx={{ objectFit: "contain", p: 0.25 }}
                  />
                }
                label={DOMAINS[d].label}
                sx={{
                  borderColor: "divider",
                  "&:hover": {
                    borderColor:
                      theme.palette.mode === "dark"
                        ? connectorStyle(d).onDark
                        : connectorStyle(d).onLight,
                  },
                }}
              />
            ))}
          </Stack>
        </Stack>
      </Stack>
    </Container>
  );
}
