import {
  Alert,
  createTheme,
  CssBaseline,
  Snackbar,
  ThemeProvider,
  useMediaQuery,
} from "@mui/material";
import * as colors from "@mui/material/colors";
import { UserConfig } from "backend/src/types";
import { useContext, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Backup } from "./Backup";
import {
  AuthContext,
  ConfigContext,
  DomainContext,
  SnackbarContext,
  SnackbarState,
} from "./Context";
import { EmbedPage } from "./EmbedPage";
import { Footer } from "./Footer";
import "./i18n";
import { Login } from "./Login";
import { UserPage } from "./UserPage";

export function App() {
  const loggedIn = useContext(AuthContext);
  const { domain, pre, post } = useContext(DomainContext);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    color: "success",
    message: "",
  });
  const [config, setConfig] = useState<UserConfig<any> | null>(null);
  const { t } = useTranslation();

  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: prefersDarkMode ? "dark" : "light",
          primary: colors[t("PRIMARY_COLOR") as keyof typeof colors] as any,
          background: {
            default: prefersDarkMode ? "rgb(25, 25, 25)" : undefined,
          },
        },
      }),
    [prefersDarkMode],
  );
  useEffect(() => {
    if (loggedIn.status != "none") {
      fetch("/api/config")
        .then((r) => r.json())
        .then((r) => setConfig(r as any));
    }
  }, []);

  return (
    <ConfigContext.Provider value={config}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Helmet>
          <title>
            {pre} - {post}
          </title>
          <link rel="icon" type="image/jpeg" href={t("LOGO_PATH")} />
        </Helmet>
        <SnackbarContext.Provider value={{ snackbar, setSnackbar }}>
          {loggedIn.status == "none" ? <Login /> : ""}
          {loggedIn.status == "embed" ? (
            domain == "backup" ? (
              <Backup />
            ) : (
              <EmbedPage />
            )
          ) : (
            ""
          )}
          {loggedIn.status == "sso" ? <UserPage /> : ""}
          {loggedIn.status != "embed" ? <Footer /> : ""}

          <Snackbar
            open={snackbar.open}
            onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
            anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
          >
            <Alert
              variant="filled"
              severity={snackbar.color}
              onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
            >
              {snackbar.message}
            </Alert>
          </Snackbar>
        </SnackbarContext.Provider>
      </ThemeProvider>
    </ConfigContext.Provider>
  );
}
