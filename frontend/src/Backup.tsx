import {
  Alert,
  AlertColor,
  Button,
  LinearProgress,
  Snackbar,
  Stack,
} from "@mui/material";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";

export function Backup() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{
    open: boolean;
    message: string;
    severity: AlertColor;
  }>({ open: false, message: "", severity: "success" });

  async function backup() {
    setLoading(true);

    try {
      const response = await fetch("/api/backup", {
        method: "POST",
      });

      if (response.status != 200) {
        setAlert({
          open: true,
          message: t("BACKUP_FAILURE"),
          severity: "error",
        });

        return;
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
