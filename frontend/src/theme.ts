import { createTheme, type Theme } from "@mui/material";
import { type DOMAIN, DOMAINS } from "backend/src/domains";

/**
 * How each connector looks.
 *
 * The accent used to be a raw MUI hue name (`lightBlue`, `cyan`, `blue`) read
 * out of each connector's locale file, which caused two problems. Three of the
 * six resolved to near-identical blues, so the colour no longer told you which
 * connector you were in — the only job it had. And MUI's `getContrastText`
 * picks a button label against a 3:1 threshold, the bar for UI components
 * rather than the 4.5:1 one for text, so it flipped label colour mid-palette
 * and left three connectors shipping white labels at 3.1–3.7:1.
 *
 * These are explicit instead: every `onLight` clears 4.5:1 against white text,
 * every `onDark` clears 4.5:1 against the dark ground, and the six hues are
 * spread far enough apart to be told apart at a glance.
 */
export interface ConnectorStyle {
  /** Accent in light mode. White label text, ≥4.5:1. */
  onLight: string;
  /** Accent in dark mode. Dark label text, ≥4.5:1 against `DARK_GROUND`. */
  onDark: string;
  /** Connector mark, served from `frontend/static/`. */
  logo: string;
}

/** Notion's own page backgrounds, so an embed blends into the page hosting it. */
export const DARK_GROUND = "#191919";
const NOTION_LIGHT_PAGE = "#FFFFFF";
const DARK_SURFACE = "#232320";
const LIGHT_GROUND = "#F7F6F3";
const LIGHT_SURFACE = "#FFFFFF";

export const CONNECTOR_STYLES: Record<DOMAIN, ConnectorStyle> = {
  TMDB: { onLight: "#0B6E99", onDark: "#5BB8E0", logo: "/tmdb.svg" },
  IGDB: { onLight: "#6B3FD4", onDark: "#A88CF0", logo: "/igdb.svg" },
  GBook: { onLight: "#A85418", onDark: "#E0913F", logo: "/gbook.svg" },
  BilletReduc: {
    onLight: "#B4234A",
    onDark: "#F07A96",
    logo: "/billetreduc.svg",
  },
  backup: { onLight: "#0F7269", onDark: "#4FBFAF", logo: "/backup.jpeg" },
  BitwardenBackup: {
    onLight: "#2F53C8",
    onDark: "#8FA5F5",
    logo: "/BitwardenBackup.png",
  },
};

export function connectorStyle(domain: DOMAIN): ConnectorStyle {
  return CONNECTOR_STYLES[domain] ?? CONNECTOR_STYLES.TMDB;
}

export function connectorLabel(domain: DOMAIN): string {
  return DOMAINS[domain]?.label ?? domain;
}

/**
 * Build the app theme for one connector.
 *
 * The embed paints Notion's own page colour rather than going transparent.
 * Transparent looks tempting — the widget is an iframe on someone else's page —
 * but the palette is chosen from `prefers-color-scheme`, which reports the
 * viewer's OS, while the visible backdrop belongs to the host page's Notion
 * theme. When those disagree the text is picked for one ground and drawn on the
 * other, and a dark-mode widget on a light Notion page renders light grey on
 * white. Painting the ground keeps the widget legible whatever the host does,
 * and still blends in the usual case where the two themes agree.
 *
 * The full-page surfaces get a distinct ground so `Paper` has something to sit
 * on — in light mode that used to be left `undefined`, which meant white on
 * white and an invisible card.
 */
export function buildTheme(
  domain: DOMAIN,
  mode: "light" | "dark",
  embedded: boolean,
): Theme {
  const style = connectorStyle(domain);
  const dark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: dark ? style.onDark : style.onLight,
        contrastText: dark ? DARK_GROUND : "#FFFFFF",
      },
      background: {
        default: dark
          ? DARK_GROUND
          : embedded
            ? NOTION_LIGHT_PAGE
            : LIGHT_GROUND,
        paper: dark ? DARK_SURFACE : LIGHT_SURFACE,
      },
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily: [
        "ui-sans-serif",
        "-apple-system",
        "BlinkMacSystemFont",
        "Segoe UI",
        "Roboto",
        "Helvetica Neue",
        "Arial",
        "sans-serif",
      ].join(","),
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiCssBaseline: {
        styleOverrides: embedded
          ? undefined
          : {
              // Lets the footer sit at the bottom via `margin-top: auto`
              // instead of a fixed top margin, which left it floating in the
              // middle of any page shorter than the fold. Skipped in an embed,
              // where there is no footer and forcing a full-viewport body
              // would just add a scrollbar inside the iframe.
              body: {
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
              },
              "#root": {
                display: "flex",
                flexDirection: "column",
                flexGrow: 1,
              },
            },
      },
    },
  });
}
