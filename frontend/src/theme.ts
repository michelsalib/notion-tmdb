import { createTheme, type Theme } from "@mui/material";
import type { Shadows } from "@mui/material/styles";
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
  backup: { onLight: "#0F7269", onDark: "#4FBFAF", logo: "/backup.svg" },
  BitwardenBackup: {
    onLight: "#2F53C8",
    onDark: "#8FA5F5",
    logo: "/bitwarden-backup.svg",
  },
};

export function connectorStyle(domain: DOMAIN): ConnectorStyle {
  return CONNECTOR_STYLES[domain] ?? CONNECTOR_STYLES.TMDB;
}

export function connectorLabel(domain: DOMAIN): string {
  return DOMAINS[domain]?.label ?? domain;
}

/**
 * The ink, rules and semantic colours for one ground.
 *
 * The grounds above have been Notion's page colours for a while, but everything
 * drawn *on* them was still MUI's default `rgba(0,0,0,0.87)` text and
 * `rgba(0,0,0,0.12)` dividers — neutral black alphas over a warm ground. That
 * mismatch is most of what made the app read as an unstyled Material app that
 * happened to have the right background colour.
 *
 * The semantic hues are Notion's rather than Material's, and are used as a rail
 * and an icon rather than as a panel fill (see `MuiAlert` below), so they are
 * held to the 3:1 bar for graphical objects. The light warning and error are
 * darkened from Notion's own values, which are chosen for backgrounds and sit
 * at 2.7:1 against white.
 */
interface Ground {
  ink: string;
  ink2: string;
  ink3: string;
  divider: string;
  /** Input and control borders — deliberately stronger than a divider. */
  line: string;
  hover: string;
  success: string;
  error: string;
  warning: string;
  info: string;
}

const LIGHT: Ground = {
  ink: "#37352F",
  ink2: "rgba(55, 53, 47, 0.65)",
  ink3: "rgba(55, 53, 47, 0.4)",
  divider: "rgba(55, 53, 47, 0.11)",
  line: "rgba(55, 53, 47, 0.2)",
  hover: "rgba(55, 53, 47, 0.055)",
  success: "#448361",
  error: "#A8332F",
  warning: "#B8801F",
  info: "#337EA9",
};

const DARK: Ground = {
  ink: "rgba(255, 255, 255, 0.85)",
  ink2: "rgba(255, 255, 255, 0.52)",
  ink3: "rgba(255, 255, 255, 0.36)",
  divider: "rgba(255, 255, 255, 0.11)",
  line: "rgba(255, 255, 255, 0.22)",
  hover: "rgba(255, 255, 255, 0.055)",
  success: "#6FB890",
  error: "#EB7A76",
  warning: "#E0AB52",
  info: "#6BAED6",
};

const SANS = [
  "ui-sans-serif",
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "Roboto",
  "Helvetica Neue",
  "Arial",
  "sans-serif",
].join(",");

/**
 * The utility face, for eyebrows, field labels and property types.
 *
 * The app is pinned to the system stack on purpose (a webfont here used to
 * block first paint on a third-party request), which leaves one sans doing
 * every job. Pairing it with the system mono is what gives small labels a voice
 * without loading anything.
 */
const MONO = [
  "ui-monospace",
  "SFMono-Regular",
  "SF Mono",
  "Menlo",
  "Consolas",
  "Liberation Mono",
  "monospace",
].join(",");

/**
 * Three levels, not Material's twenty-five.
 *
 * MUI's ramp is a dual-layer umbra/penumbra pair tuned for raised paper, and it
 * is the reason every menu and the sticky save bar read as Material regardless
 * of their colours. Notion defines surfaces with a hairline and a soft ambient
 * shadow instead, so that is what these are: nothing, a resting card, and a
 * popover.
 */
