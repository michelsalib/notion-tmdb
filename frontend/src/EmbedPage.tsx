import {
  Alert,
  AlertColor,
  Button,
  LinearProgress,
  Snackbar,
  Stack,
} from "@mui/material";
import type { Suggestion } from "backend/src/types";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "./Search";

export function EmbedPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState<Suggestion | null>(null);
  const [alert, setAlert] = useState<{
    open: boolean;
    message: string;
    severity: AlertColor;
  }>({ open: false, message: "", severity: "success" });

  async function submit() {
    if (!value) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/add?id=" + value.id, {
        method: "POST",
      });

      if (response.status != 200) {
        setAlert({
          open: true,
          message: t("ADD_FAILURE"),
          severity: "error",
        });

        return;
      }

      setAlert({
        open: true,
        message: t("ADD_SUCCESS"),
        severity: "success",
      });
    } catch {
      setAlert({
        open: true,
        message: t("ADD_FAILURE"),
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function sync() {
    setLoading(true);

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
      });

      if (response.status != 200) {
        setAlert({
          open: true,
          message: t("SYNC_FAILURE"),
          severity: "error",
        });

        return;
      }

      setAlert({
        open: true,
        message: t("SYNC_SUCESS"),
        severity: "success",
      });
    } catch {
      setAlert({
        open: true,
        message: t("SYNC_FAILURE"),
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

      <Stack direction="column" spacing={2} sx={{ padding: 2 }}>
        <Stack direction="row" spacing={2}>
          <Search onChange={(m) => setValue(m)} />
          <Button
            variant="contained"
            size="large"
            onClick={submit}
            disabled={loading || !value}
          >
            Create
          </Button>
        </Stack>
        <Button
          variant="contained"
          size="large"
          color="success"
          onClick={sync}
          disabled={loading}
        >
          Sync all
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
