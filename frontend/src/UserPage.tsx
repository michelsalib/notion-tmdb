import {
  Alert,
  AlertColor,
  Button,
  CircularProgress,
  Container,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  TextField,
} from "@mui/material";
import type { DOMAIN, DomainToDbConfig, UserConfig } from "backend/src/types";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Backup } from "./Backup";
import { DbConfigForm } from "./DbConfigForm";
import { EmbedPage } from "./EmbedPage";
import { Navigation } from "./Navigation";

async function loadUserData<T extends DOMAIN>(): Promise<UserConfig<T>> {
  const resp = await fetch("/api/config");

  return await resp.json();
}

export function UserPage<T extends DOMAIN>({
  userId,
  domain,
}: {
  userId: string;
  domain: T;
}) {
  const { t } = useTranslation();
  const [userConfig, setUserConfig] = useState<UserConfig<T> | undefined>(
    undefined,
  );
  const [newDbConfig, setNewDbConfig] = useState<
    DomainToDbConfig<T> | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{
    open: boolean;
    message: string;
    severity: AlertColor;
  }>({ open: false, message: "", severity: "success" });

  useEffect(() => {
    loadUserData<T>().then((data) => setUserConfig(data));
  }, []);

  if (!userConfig) {
    return (
      <Stack alignItems={"center"} sx={{ margin: 5 }}>
        <CircularProgress />
      </Stack>
    );
  }

  async function save() {
    setLoading(true);

    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dbConfig: newDbConfig,
        }),
      });

      if (response.status != 200) {
        setAlert({
          open: true,
          message: t("SETTINGS_FAILURE"),
          severity: "error",
        });

        return;
      }

      setAlert({
        open: true,
        message: t("SETTINGS_SUCESS"),
        severity: "success",
      });
    } catch {
      setAlert({
        open: true,
        message: t("SETTINGS_FAILURE"),
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ padding: 2 }}>
      <Navigation domain={domain} />

      <Stack direction="column" spacing={2} sx={{ padding: 2 }}>
        {domain == "backup" || userConfig.dbConfig ? (
          <Fragment>
            <Alert variant="outlined" severity="info">
              Your plugin is ready to be embeded in notion
              <TextField
                defaultValue={window.location.origin + "?userId=" + userId}
                size="small"
                slotProps={{
                  input: {
                    readOnly: true,
                    onClick: (i) => (i.target as HTMLInputElement).select(),
                  },
                }}
                sx={{ width: "100%" }}
              />
            </Alert>
            <Paper>{domain == "backup" ? <Backup /> : <EmbedPage />}</Paper>
          </Fragment>
        ) : (
          <Alert variant="outlined" severity="warning">
            Before continue you need to configture the connection to your notion
            database
          </Alert>
        )}

        {domain != "backup" ? (
          <Fragment>
            <DbConfigForm<T>
              domain={domain}
              notionDatabases={userConfig.notionDatabases}
              initialConfig={userConfig.dbConfig}
              onConfigChange={(newConfig) => setNewDbConfig(newConfig)}
            />

            <Button
              variant="contained"
              onClick={save}
              disabled={loading}
              sx={{
                display: "block",
              }}
            >
              Save
              {loading ? (
                <LinearProgress
                  sx={{
                    marginBottom: "-4px", // has it is hardcoded within the component
                  }}
                ></LinearProgress>
              ) : (
                ""
              )}
            </Button>
          </Fragment>
        ) : (
          ""
        )}
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
    </Container>
  );
}