function shadowRamp(dark: boolean): Shadows {
  const soft = dark
    ? "0 1px 2px rgba(0, 0, 0, 0.4)"
    : "0 1px 2px rgba(15, 15, 15, 0.06)";
  const popover = dark
    ? "rgba(15, 15, 15, 0.2) 0 0 0 1px, rgba(15, 15, 15, 0.3) 0 3px 6px, rgba(15, 15, 15, 0.5) 0 9px 24px"
    : "rgba(15, 15, 15, 0.05) 0 0 0 1px, rgba(15, 15, 15, 0.1) 0 3px 6px, rgba(15, 15, 15, 0.2) 0 9px 24px";

  return Array.from({ length: 25 }, (_unused, level) => {
    if (level === 0) {
      return "none";
    }

    return level <= 2 ? soft : popover;
  }) as unknown as Shadows;
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
  const ground = dark ? DARK : LIGHT;
  const accent = dark ? style.onDark : style.onLight;
  const surface = dark ? DARK_SURFACE : LIGHT_SURFACE;
  /** The focus ring, and the tint behind anything showing the accent quietly. */
  const accentSoft = `${accent}22`;

  return createTheme({
    palette: {
      mode,
      primary: {
        main: accent,
        contrastText: dark ? DARK_GROUND : "#FFFFFF",
      },
      text: {
        primary: ground.ink,
        secondary: ground.ink2,
        disabled: ground.ink3,
      },
      divider: ground.divider,
      success: { main: ground.success },
      error: { main: ground.error },
      warning: { main: ground.warning },
      info: { main: ground.info },
      action: {
        hover: ground.hover,
        selected: accentSoft,
      },
      background: {
        default: dark
          ? DARK_GROUND
          : embedded
            ? NOTION_LIGHT_PAGE
            : LIGHT_GROUND,
        paper: surface,
      },
    },
    shape: { borderRadius: 4 },
    shadows: shadowRamp(dark),
    typography: {
      fontFamily: SANS,
      // Notion's own reading size. At MUI's 16 the embed rendered noticeably
      // larger than the page hosting it, which is the one place this app must
      // not look like a visitor.
      fontSize: 14,
      // Used once, for the landing headline, so it carries its own responsive
      // step rather than making the one call site describe it.
      h1: {
        fontSize: "clamp(1.75rem, 5.5vw, 2.5rem)",
        fontWeight: 700,
        letterSpacing: "-0.03em",
        lineHeight: 1.08,
      },
      h2: {
        fontSize: "1.5rem",
        fontWeight: 700,
        letterSpacing: "-0.025em",
        lineHeight: 1.15,
      },
      h3: {
        fontSize: "1.25rem",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
      },
      subtitle1: { fontSize: "0.9375rem", fontWeight: 620, lineHeight: 1.4 },
      subtitle2: {
        fontSize: "0.9375rem",
        fontWeight: 620,
        letterSpacing: "-0.006em",
        lineHeight: 1.4,
      },
      body1: { fontSize: "0.9375rem", lineHeight: 1.55 },
      body2: { fontSize: "0.875rem", lineHeight: 1.5 },
      caption: { fontSize: "0.75rem", lineHeight: 1.45 },
      // The utility face. Every eyebrow in the app is an `overline`, so this is
      // the one declaration that gives them all a voice.
      overline: {
        fontFamily: MONO,
        fontSize: "0.65625rem",
        fontWeight: 400,
        letterSpacing: "0.08em",
        lineHeight: 1.6,
      },
      button: {
        fontSize: "0.875rem",
        fontWeight: 560,
        letterSpacing: 0,
        textTransform: "none",
      },
    },
    components: {
      // Every ripple in the app at once. The ripple is a Material signature and
      // it is the last thing left saying so after the colours change; the
      // focus-visible ring below is what replaces the affordance it carried.
      MuiButtonBase: { defaultProps: { disableRipple: true } },

      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { minHeight: 32, paddingInline: 13 },
          // Neutral, not accent. An outlined button drawn in the connector
          // colour competes with the one contained button next to it, and the
          // accent should mean "this is the button".
          outlined: {
            borderColor: ground.line,
            color: ground.ink,
            "&:hover": {
              borderColor: ground.ink3,
              backgroundColor: ground.hover,
            },
            // Nested, so it out-specifies the neutral colour above. A flat
            // sibling key would not: `color="inherit"` is what the app bar
            // uses, and these two would otherwise repaint it.
            "&.MuiButton-colorInherit": { color: "inherit" },
          },
          text: {
            color: ground.ink2,
            "&:hover": { backgroundColor: ground.hover },
            "&.MuiButton-colorInherit": { color: "inherit" },
          },
        },
      },

      MuiPaper: {
        styleOverrides: {
          // Kills MUI's dark-mode elevation overlay, which lightens `paper` by
          // a shade per level and undoes the Notion surface colour above.
          root: { backgroundImage: "none" },
          outlined: { borderColor: ground.divider },
        },
      },

      // No floating labels anywhere in the app — the label sits above the
      // control (see `ui/Field.tsx`), so the notch the outline cuts for it is
      // never wanted. `legend` is what reserves that gap.
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: surface,
            "& legend": { display: "none" },
            "& fieldset": { top: 0 },
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: ground.line,
              transition: "border-color 120ms ease, box-shadow 120ms ease",
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: ground.ink3,
            },
            // 1px, not Material's 2px: a border that thickens on focus shifts
            // the text inside it by a pixel. The ring carries the emphasis.
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderWidth: 1,
              borderColor: accent,
            },
            "&.Mui-focused": { boxShadow: `0 0 0 3px ${accentSoft}` },
          },
          input: { "&::placeholder": { color: ground.ink3, opacity: 1 } },
        },
      },

      MuiMenu: {
        styleOverrides: {
          paper: { border: `1px solid ${ground.divider}` },
        },
      },

      MuiMenuItem: {
        styleOverrides: {
          root: {
            "&.Mui-selected": { backgroundColor: accentSoft },
            "&.Mui-selected:hover": { backgroundColor: accentSoft },
          },
        },
      },

      MuiListSubheader: {
        styleOverrides: {
          root: {
            fontFamily: MONO,
            fontSize: "0.65625rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: ground.ink3,
            lineHeight: 2.4,
          },
        },
      },

      /**
       * The house note: a hairline box with a severity rail, not a pastel panel.
       *
       * MUI's standard `Alert` floods the whole box with the severity colour,
       * which on the settings page put six saturated panels around controls
       * whose entire palette is one accent — the warnings outweighed the
       * buttons. The severity moves to a 2px rail and the icon, and the text
       * goes back to reading as text. `ui/Note.tsx` supplies the icons.
       */
      MuiAlert: {
        defaultProps: { variant: "outlined" },
        styleOverrides: {
          root: {
            backgroundColor: surface,
            border: `1px solid ${ground.divider}`,
            borderLeftWidth: 2,
            color: ground.ink2,
            paddingBlock: 6,
            alignItems: "flex-start",
            "&.MuiAlert-colorSuccess": { borderLeftColor: ground.success },
            "&.MuiAlert-colorError": { borderLeftColor: ground.error },
            "&.MuiAlert-colorWarning": { borderLeftColor: ground.warning },
            "&.MuiAlert-colorInfo": { borderLeftColor: ground.info },
          },
          icon: { paddingTop: 3, marginRight: 10, opacity: 1 },
          message: { paddingBlock: 2, fontSize: "0.84375rem", lineHeight: 1.5 },
        },
      },

      MuiLinearProgress: {
        styleOverrides: {
          root: { backgroundColor: ground.divider },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: "0.75rem",
            fontWeight: 400,
            backgroundColor: dark ? "#3B3B38" : "#2F2E2A",
            paddingBlock: 5,
          },
        },
      },

      MuiCssBaseline: {
        styleOverrides: {
          html: {
            // Without this the user agent assumes a light page and paints its
            // own chrome to match: on Windows that is a full-width scrollbar
            // with a white track and stepper arrows, which in a dark suggestion
            // list is the brightest thing on screen. MUI only sets this when
            // `CssBaseline` is given `enableColorScheme`, which it is not.
            colorScheme: mode,
          },

          // Thin and quiet everywhere, because the surfaces that scroll here
          // are small: a 300px suggestion list and a sync menu, both often
          // inside a short Notion iframe. `scrollbar-*` covers Firefox and
          // current Chromium; the `::-webkit-` block covers older WebKit, and
          // drops the stepper arrows along the way. The thumb is a divider
          // tone rather than the accent — it is chrome, not content.
          "*": {
            scrollbarWidth: "thin",
            scrollbarColor: `${ground.line} transparent`,
          },
          "*::-webkit-scrollbar": { width: 10, height: 10 },
          "*::-webkit-scrollbar-track": { background: "transparent" },
          "*::-webkit-scrollbar-thumb": {
            backgroundColor: ground.line,
            borderRadius: 10,
            // Inset via a transparent border, so the thumb reads as a floating
            // pill rather than a bar wedged against the panel's edge.
            border: "3px solid transparent",
            backgroundClip: "content-box",
          },
          "*::-webkit-scrollbar-thumb:hover": {
            backgroundColor: ground.ink3,
          },
          "*::-webkit-scrollbar-corner": { background: "transparent" },
          // Without a ripple, focus is the only thing left telling a keyboard
          // user where they are, so it is defined once here rather than left to
          // whatever each browser draws.
          "*:focus-visible": {
            outline: `2px solid ${accent}`,
            outlineOffset: 2,
          },
          // …except on a text field, which already says it has focus twice
          // over: its own accent border and the ring around it. A third,
          // offset outline on the native input drew a second rectangle inside
          // the widget's merged input group — three concentric rings on one
          // control. This rule is a safety net for controls with no focus
          // style of their own, not an addition to those that have one.
          ".MuiInputBase-input:focus-visible": { outline: "none" },
          body: {
            WebkitFontSmoothing: "antialiased",
            ...(embedded
              ? undefined
              : {
                  // Lets the footer sit at the bottom via `margin-top: auto`
                  // instead of a fixed top margin, which left it floating in
                  // the middle of any page shorter than the fold. Skipped in an
                  // embed, where there is no footer and forcing a full-viewport
                  // body would just add a scrollbar inside the iframe.
                  minHeight: "100vh",
                  display: "flex",
                  flexDirection: "column",
                }),
          },
          ...(embedded
            ? undefined
            : {
                "#root": {
                  display: "flex",
                  flexDirection: "column",
                  flexGrow: 1,
                },
              }),
        },
      },
    },
  });
}
