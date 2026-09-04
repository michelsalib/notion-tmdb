import {
  Button,
  CssBaseline,
  Snackbar,
  ThemeProvider,
  useMediaQuery,
} from "@mui/material";
import { UserConfig } from "backend/src/types";
import { useContext, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Backup } from "./Backup";
import { ConnectorWidget } from "./ConnectorWidget";
import {
  AuthContext,
  ConfigContext,
  DomainContext,
  SnackbarContext,
  SnackbarState,
} from "./Context";
import { Footer } from "./Footer";
import "./i18n";
import { Login } from "./Login";
import { notionHref } from "./notionLink";
import { buildTheme, connectorLabel, connectorStyle } from "./theme";
import { UserPage } from "./UserPage";
import { Note } from "./ui/Note";

export function App() {
  const loggedIn = useContext(AuthContext);
  const { domain, pre } = useContext(DomainContext);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    color: "success",
    message: "",
  });
  const [config, setConfig] = useState<UserConfig<any> | null>(null);
  const { t } = useTranslation();

  // Opt-in multi-connector embed: one widget with a connector dropdown, served
  // from any host (the picked connector is sent per-request, not read from the
  // subdomain). Kept off the default embed so single-connector hosts stay lean.
  const multi = useMemo(
    () => new URLSearchParams(window.location.search).has("multi"),
    [],
  );

  const embedded = loggedIn.status == "embed";
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(
    () => buildTheme(domain, prefersDarkMode ? "dark" : "light", embedded),
    [domain, prefersDarkMode, embedded],
  );

  useEffect(() => {
    if (loggedIn.status != "none") {
      void fetch("/api/config")
        .then((r) => r.json())
        .then((r) => setConfig(r));
    }
  }, []);

  return (
    <ConfigContext.Provider value={config}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Helmet>
          <title>{`${pre} ⇄ ${connectorLabel(domain)}`}</title>
          <link rel="icon" href={connectorStyle(domain).logo} />
        </Helmet>
        <SnackbarContext.Provider value={{ snackbar, setSnackbar }}>
          {loggedIn.status == "none" ? <Login /> : ""}
          {embedded ? (
            domain == "backup" || domain == "BitwardenBackup" ? (
              <Backup />
            ) : (
              <ConnectorWidget multi={multi} />
            )
          ) : (
            ""
          )}
          {loggedIn.status == "sso" ? <UserPage /> : ""}
          {!embedded ? <Footer /> : ""}

          {/*
            Full-page surfaces only. In an embed the widget reports inline
            instead: a Notion embed is often only about as tall as this toast,
            so a bottom-centre snackbar covered the very thing it was
            reporting on.
          */}
          <Snackbar
            open={snackbar.open && !embedded}
            autoHideDuration={6000}
            onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
            anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
          >
            <Note
              severity={snackbar.color}
              onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
              // The toast is the one note that floats, so it is the one that
              // needs a shadow to lift off whatever it lands on.
              sx={{ boxShadow: 3 }}
              action={
                snackbar.url ? (
                  <Button
                    color="inherit"
                    size="small"
                    href={notionHref(snackbar.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("OPEN")}
                  </Button>
                ) : undefined
              }
            >
              {snackbar.message}
            </Note>
          </Snackbar>
        </SnackbarContext.Provider>
      </ThemeProvider>
    </ConfigContext.Provider>
  );
}
