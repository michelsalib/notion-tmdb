import { AlertColor } from "@mui/material";
import {
  ALL_DOMAINS,
  type DOMAIN,
  DOMAINS,
  type DomainDefinition,
} from "backend/src/domains";
import { UserConfig } from "backend/src/types";
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
  url?: string;
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

export type PreDomain = DomainDefinition["pre"];
export type PostDomain = DomainDefinition["post"];

// Resolved from the shared DOMAINS registry (backend/src/domains.ts) by
// matching the hostname against each connector's subdomain, rather than a
// hand-maintained regex plus an if-chain that had to be kept in step with it.
export function domainState(): {
  domain: DOMAIN;
  pre: PreDomain;
  post: PostDomain;
} {
  const origin = window.location.origin;

  const match = ALL_DOMAINS.find((domain) =>
    origin.includes(DOMAINS[domain].subdomain),
  );

  const domain = match ?? "TMDB";
  const { pre, post } = DOMAINS[domain];

  return { domain, pre, post };
}
