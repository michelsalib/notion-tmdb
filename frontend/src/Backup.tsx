import {
  Alert,
  AlertColor,
  Button,
  LinearProgress,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { Fragment, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfigContext } from "./Context";
import { UserConfig } from "backend/src/types";
import { streaming } from "./stream";

export function Backup() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{
    open: boolean;
    message: string;
    severity: AlertColor;
  }>({ open: false, message: "", severity: "success" });
  const config = useContext(ConfigContext) as UserConfig<"backup">;

  async function backup() {
    setLoading(true);

    try {
      for await (const chunk of streaming("/api/sync")) {
        const message = chunk
          .split(".")
          .filter((i) => !!i)
          .pop()!;

        setAlert({
          message,
          open: true,
          severity: "info",
        });
      }

      setAlert({
        open: true,
        message: t("BACKUP_SUCCESS"),
        severity: "success",
      });
    } catch {
      setAlert({
        open: true,
        message: t("BACKUP_FAILURE"),
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    setLoading(true);

    try {
      const response = await fetch("/api/backup");

      if (response.status != 200) {
        setAlert({
          open: true,
          message: t("BACKUP_RETRIEVAL_FAILURE"),
          severity: "error",
        });

        return;
      }

      location.href = (await response.json()).link;
    } catch {
      setAlert({
        open: true,
        message: t("BACKUP_RETRIEVAL_FAILURE"),
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Fragment>
      {loading ? (
        <LinearProgress
          sx={{ position: "absolute", top: 0, left: 0, right: 0 }}
        />
      ) : (
        ""
      )}

      <Stack direction="row" spacing={2} sx={{ padding: 2 }}>
        <Button
          variant="contained"
          size="large"
          onClick={backup}
          disabled={loading}
        >
          Create
        </Button>
        <Button
          variant="contained"
          size="large"
          color="success"
          onClick={download}
          disabled={loading}
        >
          Download
        </Button>
        <Stack direction="column">
          <Typography variant="caption">Last backup made on</Typography>
          <Typography>
            {new Date(config.backupDate!).toLocaleString()}
          </Typography>
        </Stack>
      </Stack>

      <Snackbar
        open={alert.open}
        onClose={() => setAlert((p) => ({ ...p, open: false }))}
        autoHideDuration={5000}
        anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
      >
        <Alert
          variant="filled"
          severity={alert.severity}
          onClose={() => setAlert((p) => ({ ...p, open: false }))}
        >
          {alert.message}
        </Alert>
      </Snackbar>
    </Fragment>
  );
}
