import { Button, Stack, Typography } from "@mui/material";
import { UserConfig } from "backend/src/types";
import { Fragment, useContext } from "react";
import { useTranslation } from "react-i18next";
import { ConfigContext, SnackbarContext } from "./Context";
import { StreamButton } from "./StreamButton";

export function Backup() {
  const { t } = useTranslation();
  const { setSnackbar } = useContext(SnackbarContext);
  const config = useContext(ConfigContext) as UserConfig<"backup">;

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
    <Fragment>
      <Stack direction="row" spacing={2} sx={{ padding: 2 }}>
        <StreamButton>Create</StreamButton>
        <Button variant="contained" size="large" onClick={download}>
          Download
        </Button>
        <Stack direction="column">
          <Typography variant="caption">Last backup made on</Typography>
          <Typography>
            {new Date(config.backupDate!).toLocaleString()}
          </Typography>
        </Stack>
      </Stack>
    </Fragment>
  );
}
