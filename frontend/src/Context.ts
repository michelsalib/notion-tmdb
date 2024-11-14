import { DOMAIN, UserConfig } from "backend/src/types";
import { createContext } from "react";

export const AuthContext = createContext(loginState());
export const DomainContext = createContext(domainState());
export const ConfigContext = createContext<UserConfig<any> | null>(null);

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

  if (unlinted == "backup") {
    return "backup";
  }

  if (unlinted == "gocardless") {
    return "GoCardless";
  }

  return "TMDB";
}
