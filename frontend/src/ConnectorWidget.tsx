import ExpandMore from "@mui/icons-material/ExpandMore";
import {
  Box,
  Button,
  ButtonGroup,
  createTheme,
  Divider,
  LinearProgress,
  Link,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Select,
  Stack,
  ThemeProvider,
  Typography,
  useTheme,
} from "@mui/material";
import { type DOMAIN, DOMAINS, SEARCHABLE_DOMAINS } from "backend/src/domains";
import type { Suggestion } from "backend/src/types";
import { Fragment, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthContext, DomainContext } from "./Context";
import { Search } from "./Search";
import { connectorStyle } from "./theme";
import {
  readLastSync,
  readSetting,
  relativeTime,
  useSync,
  writeLastSync,
  writeSetting,
} from "./useSync";

// Search connectors that share the search → add embed shape, derived from the
// shared DOMAINS registry. The domain keys double as i18n namespace names
// (frontend/static/locales/*), so switching the dropdown pulls that
// connector's own labels.
const CONNECTORS = SEARCHABLE_DOMAINS.map((domain) => ({
  domain,
  label: DOMAINS[domain].label,
}));

const STORAGE_KEY = "multiEmbedDomain";

interface Result {
  kind: "ok" | "error";
  message: string;
  /** Notion page just created, so the user can jump straight to it. */
  url?: string;
}

/**
 * The embed widget, in both its single- and multi-connector forms.
 *
 * These were two components with two layouts. The multi one had already grown
 * the better of the two — one outlined group with the connector picker, the
 * search field and the button sharing a single border — while the single one
 * kept a separate field, a separate button, and a full-width contained green
 * "Sync all" underneath. That put the rare, slow, whole-database operation
 * above the thing people do every day, in an iframe that is often only tall
 * enough for one row. One component, one layout, sync demoted to a text action
 * beside the freshness it explains.
 */
