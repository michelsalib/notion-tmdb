import {
  Alert,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  TextField,
} from "@mui/material";
import type { DbConfig, DOMAIN, UserConfig } from "backend/src/types";
import { Fragment, useEffect, useState } from "react";
import { DbConfigForm } from "./DbConfigForm";
import { EmbedPage } from "./EmbedPage";
import { Navigation } from "./Navigation";

async function loadUserData<T extends DbConfig>(): Promise<UserConfig<T>> {
  const resp = await fetch("/api/config");

  return await resp.json();
}

export function UserPage<T extends DbConfig>({
  userId,
  domain,
}: {
  userId: string;
  domain: DOMAIN;
}) {
  const [userConfig, setUserConfig] = useState<UserConfig<T> | undefined>(
    undefined,
  );
  const [newDbConfig, setNewDbConfig] = useState<T | undefined>(undefined);

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
    await fetch("/api/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dbConfig: newDbConfig,
      }),
    });
  }

  return (
    <Container maxWidth="sm" sx={{ padding: 2 }}>
      <Navigation domain={domain} />

      <Stack direction="column" spacing={2} sx={{ padding: 2 }}>
        {userConfig.dbConfig ? (
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
            <Paper>
              <EmbedPage domain={domain} />
            </Paper>
          </Fragment>
        ) : (
          <Alert variant="outlined" severity="warning">
            Before continue you need to configture the connection to your notion
            database
          </Alert>
        )}

        <DbConfigForm<T>
          domain={domain}
          notionDatabases={userConfig.notionDatabases}
          initialConfig={userConfig.dbConfig}
          onConfigChange={(newConfig) => setNewDbConfig(newConfig)}
        />

        <Button onClick={save}>Save</Button>
      </Stack>
    </Container>
  );
}
