import { createTheme, CssBaseline, ThemeProvider, useMediaQuery } from "@mui/material";
import { useMemo, useState } from "react";
import { EmbedPage } from "./EmbedPage";
import { Login } from "./Login";
import { UserPage } from "./UserPage";

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
    const [loggedIn] = useState(loginState());

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



    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {loggedIn.status == "none" ? <Login /> : ''}
            {loggedIn.status == "embed" ? <EmbedPage /> : ''}
            {loggedIn.status == "sso" ? <UserPage userId={loggedIn.userId as string} /> : ''}
        </ThemeProvider>
    );
}

