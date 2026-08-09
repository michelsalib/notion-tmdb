import { Alert, type AlertProps } from "@mui/material";
import type { ReactNode } from "react";
import { CheckCircle, ErrorCircle, Info, Warning } from "./icons";

const ICONS: Record<NonNullable<AlertProps["severity"]>, ReactNode> = {
  success: <CheckCircle size={15} />,
  info: <Info size={15} />,
  warning: <Warning size={15} />,
  error: <ErrorCircle size={15} />,
};

/**
 * A short notice, in the app's own voice.
 *
 * Thin on purpose: the look is a `MuiAlert` override in `theme.ts` — a hairline
 * box with a 2px severity rail instead of a flooded pastel panel — so the
 * `Snackbar`, which has to stay an `Alert` for its `role="alert"`, gets the
 * same treatment for free. What this adds is the icon set: MUI's default
 * mapping is Material's filled 24px glyphs, which are the loudest thing left in
 * the box once the fill is gone.
 */
export function Note({
  severity = "info",
  ...rest
}: Omit<AlertProps, "variant">) {
  return <Alert severity={severity} icon={ICONS[severity]} {...rest} />;
}
