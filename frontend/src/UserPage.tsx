import {
  Alert,
  Button,
  CircularProgress,
  Container,
  LinearProgress,
  Paper,
  Stack,
  TextField,
} from "@mui/material";
import type { Config } from "backend/src/types";
import { Fragment, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Backup } from "./Backup";
import {
  AuthContext,
  ConfigContext,
  DomainContext,
  SnackbarContext,
} from "./Context";
import { DbConfigForm } from "./DbConfigForm";
import { EmbedPage } from "./EmbedPage";
import { Navigation } from "./Navigation";

export function UserPage() {
  const { domain } = useContext(DomainContext);
  const auth = useContext(AuthContext);
  const { t } = useTranslation();
  const userConfig = useContext(ConfigContext);
  const [newConfig, setNewConfig] = useState<Config | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const { setSnackbar } = useContext(SnackbarContext);

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
          config: newConfig,
        }),
      });

      if (response.status != 200) {
        setSnackbar({
          open: true,
          message: t("SETTINGS_FAILURE"),
          color: "error",
        });

        return;
      }

      setSnackbar({
        open: true,
        message: t("SETTINGS_SUCESS"),
        color: "success",
      });
    } catch {
      setSnackbar({
        open: true,
        message: t("SETTINGS_FAILURE"),
        color: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ padding: 2 }}>
      <Navigation />

      <Stack direction="column" spacing={2} sx={{ padding: 2 }}>
        {domain == "backup" ||
        domain == "BitwardenBackup" ||
        userConfig.config ? (
          <Fragment>
            <Alert variant="outlined" severity="info">
              Your plugin is ready to be embeded in notion
              <TextField
                defaultValue={`${window.location.origin}?userId=${auth.userId}`}
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
            <Paper>
              {domain == "backup" || domain == "BitwardenBackup" ? (
                <Backup />
              ) : (
                <EmbedPage />
              )}
            </Paper>
          </Fragment>
        ) : (
          <Alert variant="outlined" severity="warning">
            Before continue you need to configture the connection to your notion
            database
          </Alert>
        )}

        {domain != "backup" && domain != "BitwardenBackup" ? (
          <Fragment>
            <DbConfigForm
              notionDatabases={userConfig.notionDatabases as any}
              initialConfig={userConfig.config as any}
              onConfigChange={(newConfig) => setNewConfig(newConfig as any)}
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
    </Container>
  );
}
