import { Button, LinearProgress, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Note } from "./ui/Note";
import { useRestore } from "./useSync";

/**
 * Rebuild one stored archive into the workspace.
 *
 * Inline rather than a dialog. This widget's home is a Notion embed, which is
 * often no taller than a toast — the same reason sync progress never goes
 * through the `Snackbar` — so a modal here would cover the thing it belongs to
 * and could not be dismissed without hitting the iframe's own edges.
 *
 * It asks nothing. There was a picker for the page to rebuild inside, and in a
 * real workspace it was a scroll of forty unrelated titles: a filing decision
 * about a copy the user has not read yet, before they were allowed to press the
 * button. The restore lands at the top level of the workspace and can be dragged
 * wherever it belongs afterwards, which is one drag against forty choices.
 *
 * What it does say is what a restore does and does not do, because the writing
 * it is about to do is the largest this app ever does on someone's behalf. The
 * full list of what could not come back is on the page it creates; the line here
 * exists so nobody discovers it afterwards.
 */
export function RestorePanel({
  backupKey,
  when,
  busy,
  onClose,
}: {
  /** Which archive to restore. Omitted means the newest one. */
  backupKey?: string;
  /** When that archive was taken, as the caller already formats it. */
  when?: string;
  /** A backup run is in flight, so this must not start one of its own. */
  busy?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const restore = useRestore();

  const done = !restore.running && Boolean(restore.message) && !restore.error;
  const progress =
    restore.total && restore.current !== undefined
      ? Math.min(100, (restore.current / restore.total) * 100)
      : undefined;

  return (
    <Stack
      spacing={1.5}
      sx={{ p: 1.5, borderRadius: 1, bgcolor: "action.hover" }}
    >
      {done ? (
        <>
          <Note severity="success">{t("RESTORE_DONE")}</Note>
          <Typography variant="caption" color="text.secondary">
            {restore.message}
          </Typography>
          <Stack direction="row" spacing={1}>
            {restore.url ? (
              <Button
                variant="contained"
                href={restore.url}
                target="_blank"
                rel="noreferrer"
              >
                {t("RESTORE_OPEN")}
              </Button>
            ) : null}
            <Button variant="text" onClick={onClose}>
              {t("CLOSE")}
            </Button>
          </Stack>
        </>
      ) : (
        <>
          <Note severity="info">{t("RESTORE_INTRO")}</Note>
          <Typography variant="caption" color="text.secondary">
            {t("RESTORE_CAVEAT")}
          </Typography>

          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Button
              variant="contained"
              onClick={() => void restore.restore(backupKey)}
              loading={restore.running}
              disabled={busy}
            >
              {t("RESTORE_ACTION")}
            </Button>
            {!restore.running ? (
              <Button variant="text" onClick={onClose}>
                {t("CANCEL")}
              </Button>
            ) : null}
            {when && !restore.running && !restore.message ? (
              <Typography variant="caption" color="text.secondary" noWrap>
                {t("RESTORE_SOURCE", { when })}
              </Typography>
            ) : null}
          </Stack>

          {/* Same inline status row as the rest of the widget: a restore of a
              large workspace runs for minutes, and a single overwritten toast
              cannot say whether it is still going. */}
          {restore.running || restore.message ? (
            <Stack spacing={0.5}>
              <Typography
                variant="caption"
                color={restore.error ? "error" : "text.secondary"}
                noWrap
              >
                {restore.message || t("RESTORING")}
              </Typography>
              {restore.running ? (
                <LinearProgress
                  variant={
                    progress === undefined ? "indeterminate" : "determinate"
                  }
                  value={progress}
                  sx={{ height: 3, borderRadius: 2 }}
                />
              ) : null}
              {restore.error && restore.url ? (
                // It got as far as creating the page, so the notes explaining
                // how far it got are on it.
                <Button
                  variant="text"
                  size="small"
                  href={restore.url}
                  target="_blank"
                  rel="noreferrer"
                  sx={{ alignSelf: "flex-start" }}
                >
                  {t("RESTORE_OPEN")}
                </Button>
              ) : null}
            </Stack>
          ) : null}
        </>
      )}
    </Stack>
  );
}
