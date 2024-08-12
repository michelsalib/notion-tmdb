import { Alert, AlertColor, Button, Container, createTheme, CssBaseline, LinearProgress, Snackbar, Stack, TextField, ThemeProvider, Typography, useMediaQuery } from "@mui/material";
import { Fragment, useMemo, useState } from "react";
import { DbConfig } from "./DbConfig";
import { Login } from "./Login";
import { Navigation } from "./Navigation";
import { SearchMovie } from "./SearchMovie";
import { Movie } from "./types";

type LOGIN_STATE = 'sso' | 'embed' | 'none';

function loginState(): {
    userId?: string;
    status: LOGIN_STATE;
} {
    const regex = /userId=([\w-]+)/;

    const paramExec = regex.exec(document.location.search);

    if (paramExec?.[1]) {
        return {
            status: "embed",
            userId: paramExec[1],
        };
    }

    const cookieExec = regex.exec(document.cookie);

    if (cookieExec?.[1]) {
        return {
            status: "sso",
            userId: cookieExec[1],
        };
    }

    return {
        status: 'none',
    }
}

export function App() {
    const [loading, setLoading] = useState(false);
    const [loggedIn] = useState(loginState());
    const [value, setValue] = useState<Movie | null>(null);
    const [alert, setAlert] = useState<{
        open: boolean;
        message: string;
        severity: AlertColor
    }>({ open: false, message: '', severity: 'success' });

    const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
    const theme = useMemo(
        () =>
            createTheme({
                palette: {
                    mode: prefersDarkMode ? 'dark' : 'light',
                    background: {
                        default: prefersDarkMode ? 'rgb(25, 25, 25)' : undefined,
                    }
                },
            }),
        [prefersDarkMode],
    );

    async function submit() {
        if (!value) {
            return;
        }

        setLoading(true);

        try {
            await fetch('/api/add?id=' + value.id, {
                method: 'POST',
            });

            setAlert({
                open: true,
                message: 'Movie succesfully added',
                severity: 'success'
            });
        }
        catch (err) {
            setAlert({
                open: true,
                message: 'Unable to add movie',
                severity: 'error'
            });
        }
        finally {
            setLoading(false);
        }
    }

    async function sync() {
        setLoading(true);

        try {
            await fetch('/api/sync', {
                method: 'POST',
            });

            setAlert({
                open: true,
                message: 'Movies succesfully synced',
                severity: 'success'
            });
        }
        catch (err) {
            setAlert({
                open: true,
                message: 'Unable to sync movies',
                severity: 'error'
            });
        }
        finally {
            setLoading(false);
        }
    }

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {loading ?
                <LinearProgress sx={{ position: "absolute", top: 0, left: 0, right: 0 }} /> :
                ''
            }
            <Container maxWidth="sm" sx={{ padding: 2 }}>
                {loggedIn.status == "sso" ?
                    <Navigation /> :
                    ''
                }

                {loggedIn.status != "none" ?
                    <Stack direction="column" spacing={2} sx={{ padding: 2 }}>

                        <Stack direction="row" spacing={2}>
                            <SearchMovie onMovieChange={m => setValue(m)} />
                            <Button variant="contained" size="large" onClick={submit} disabled={loading || !value}>Create</Button>
                        </Stack>
                        <Button variant="contained" size="large" color="success" onClick={sync} disabled={loading}>Sync all</Button>
                        {loggedIn.status == "sso" ?
                            <Fragment>
                                <Alert variant="outlined" severity="info">
                                    Your plugin is ready to be embeded in notion
                                    <TextField
                                        defaultValue={window.location.origin + '?userId=' + loggedIn.userId}
                                        size="small"
                                        InputProps={{
                                            readOnly: true,
                                        }}
                                        sx={{width: '100%'}}
                                    />
                                </Alert>
                                <DbConfig />
                            </Fragment>
                            :
                            ''
                        }
                    </Stack> :
                    <Login />
                }

                <Snackbar open={alert.open} onClose={() => setAlert(p => ({ ...p, open: false }))} autoHideDuration={5000} anchorOrigin={{ horizontal: 'center', vertical: 'bottom' }}>
                    <Alert variant="filled" severity={alert.severity} onClose={() => setAlert(p => ({ ...p, open: false }))}>
                        {alert.message}
                    </Alert>
                </Snackbar>
            </Container>
        </ThemeProvider>
    );
}

