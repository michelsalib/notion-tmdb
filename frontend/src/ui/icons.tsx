import { Box, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

/**
 * The app's icons, drawn rather than imported.
 *
 * These replace `@mui/icons-material`, which was pulled in for six glyphs and
 * brought Material's filled 24px grid with it — the one visual signature left
 * saying "Material" after the palette and the shapes changed. They are stroke
 * icons on the same 24px grid at a constant 1.75 weight, so they sit next to
 * 14px text without out-weighing it, and they inherit `currentColor`, so a
 * caller tints them with `sx={{ color: … }}` like any other text.
 *
 * The two connector marks in `frontend/static/` are drawn on this same grid;
 * they are entries in this set rather than logos (see `backup.svg`).
 */
interface IconProps {
  /** Both dimensions, in px. Default 16 — one notch above 14px body text. */
  size?: number;
  sx?: SxProps<Theme>;
  /** Supply only when the icon is the sole carrier of meaning. */
  title?: string;
}

function Glyph({
  size = 16,
  sx,
  title,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <Box
      component="svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      sx={{ display: "block", flexShrink: 0, ...sx }}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </Box>
  );
}

export function Check(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Glyph>
  );
}

export function CheckCircle(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.2 11 14.7l4.6-4.6" />
    </Glyph>
  );
}

export function Info(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.8v.01" />
    </Glyph>
  );
}

export function Warning(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.2M12 16.3v.01" />
    </Glyph>
  );
}

export function ErrorCircle(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
    </Glyph>
  );
}

export function Copy(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="9" y="9" width="11.5" height="11.5" rx="2" />
      <path d="M15 5.8A2 2 0 0 0 13.2 4H5.8A1.8 1.8 0 0 0 4 5.8v7.4A2 2 0 0 0 5.8 15" />
    </Glyph>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="m6 9.5 6 6 6-6" />
    </Glyph>
  );
}

export function Lock(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M8.2 10.5V7.6a3.8 3.8 0 0 1 7.6 0v2.9" />
    </Glyph>
  );
}

export function Shield(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 2.7 4.4 5v6.4c0 4 3 7 7.6 8.8 4.6-1.8 7.6-4.8 7.6-8.8V5z" />
    </Glyph>
  );
}

/** The auto-match banner. A mark of something done for you, not a star rating. */
export function Sparkle(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9z" />
      <path d="M18.6 3v3M20.1 4.5h-3" />
    </Glyph>
  );
}

/** The product's own mark: two arrows, one each way. */
export function Swap(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 8.6h13.5m0 0-3.4-3.4M17.5 8.6l-3.4 3.4" />
      <path d="M20 15.4H6.5m0 0 3.4-3.4M6.5 15.4l3.4 3.4" />
    </Glyph>
  );
}
