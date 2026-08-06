import {
  Box,
  Button,
  createTheme,
  Divider,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  ThemeProvider,
  Typography,
  useTheme,
} from "@mui/material";
import * as colors from "@mui/material/colors";
import { DOMAINS, SEARCHABLE_DOMAINS } from "backend/src/domains";
import type { Suggestion } from "backend/src/types";
import { Fragment, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SnackbarContext } from "./Context";
import { Search } from "./Search";

// Search connectors that share the search → add embed shape, derived from the
// shared DOMAINS registry. The domain keys double as i18n namespace names
// (frontend/static/locales/*), so switching the dropdown pulls that
// connector's own labels + PRIMARY_COLOR.
const CONNECTORS: { domain: string; label: string }[] = SEARCHABLE_DOMAINS.map(
  (domain) => ({ domain, label: DOMAINS[domain].label }),
);

const STORAGE_KEY = "multiEmbedDomain";

export function MultiEmbedPage() {
  const { t, i18n } = useTranslation();
  const parentTheme = useTheme();
  const { setSnackbar } = useContext(SnackbarContext);
  const [available, setAvailable] = useState<string[] | null>(null);
  const [domain, setDomain] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? "",
  );
  const [value, setValue] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [nsReady, setNsReady] = useState(false);

  useEffect(() => {
    void fetch("/api/connectors")
      .then((r) => r.json())
      .then(({ connectors }: { connectors: string[] }) => {
        setAvailable(connectors);
        setDomain((prev) =>
          prev && connectors.includes(prev) ? prev : (connectors[0] ?? ""),
        );
      })
      .catch(() => setAvailable([]));
  }, []);

  // Pull in every connector's namespace so switching the dropdown can render
  // that connector's own labels/colour without a per-switch network round-trip.
  useEffect(() => {
    void i18n
      .loadNamespaces(CONNECTORS.map((c) => c.domain))
      .finally(() => setNsReady(true));
  }, [i18n]);

  // A translator bound to the selected connector's namespace. getFixedT is
  // synchronous (never suspends); it returns the raw key until the namespace is
  // loaded, so callers fall back to the generic MULTI_* keys meanwhile.
  const ct = useMemo(
    () => i18n.getFixedT(null, domain || "translation"),
    // nsReady flip forces a recompute once the namespaces have arrived.
    [i18n, domain, nsReady],
  );

  const label = (key: string, fallbackKey: string) => {
    const v = ct(key);
    return v && v !== key ? v : t(fallbackKey);
  };

  // Icon path for any connector (not just the selected one) — each menu row
  // shows its own icon. Returns null until that namespace's LOGO_PATH loads.
  const logoFor = (d: string) => {
    const p = i18n.getFixedT(null, d)("LOGO_PATH");
    return p && p !== "LOGO_PATH" ? p : null;
  };

  // Re-skin the widget's controls with the selected connector's accent colour
  // (its PRIMARY_COLOR, e.g. IGDB=cyan, TMDB=lightBlue), inheriting the app's
  // light/dark mode. Falls back to the app's primary until the namespace loads.
  const connectorTheme = useMemo(() => {
    const colorName = ct("PRIMARY_COLOR");
    const palette = colors[colorName as keyof typeof colors];

    return createTheme({
      palette: {
        mode: parentTheme.palette.mode,
        primary: (palette ?? parentTheme.palette.primary) as any,
        background: { default: parentTheme.palette.background.default },
      },
    });
  }, [ct, parentTheme]);

  function pickDomain(next: string) {
    setDomain(next);
    setValue(null);
    localStorage.setItem(STORAGE_KEY, next);
  }

  async function submit() {
    if (!value || !domain) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/api/add?id=${encodeURIComponent(value.id)}&domain=${encodeURIComponent(domain)}`,
        { method: "POST" },
      );

      if (response.status != 200) {
        setSnackbar({
          open: true,
          message: label("ADD_FAILURE", "MULTI_ADD_FAILURE"),
          color: "error",
        });

        return;
      }

      const { url } = (await response.json()) as { url?: string };

      setSnackbar({
        open: true,
        message: label("ADD_SUCCESS", "MULTI_ADD_SUCCESS"),
        color: "success",
        url,
      });
      setValue(null);
    } catch {
      setSnackbar({
        open: true,
        message: label("ADD_FAILURE", "MULTI_ADD_FAILURE"),
        color: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  const options = CONNECTORS.filter((c) => available?.includes(c.domain));

  return (
    <Fragment>
      {loading ? (
        <LinearProgress
          sx={{ position: "absolute", top: 0, left: 0, right: 0 }}
        />
      ) : (
        ""
      )}

      <Stack direction="column" spacing={1.5} sx={{ padding: 1.5 }}>
        {available && options.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("MULTI_NO_CONNECTORS")}
          </Typography>
        ) : (
          <ThemeProvider theme={connectorTheme}>
            {/* Merge dropdown + search + button into one outlined input group:
                a single border, inner borders stripped, dividers between
                segments, and the button attached flush on the right. */}
            <Box
              sx={{
                display: "flex",
                alignItems: "stretch",
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                overflow: "hidden",
                "&:focus-within": { borderColor: "primary.main" },
              }}
            >
              <Select
                size="small"
                value={domain}
                onChange={(e) => pickDomain(e.target.value)}
                disabled={loading || options.length === 0}
                sx={{
                  flexShrink: 0,
                  "& .MuiOutlinedInput-notchedOutline": { border: 0 },
                }}
                // Closed: show only the selected connector's icon. The names
                // live in the open list below. Falls back to the connector name
                // while its namespace (and thus LOGO_PATH) is still loading.
                renderValue={(val) => {
                  const logo = logoFor(val as string);

                  return logo ? (
                    <Box
                      component="img"
                      src={logo}
                      alt={val as string}
                      sx={{ height: 22, display: "block" }}
                    />
                  ) : (
                    <span>{val as string}</span>
                  );
                }}
              >
                {options.map((c) => {
                  const logo = logoFor(c.domain);

                  return (
                    <MenuItem key={c.domain} value={c.domain} sx={{ gap: 1 }}>
                      {logo ? (
                        <Box
                          component="img"
                          src={logo}
                          alt=""
                          sx={{ height: 20, width: 20, flexShrink: 0 }}
                        />
                      ) : null}
                      {c.label}
                    </MenuItem>
                  );
                })}
              </Select>

              <Divider orientation="vertical" flexItem />

              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Search
                  key={domain}
                  domain={domain}
                  borderless
                  placeholder={label(
                    "SEARCH_PLACEHOLDER",
                    "MULTI_SEARCH_PLACEHOLDER",
                  )}
                  onChange={(m) => setValue(m)}
                />
              </Box>

              <Button
                variant="contained"
                disableElevation
                onClick={submit}
                disabled={loading || !value}
                sx={{ borderRadius: 0, flexShrink: 0 }}
              >
                Create
              </Button>
            </Box>
          </ThemeProvider>
        )}
      </Stack>
    </Fragment>
  );
}
