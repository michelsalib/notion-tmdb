import { AlertColor } from "@mui/material";
import { DOMAIN, UserConfig } from "backend/src/types";
import { createContext } from "react";

export const AuthContext = createContext(loginState());
export const DomainContext = createContext(domainState());
export const ConfigContext = createContext<UserConfig<any> | null>(null);
export const SnackbarContext = createContext<{
  snackbar: SnackbarState;
  setSnackbar: (config: SnackbarState) => void;
}>(null as any);

export interface SnackbarState {
  open: boolean;
  message: string;
  color: AlertColor;
}

type LOGIN_STATE = "sso" | "embed" | "none";

function loginState(): {
  userId?: string;
  status: LOGIN_STATE;
} {
  const regex = /userId=([\w-.]+)/;

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

export type PreDomain = "Bitwarden" | "Notion";
export type PostDomain = "backup" | "GBook" | "GoCardless" | "TMDB" | "IGDB";

export function domainState(): {
  domain: DOMAIN;
  pre: PreDomain;
  post: PostDomain;
} {
  try {
    const [, pre, post]: any =
      /(bitwarden|notion)-(backup|gbook|gocardless|tmdb|igdb)/.exec(
        window.location.origin,
      )!;

    if (pre == "bitwarden") {
      return {
        domain: "BitwardenBackup",
        pre: "Bitwarden",
        post: "backup",
      };
    }

    if (post == "gbook") {
      return { domain: "GBook", pre: "Notion", post: "GBook" };
    }

    if (post == "igdb") {
      return { domain: "IGDB", pre: "Notion", post: "IGDB" };
    }

    if (post == "backup") {
      return { domain: "backup", pre: "Notion", post: "backup" };
    }

    if (post == "gocardless") {
      return { domain: "GoCardless", pre: "Notion", post: "GoCardless" };
    }
  } catch {
    // default
  }

  return { domain: "TMDB", pre: "Notion", post: "TMDB" };
}
