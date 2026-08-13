import {
  Button,
  ButtonGroup,
  Collapse,
  Divider,
  LinearProgress,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import { UserConfig } from "backend/src/types";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfigContext, DomainContext, SnackbarContext } from "./Context";
import { RestorePanel } from "./Restore";
import { ChevronDown } from "./ui/icons";
import { useSync } from "./useSync";

/** A stored archive as it arrives over the wire — `date` is a JSON string. */
interface StoredBackup {
  key: string;
  date: string;
  size: number;
}

const UNITS = ["B", "kB", "MB", "GB"];

function formatSize(bytes: number): string {
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

/** Full form, for the menu — the one place with room for it. */
function label(backup: StoredBackup): string {
  return `${new Date(backup.date).toLocaleString()} · ${formatSize(backup.size)}`;
}

/**
 * A stamp for the tight places — the row caption and the restore panel's
 * source line.
 *
 * `toLocaleString()` in full is "13/08/2026, 14:23:05": a seconds field nobody
 * reads, in an embed with no width to spare.
 */
function shortDate(date: string): string {
  return new Date(date).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Short form, for the caption sharing a line with the buttons. */
function shortLabel(backup: StoredBackup): string {
  return `${shortDate(backup.date)} · ${formatSize(backup.size)}`;
}

/**
 * Download, with the archive history and Restore behind a chevron.
 *
 * This row was three peer buttons and a `Select` with `nowrap`: roughly 450px of
 * content in a Notion embed that is regularly narrower than that, and nothing
 * carried `flexShrink: 0`, so the buttons were squeezed under their labels and
 * every one of them wrapped mid-phrase ("Back up / now"). Same answer as
 * `ConnectorWidget`'s sync control — one primary action, the rare ones collapsed
 * into a menu, which costs no width at all.
 *
 * Choosing an older archive *downloads* it rather than arming a button
 * elsewhere. The two-step only existed because a `Select` cannot live inside the
 * button it feeds.
 */
function DownloadButton({
  history,
  current,
  busy,
  canRestore,
  onDownload,
  onPick,
  onRestore,
}: {
  history: StoredBackup[];
  /** The archive both Download and Restore currently act on. */
  current?: StoredBackup;
  busy: boolean;
  /** Notion only — a Bitwarden archive has no workspace to rebuild into. */
  canRestore: boolean;
  onDownload: () => void;
  onPick: (backup: StoredBackup) => void;
  onRestore: () => void;
}) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const choosable = history.length > 1;
  // With one archive and no restore, the chevron would open an empty menu.
  const hasMenu = canRestore || choosable;

  const run = (action: () => void) => {
    setAnchor(null);
    action();
  };

  return (
    <>
      <ButtonGroup
        size="small"
        variant="outlined"
        disabled={busy || !current}
        sx={{ flexShrink: 0 }}
      >
        <Button onClick={onDownload}>{t("BACKUP_DOWNLOAD")}</Button>
        {hasMenu ? (
          <Button
            onClick={(event) => setAnchor(event.currentTarget)}
            aria-label={t("BACKUP_OPTIONS")}
            aria-haspopup="menu"
            sx={{ minWidth: 0, px: 0.25 }}
          >
            <ChevronDown size={14} />
          </Button>
        ) : null}
      </ButtonGroup>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        // Capped to the viewport so ten archives scroll rather than being cut
        // off by the iframe's edge, which cannot grow to fit a popup.
        slotProps={{
          paper: { sx: { maxHeight: "min(320px, calc(100vh - 16px))" } },
        }}
      >
        {choosable ? (
          <ListSubheader disableSticky sx={{ lineHeight: 2, fontSize: 11 }}>
            {t("BACKUP_CHOOSE")}
          </ListSubheader>
        ) : null}

        {choosable
          ? history.map((backup) => (
              <MenuItem
                key={backup.key}
                selected={backup.key === current?.key}
                onClick={() => run(() => onPick(backup))}
              >
                <ListItemText
                  primary={label(backup)}
                  slotProps={{ primary: { variant: "body2" } }}
                />
              </MenuItem>
            ))
          : null}

        {canRestore && choosable ? <Divider /> : null}

        {canRestore ? (
          <MenuItem onClick={() => run(onRestore)}>
            <ListItemText
              primary={t("BACKUP_RESTORE")}
              slotProps={{ primary: { variant: "body2" } }}
            />
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}

export function Backup() {
  const { t } = useTranslation();
  const { setSnackbar } = useContext(SnackbarContext);
  const { domain } = useContext(DomainContext);
  const config = useContext(ConfigContext) as UserConfig<"backup"> | null;
  // Local copy of the history: the config context is fetched once at app
  // start, so without this a run you just watched finish would not appear in
  // the list until a reload.
  const [refreshed, setRefreshed] = useState<StoredBackup[] | null>(null);
  const [selected, setSelected] = useState("");
  /** The archive the open restore panel is for, or null when it is closed. */
  const [restoring, setRestoring] = useState<StoredBackup | null>(null);

  // Only the Notion connector: a Bitwarden archive stays encrypted with the
  // user's master password and has no workspace to be rebuilt into. This widget
  // serves both.
  const canRestore = domain === "backup";

  const history = (refreshed ??
    (config?.backups as unknown as StoredBackup[]) ??
    []) as StoredBackup[];
  const current =
    history.find((backup) => backup.key === selected) ?? history[0];

  const sync = useSync({
    onSettled: (state) => {
      if (!state.error) {
        void refresh();
      }
    },
  });

  async function refresh() {
    try {
      const response = await fetch("/api/config");
      const next = (await response.json()) as { backups?: StoredBackup[] };

      setRefreshed(next.backups ?? []);
      setSelected("");
    } catch {
      // The history is a nicety; failing to refresh it must not break the
      // widget, and the run itself has already succeeded by this point.
    }
  }

  async function download(backup?: StoredBackup) {
    // No key at all is the legacy flat `<userId>.zip`, which is all a user who
    // has not run a backup since the history landed still has.
    const target = backup ?? current;

    try {
      const response = await fetch(
        target
          ? `/api/backup?key=${encodeURIComponent(target.key)}`
          : "/api/backup",
      );

      if (response.status != 200) {
        setSnackbar({
          open: true,
          message: t("BACKUP_RETRIEVAL_FAILURE"),
          color: "error",
        });

        return;
      }

      location.href = (await response.json()).link;
    } catch {
      setSnackbar({
        open: true,
        message: t("BACKUP_RETRIEVAL_FAILURE"),
        color: "error",
      });
    }
  }

  return (
    <Stack spacing={1.5} sx={{ padding: 2 }}>
      {/* One line, at any width: two controls that never shrink, and a caption
          that takes what is left and ellipsises. */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Button
          size="small"
          variant="contained"
          onClick={() => void sync.sync()}
          loading={sync.running}
          sx={{ flexShrink: 0 }}
        >
          {t("BACKUP_CREATE")}
        </Button>

        <DownloadButton
          history={history}
          current={current}
          busy={sync.running}
          canRestore={canRestore}
          onDownload={() => void download()}
          // Picking an older archive moves what Download and Restore mean, so
          // the caption below has to be saying which one that is.
          onPick={(backup) => {
            setSelected(backup.key);
            void download(backup);
          }}
          onRestore={() => setRestoring(current ?? null)}
        />

        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ minWidth: 0, flexGrow: 1 }}
        >
          {current ? shortLabel(current) : t("BACKUP_NEVER")}
        </Typography>
      </Stack>

      {/* Bound to the archive that was chosen when it opened, not to whatever
          the picker says now: a restore takes minutes, and a dropdown moved
          while one is running must not change what the panel claims to be doing.
          Unmounted when closed, so reopening it does not show the last run. */}
      <Collapse in={Boolean(restoring)} unmountOnExit>
        {restoring ? (
          <RestorePanel
            backupKey={restoring.key}
            when={shortDate(restoring.date)}
            busy={sync.running}
            onClose={() => setRestoring(null)}
          />
        ) : null}
      </Collapse>

      {/* The stream reports inline rather than through the snackbar, which in
          an embed is about as tall as the widget it would be covering. */}
      {sync.running || sync.message ? (
        <Stack spacing={0.5}>
          <Typography
            variant="caption"
            color={sync.error ? "error" : "text.secondary"}
            noWrap
          >
            {sync.message || t("SYNCING")}
          </Typography>
          {sync.running ? (
            <LinearProgress sx={{ height: 3, borderRadius: 2 }} />
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
