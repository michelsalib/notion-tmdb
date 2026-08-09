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
import type { Suggestion } from "backend/src/types";
import { useCallback, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { DomainContext } from "./Context";
import { BitwardenLogin } from "./Login/BitwardenLogin";
import { NotionLogin } from "./Login/NotionLogin";
import { RowPreview } from "./Login/RowPreview";
import { Search } from "./Search";
import { connectorStyle } from "./theme";
import { Lock } from "./ui/icons";

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
  // Fills the demo field from the example chips below it.
  const [seed, setSeed] = useState("");
  // Picking a result is what asks for the preview — one request on a
  // deliberate action, rather than one per arrow-key as the highlight moves.
  const [picked, setPicked] = useState<Suggestion | null>(null);

  // Per connector, so the films page offers films. Comma-separated in the
  // connector's own namespace; an empty list simply renders no chips.
  const examples = t("DEMO_EXAMPLES", { defaultValue: "" })
    .split(",")
    .map((example) => example.trim())
    .filter(Boolean);

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

          <Typography variant="h1" sx={{ textWrap: "balance" }}>
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
            {/* Framed as the thing it becomes: an embed block sitting on a
                Notion page. The nesting is what carries that — the outer ground
                is the page, the inner card is the block — using the two
                surfaces the theme already defines for exactly this pair. */}
            <Box
              sx={{
                p: { xs: 1.5, sm: 2.5 },
                borderRadius: 1,
                bgcolor: "background.default",
                border: 1,
                borderColor: "divider",
              }}
            >
              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                {/* Notion's block handle, at rest. Not interactive: it is set
                    dressing that says "this is a block on a page", and giving
                    it behaviour would promise something the demo cannot do. */}
                <Box
                  aria-hidden
                  sx={{
                    fontFamily: "monospace",
                    fontSize: 13,
                    lineHeight: 1,
                    color: "text.disabled",
                    userSelect: "none",
                  }}
                >
                  ⠿
                </Box>
                <Typography variant="overline" color="text.disabled">
                  {t("DEMO_BLOCK_LABEL")}
                </Typography>
              </Stack>

              {/* Padding lives on the search row rather than the card, so the
                  preview's top rule spans the block edge to edge. */}
              <Paper variant="outlined">
                <Box sx={{ p: 1.5 }}>
                  <Search
                    onChange={setPicked}
                    placeholder={t("SEARCH_PLACEHOLDER")}
                    seed={seed}
                  />
                </Box>

                {picked ? <RowPreview suggestion={picked} /> : null}
              </Paper>
            </Box>

            {examples.length > 0 ? (
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
              >
                <Typography variant="overline" color="text.secondary">
                  {t("DEMO_TRY")}
                </Typography>
                {examples.map((example) => (
                  <Chip
                    key={example}
                    size="small"
                    clickable
                    variant="outlined"
                    label={example}
                    onClick={() => setSeed(example)}
                    sx={{ borderColor: "divider" }}
                  />
                ))}
              </Stack>
            ) : null}

            <Typography variant="caption" color="text.secondary">
              {t("DEMO_HINT")}
            </Typography>
          </Stack>
        ) : null}

        <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
          {pre == "Notion" && <NotionLogin />}
          {pre == "Bitwarden" && <BitwardenLogin />}

          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Lock size={14} sx={{ color: "text.secondary" }} />
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
