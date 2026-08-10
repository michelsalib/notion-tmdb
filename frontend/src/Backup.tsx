import {
  Box,
  Button,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { UserConfig } from "backend/src/types";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfigContext, SnackbarContext } from "./Context";
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

function label(backup: StoredBackup): string {
  return `${new Date(backup.date).toLocaleString()} · ${formatSize(backup.size)}`;
}

export function Backup() {
  const { t } = useTranslation();
  const { setSnackbar } = useContext(SnackbarContext);
  const config = useContext(ConfigContext) as UserConfig<"backup"> | null;
  // Local copy of the history: the config context is fetched once at app
  // start, so without this a run you just watched finish would not appear in
  // the list until a reload.
  const [refreshed, setRefreshed] = useState<StoredBackup[] | null>(null);
  const [selected, setSelected] = useState("");

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

  async function download() {
    try {
      const response = await fetch(
        current
          ? `/api/backup?key=${encodeURIComponent(current.key)}`
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
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Button
          variant="contained"
          onClick={() => void sync.sync()}
          loading={sync.running}
        >
          {t("BACKUP_CREATE")}
        </Button>
        <Button
          variant="outlined"
          onClick={download}
          disabled={sync.running || !current}
        >
          {t("BACKUP_DOWNLOAD")}
        </Button>

        <Box sx={{ flexGrow: 1 }} />

        <Stack sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {history.length > 1 ? t("BACKUP_CHOOSE") : t("BACKUP_LAST")}
          </Typography>
          {/* The picker earns its space only once there is a choice to make. */}
          {history.length > 1 ? (
            <Select
              value={current?.key ?? ""}
              onChange={(event) => setSelected(event.target.value)}
              variant="standard"
              disabled={sync.running}
              sx={{ fontSize: "0.875rem" }}
            >
              {history.map((backup) => (
                <MenuItem key={backup.key} value={backup.key}>
                  {label(backup)}
                </MenuItem>
              ))}
            </Select>
          ) : (
            <Typography variant="body2" noWrap>
              {current
                ? new Date(current.date).toLocaleString()
                : t("BACKUP_NEVER")}
            </Typography>
          )}
        </Stack>
      </Stack>

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
