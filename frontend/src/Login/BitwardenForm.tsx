import SecurityIcon from "@mui/icons-material/Security";
import {
  Alert,
  Button,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

const API_KEY_URL =
  "https://vault.bitwarden.com/#/settings/security/security-keys";

export function BitwardenForm() {
  const { t } = useTranslation();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const login = useCallback(() => {
    window.location.href = `${window.location.origin}/login?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  }, [clientId, clientSecret]);

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Typography variant="body2">
        <Trans
          i18nKey="BW_INTRO"
          components={{
            keys: (
              <Link
                href={API_KEY_URL}
                target="_blank"
                rel="noopener noreferrer"
              />
            ),
          }}
        />
      </Typography>

      <Alert severity="info" variant="outlined" icon={<SecurityIcon />}>
        {t("BW_ENCRYPTED")}
      </Alert>

      <TextField
        required
        size="small"
        label={t("BW_CLIENT_ID")}
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
      />
      {/* type="password": this is half of a credential pair, and it used to
          render in the clear in a field people fill in on a shared screen. */}
      <TextField
        required
        size="small"
        type="password"
        label={t("BW_CLIENT_SECRET")}
        value={clientSecret}
        onChange={(e) => setClientSecret(e.target.value)}
      />

      <Button
        variant="contained"
        size="large"
        onClick={login}
        disabled={!clientId || !clientSecret}
        sx={{ alignSelf: "flex-start" }}
      >
        {t("BW_SUBMIT")}
      </Button>
    </Stack>
  );
}
