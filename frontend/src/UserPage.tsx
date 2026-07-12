import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  FormControlLabel,
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
import { MultiEmbedPage } from "./MultiEmbedPage";
import { Navigation } from "./Navigation";

// Connectors that share the search → add shape and can be combined into the
// single multi-connector embed widget (see MultiEmbedPage / computeDomain).
const SEARCH_DOMAINS = ["TMDB", "IGDB", "GBook", "BilletReduc"];

export function UserPage() {
  const { domain } = useContext(DomainContext);
  const auth = useContext(AuthContext);
  const { t } = useTranslation();
  const userConfig = useContext(ConfigContext);
  const [newConfig, setNewConfig] = useState<Config | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [multi, setMulti] = useState(false);
  const { setSnackbar } = useContext(SnackbarContext);

  const canMulti = SEARCH_DOMAINS.includes(domain);
  const embedUrl = `${window.location.origin}?userId=${auth.userId}${
    multi && canMulti ? "&multi=1" : ""
  }`;

  if (!userConfig) {
    return (
      <Stack sx={{ alignItems: "center", margin: 5 }}>
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
                value={embedUrl}
                size="small"
                slotProps={{
                  input: {
                    readOnly: true,
                    onClick: (i) => (i.target as HTMLInputElement).select(),
                  },
                }}
                sx={{ width: "100%" }}
              />
              {canMulti ? (
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={multi}
                      onChange={(e) => setMulti(e.target.checked)}
                    />
                  }
                  label="One widget for all my connectors (pick the source from a dropdown)"
                />
              ) : (
                ""
              )}
            </Alert>
            <Paper>
              {domain == "backup" || domain == "BitwardenBackup" ? (
                <Backup />
              ) : multi && canMulti ? (
                <MultiEmbedPage />
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
