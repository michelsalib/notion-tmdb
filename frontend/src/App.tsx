import {
  createTheme,
  CssBaseline,
  ThemeProvider,
  useMediaQuery,
} from "@mui/material";
import * as colors from "@mui/material/colors";
import type { DOMAIN } from "backend/src/types";
import { useMemo } from "react";
import { EmbedPage } from "./EmbedPage";
import "./i18n";
import { Login } from "./Login";
import { UserPage } from "./UserPage";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";

type LOGIN_STATE = "sso" | "embed" | "none";

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
    status: "none",
  };
}

export function domainState(): DOMAIN {
  const unlinted = /notion-(\w+)/.exec(window.location.origin)?.[1];

  if (unlinted == "gbook") {
    return "GBook";
  }

  return "TMDB";
}

export function App() {
  const loggedIn = useMemo(() => loginState(), []);
  const domain = useMemo(() => domainState(), []);
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

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Helmet>
        <title>{t("TITLE")}</title>
        <link rel="icon" type="image/jpeg" href={t("LOGO_PATH")} />
      </Helmet>
      {loggedIn.status == "none" ? <Login domain={domain} /> : ""}
      {loggedIn.status == "embed" ? <EmbedPage /> : ""}
      {loggedIn.status == "sso" ? (
        <UserPage userId={loggedIn.userId as string} domain={domain} />
      ) : (
        ""
      )}
    </ThemeProvider>
  );
}
