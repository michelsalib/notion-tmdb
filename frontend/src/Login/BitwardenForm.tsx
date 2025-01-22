import {
  Button,
  FormControl,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SecurityIcon from "@mui/icons-material/Security";
import { useCallback, useState } from "react";

export function BitwardenForm() {
  const [clientId, seltClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const login = useCallback(() => {
    window.location.href = `${window.location.origin}/login?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  }, [clientId, clientSecret]);

  return (
    <Stack spacing={2}>
      <Typography>
        To access your vault, you need to provide{" "}
        <Link href="https://vault.bitwarden.com/#/settings/security/security-keys">
          your api key from Bitwarden
        </Link>
        .
      </Typography>
      <Typography>
        <SecurityIcon sx={{ verticalAlign: "text-bottom" }} /> The accessed
        vault stays encrypted with your master password, preventing us to read
        any of its crypted data.
      </Typography>
      <FormControl required>
        <TextField
          required
          label="Client id"
          value={clientId}
          onChange={(e) => seltClientId(e.target.value)}
        ></TextField>
      </FormControl>
      <FormControl required>
        <TextField
          required
          label="Client secret"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
        ></TextField>
      </FormControl>
      <Button variant="contained" onClick={login}>
        Login
      </Button>
    </Stack>
  );
}