export function ConnectorWidget({
  multi = false,
  compact = false,
}: {
  multi?: boolean;
  /** Rendered as a preview inside the settings page rather than standalone. */
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const parentTheme = useTheme();
  const auth = useContext(AuthContext);
  const hostDomain = useContext(DomainContext).domain;

  const [available, setAvailable] = useState<DOMAIN[] | null>(null);
  const [picked, setPicked] = useState<string>(
    () => readSetting(STORAGE_KEY) ?? "",
  );
  const [value, setValue] = useState<Suggestion | null>(null);
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [nsReady, setNsReady] = useState(false);
  // Bumped to remount `Search`, which owns its own input state — this is what
  // clears the field after a successful add.
  const [resetToken, setResetToken] = useState(0);

  const domain = multi ? picked : hostDomain;
  const syncKey = `${auth.userId ?? "anon"}:${domain}`;

  const [lastSync, setLastSync] = useState(() => readLastSync(syncKey));
  useEffect(() => setLastSync(readLastSync(syncKey)), [syncKey]);

  const sync = useSync({
    domain: multi ? domain : undefined,
    onSettled: (state) => {
      if (state.error) {
        return;
      }

      const entry = { at: Date.now(), total: state.total ?? 0 };

      writeLastSync(syncKey, entry);
      setLastSync(entry);
    },
  });

  useEffect(() => {
    if (!multi) {
      return;
    }

    void fetch("/api/connectors")
      .then((r) => r.json())
      .then(({ connectors }: { connectors: DOMAIN[] }) => {
        setAvailable(connectors);
        setPicked((prev) =>
          prev && connectors.includes(prev as DOMAIN)
            ? prev
            : (connectors[0] ?? ""),
        );
      })
      .catch(() => setAvailable([]));
  }, [multi]);

  // Pull in every connector's namespace so switching the dropdown can render
  // that connector's own labels without a per-switch network round-trip.
  useEffect(() => {
    if (!multi) {
      setNsReady(true);

      return;
    }

    void i18n
      .loadNamespaces(CONNECTORS.map((c) => c.domain))
      .finally(() => setNsReady(true));
  }, [i18n, multi]);

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

  // Re-skin the widget with the selected connector's accent, inheriting the
  // app's light/dark mode. Only the multi widget needs this — the single one
  // already runs under its own connector's theme.
  const connectorTheme = useMemo(() => {
    if (!multi || !domain) {
      return parentTheme;
    }

    const style = connectorStyle(domain as DOMAIN);
    const isDark = parentTheme.palette.mode === "dark";

    return createTheme({
      ...parentTheme,
      palette: {
        mode: parentTheme.palette.mode,
        primary: {
          main: isDark ? style.onDark : style.onLight,
          contrastText: parentTheme.palette.primary.contrastText,
        },
        background: parentTheme.palette.background,
      },
    });
  }, [multi, domain, parentTheme]);

  function pickDomain(next: string) {
    setPicked(next);
    setValue(null);
    setResult(null);
    setResetToken((n) => n + 1);
    writeSetting(STORAGE_KEY, next);
  }

  async function submit() {
    if (!value || !domain) {
      return;
    }

    setAdding(true);
    setResult(null);

    try {
      const params = new URLSearchParams({ id: String(value.id) });

      if (multi) {
        params.set("domain", domain);
      }

      const response = await fetch(`/api/add?${params.toString()}`, {
        method: "POST",
      });

      if (!response.ok) {
        setResult({
          kind: "error",
          message: label("ADD_FAILURE", "MULTI_ADD_FAILURE"),
        });

        return;
      }

      const { url } = (await response.json()) as { url?: string };

      setResult({
        kind: "ok",
        message: label("ADD_SUCCESS", "MULTI_ADD_SUCCESS"),
        url,
      });

      // Clearing the selection is what stops the same title being added twice:
      // the field used to keep its value with the button still enabled, which
      // read as an invitation to press it again.
      setValue(null);
      setResetToken((n) => n + 1);
    } catch {
      setResult({
        kind: "error",
        message: label("ADD_FAILURE", "MULTI_ADD_FAILURE"),
      });
    } finally {
      setAdding(false);
    }
  }

  const options = multi
    ? CONNECTORS.filter((c) => available?.includes(c.domain))
    : [];
  const busy = adding || sync.running;

  if (multi && available && options.length === 0) {
    return (
      <Stack sx={{ padding: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {t("MULTI_NO_CONNECTORS")}
        </Typography>
      </Stack>
    );
  }

  return (
    <ThemeProvider theme={connectorTheme}>
      <Stack
        direction="column"
        spacing={1}
        sx={{ padding: compact ? 1.5 : 2, position: "relative" }}
      >
        {/* One outlined group: a single border, inner borders stripped,
            dividers between segments, button attached flush on the right. */}
        <Box
          sx={{
            display: "flex",
            alignItems: "stretch",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
            bgcolor: "background.paper",
            "&:focus-within": { borderColor: "primary.main" },
          }}
        >
          {multi ? (
            <Fragment>
              <Select
                size="small"
                value={domain}
                onChange={(e) => pickDomain(e.target.value)}
                disabled={busy || options.length === 0}
                aria-label={t("MULTI_PICK_CONNECTOR")}
                sx={{
                  flexShrink: 0,
                  "& .MuiOutlinedInput-notchedOutline": { border: 0 },
                }}
                // Closed: only the selected connector's mark. The names live in
                // the open list, which keeps the closed control narrow enough
                // to leave the search field usable in a small embed.
                renderValue={(val) => (
                  <Box
                    component="img"
                    src={connectorStyle(val as DOMAIN).logo}
                    alt={DOMAINS[val as DOMAIN]?.label ?? String(val)}
                    sx={{ height: 22, display: "block" }}
                  />
                )}
              >
                {options.map((c) => (
                  <MenuItem key={c.domain} value={c.domain} sx={{ gap: 1 }}>
                    <Box
                      component="img"
                      src={connectorStyle(c.domain).logo}
                      alt=""
                      sx={{ height: 20, width: 20, flexShrink: 0 }}
                    />
                    {c.label}
                  </MenuItem>
                ))}
              </Select>
              <Divider orientation="vertical" flexItem />
            </Fragment>
          ) : null}

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Search
              key={`${domain}-${resetToken}`}
              domain={multi ? domain : undefined}
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
            onClick={submit}
            disabled={busy || !value}
            sx={{ borderRadius: 0, flexShrink: 0, px: 2 }}
          >
            {t("ADD")}
          </Button>
        </Box>

        <WidgetStatus
          adding={adding}
          result={result}
          sync={sync}
          lastSync={lastSync}
          onSync={(days) => {
            setResult(null);
            void sync.sync(days);
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

/**
 * How far back a re-sync may reach, in days. `0` means every synced row.
 *
 * Sync's default is still "rows that have never been synced", which is what
 * makes adding an entry cheap. But provider data moves after a row is filled in
 * — a rating settles, a release date shifts — and nothing could ever pick that
 * up, because a synced row was permanently excluded by its own sync date.
 */
const RESYNC_AGES = [7, 30, 90, 0] as const;

/** "Sync now" for new rows, with a menu for refreshing older ones. */
function SyncButton({
  busy,
  onSync,
}: {
  busy: boolean;
  onSync: (days?: number) => void;
}) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const run = (days?: number) => {
    setAnchor(null);
    onSync(days);
  };

  return (
    <>
      <ButtonGroup
        size="small"
        variant="text"
        disabled={busy}
        sx={{ flexShrink: 0 }}
      >
        <Button
          onClick={() => run()}
          sx={{ minWidth: 0, px: 1, fontSize: 12, border: 0 }}
        >
          {t("SYNC_NOW")}
        </Button>
        <Button
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label={t("SYNC_OPTIONS")}
          aria-haspopup="menu"
          sx={{ minWidth: 0, px: 0.25, border: 0 }}
        >
          <ExpandMore sx={{ fontSize: 16 }} />
        </Button>
      </ButtonGroup>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        // Cap to the viewport so the list scrolls instead of being cut off by
        // the iframe's edge. A Notion embed is a fixed-height frame that cannot
        // grow to fit a popup, and this menu is taller than a short one.
        slotProps={{
          paper: { sx: { maxHeight: "min(320px, calc(100vh - 16px))" } },
        }}
      >
        <MenuItem onClick={() => run()}>
          <ListItemText
            primary={t("SYNC_NEW_ONLY")}
            secondary={t("SYNC_NEW_ONLY_HINT")}
            slotProps={{
              primary: { variant: "body2" },
              secondary: { variant: "caption" },
            }}
          />
        </MenuItem>

        <Divider />

        {/* Re-syncing overwrites, so say so once here rather than on each row.
            Not sticky: in a short embed the menu scrolls, and a pinned heading
            just sits on top of the option passing underneath it. */}
        <ListSubheader disableSticky sx={{ lineHeight: 2, fontSize: 11 }}>
          {t("SYNC_REFRESH_HEADING")}
        </ListSubheader>

        {RESYNC_AGES.map((days) => (
          <MenuItem key={days} onClick={() => run(days)}>
            <ListItemText
              primary={
                days === 0
                  ? t("SYNC_EVERYTHING")
                  : t("SYNC_OLDER_THAN", { days })
              }
              slotProps={{ primary: { variant: "body2" } }}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/**
 * The one line under the input that says what just happened.
 *
 * Occupies a fixed row whatever the state, so the widget never changes height
 * — a growing widget inside a fixed-height Notion embed just gets clipped.
 */
function WidgetStatus({
  adding,
  result,
  sync,
  lastSync,
  onSync,
}: {
  adding: boolean;
  result: Result | null;
  sync: ReturnType<typeof useSync>;
  lastSync: ReturnType<typeof readLastSync>;
  onSync: (days?: number) => void;
}) {
  const { t } = useTranslation();
  const busy = adding || sync.running;

  const dot = (color: string) => (
    <Box
      sx={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        bgcolor: color,
        flexShrink: 0,
      }}
    />
  );

  let indicator = dot("text.disabled");
  let text = lastSync
    ? t("LAST_SYNC", {
        when: relativeTime(lastSync.at),
        items: lastSync.total,
      })
    : t("NEVER_SYNCED");

  if (sync.running) {
    indicator = dot("primary.main");
    text =
      sync.total && sync.current !== undefined
        ? t("SYNC_PROGRESS", { current: sync.current, total: sync.total })
        : sync.message || t("SYNCING");
  } else if (adding) {
    indicator = dot("primary.main");
    text = t("ADDING");
  } else if (result) {
    indicator = dot(result.kind === "ok" ? "success.main" : "error.main");
    text = result.message;
  } else if (sync.message) {
    indicator = dot(sync.error ? "error.main" : "success.main");
    text = sync.message;
  }

  const fraction =
    sync.running && sync.total
      ? Math.round(((sync.current ?? 0) / sync.total) * 100)
      : undefined;

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {indicator}
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ minWidth: 0, flexGrow: 1 }}
        >
          {text}
        </Typography>

        {result?.url ? (
          <Link
            variant="caption"
            href={result.url.replace(/^https:\/\//, "notion://")}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ flexShrink: 0 }}
          >
            {t("OPEN")}
          </Link>
        ) : null}

        <SyncButton busy={busy} onSync={onSync} />
      </Stack>

      {/* Determinate whenever the backend has told us the total, so "12" reads
          as progress rather than as a number with no scale. */}
      {sync.running ? (
        <LinearProgress
          variant={fraction === undefined ? "indeterminate" : "determinate"}
          value={fraction}
          sx={{ height: 3, borderRadius: 2 }}
        />
      ) : null}
    </Stack>
  );
}
