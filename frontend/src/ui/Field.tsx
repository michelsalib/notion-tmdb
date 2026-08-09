import { Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useId } from "react";

/**
 * A labelled control, with the label above it.
 *
 * Every input in the app used to carry MUI's floating label: the one that
 * shrinks into a notch cut in the field's own border. It is the single loudest
 * Material signal in the interface, it animates on focus, and Notion — the
 * surface this app sits inside — has no such control anywhere.
 *
 * The label is an `overline`, so it is set in the utility face along with every
 * other small label in the app. The association is wired here rather than left
 * to the caller, because the reason to move a label out of the input is that it
 * stops being the input's accessible name unless something reconnects them.
 *
 * Both handles are handed back because MUI's two controls need different ones.
 * A `TextField` wants `id`, which `htmlFor` then points at — that is what makes
 * clicking the label focus the field. A non-native `Select` renders its display
 * as a `div`, which `htmlFor` cannot legally reference and browsers will not
 * associate, so it wants `labelId` (MUI turns that into `aria-labelledby`).
 */
export function Field({
  label,
  help,
  children,
}: {
  label: string;
  /** Shown under the control. For guidance, not for errors. */
  help?: ReactNode;
  children: (handles: { id: string; labelId: string }) => ReactNode;
}) {
  const id = useId();
  const labelId = `${id}-label`;

  return (
    <Stack spacing={0.5}>
      <Typography
        component="label"
        id={labelId}
        htmlFor={id}
        variant="overline"
        sx={{ color: "text.secondary", alignSelf: "flex-start" }}
      >
        {label}
      </Typography>

      {children({ id, labelId })}

      {help ? (
        <Typography variant="caption" color="text.secondary">
          {help}
        </Typography>
      ) : null}
    </Stack>
  );
}
