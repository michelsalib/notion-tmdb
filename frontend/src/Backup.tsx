import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import { UserConfig } from "backend/src/types";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { ConfigContext, SnackbarContext } from "./Context";
import { useSync } from "./useSync";

export function Backup() {
  const { t } = useTranslation();
  const { setSnackbar } = useContext(SnackbarContext);
  const config = useContext(ConfigContext) as UserConfig<"backup">;
  const sync = useSync();

  async function download() {
    try {
      const response = await fetch("/api/backup");

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
        <Button variant="outlined" onClick={download} disabled={sync.running}>
          {t("BACKUP_DOWNLOAD")}
        </Button>

        <Box sx={{ flexGrow: 1 }} />

        <Stack sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {t("BACKUP_LAST")}
          </Typography>
          <Typography variant="body2" noWrap>
            {config?.backupDate
              ? new Date(config.backupDate).toLocaleString()
              : t("BACKUP_NEVER")}
          </Typography>
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
