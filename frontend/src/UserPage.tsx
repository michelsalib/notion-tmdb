import { Alert, Button, Container, Paper, Stack, TextField } from "@mui/material";
import type { DOMAIN, UserConfig } from "backend/src/types";
import { Fragment, useEffect, useState } from "react";
import { DbConfig } from "./DbConfig";
import { EmbedPage } from "./EmbedPage";
import { Navigation } from "./Navigation";

async function loadUserData(): Promise<UserConfig> {
    const resp = await fetch('/api/config');

    return await resp.json();
}

export function UserPage({ userId, domain }: { userId: string, domain: DOMAIN }) {
    const [userConfig, setUserConfig] = useState<UserConfig | undefined>(undefined);
    const [newDbConfig, setNewDbConfig] = useState<UserConfig['dbConfig'] | undefined>(undefined);

    useEffect(() => {
        loadUserData().then(data => setUserConfig(data));
    }, []);

    if (!userConfig) {
        return;
    }

    async function save() {
        await fetch('/api/config', {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                dbConfig: newDbConfig,
            }),
        })
    }

    return (
        <Container maxWidth="sm" sx={{ padding: 2 }}>
            <Navigation domain={domain} />

            <Stack direction="column" spacing={2} sx={{ padding: 2 }}>
                {userConfig.dbConfig ?
                    <Fragment>
                        <Alert variant="outlined" severity="info">
                            Your plugin is ready to be embeded in notion
                            <TextField
                                defaultValue={window.location.origin + '?userId=' + userId}
                                size="small"
                                slotProps={{
                                    input: {
                                        readOnly: true,
                                        onClick: (i) => (i.target as HTMLInputElement).select()
                                    }
                                }}
                                sx={{ width: '100%' }} />
                        </Alert>
                        <Paper>
                            <EmbedPage domain={domain} />
                        </Paper>
                    </Fragment > :
                    <Alert variant="outlined" severity="warning">
                        Before continue you need to configture the connection to your notion database
                    </Alert>
                }

                <DbConfig notionDatabases={userConfig.notionDatabases} initialConfig={userConfig.dbConfig} onConfigChange={newConfig => setNewDbConfig(newConfig)} />

                <Button onClick={save}>Save</Button>
            </Stack>
        </Container>
    );
}