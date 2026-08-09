import CheckCircle from "@mui/icons-material/CheckCircle";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Done from "@mui/icons-material/Done";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Container,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { SEARCHABLE_DOMAINS } from "backend/src/domains";
import type { Config, UserConfig } from "backend/src/types";
import { type ReactNode, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Backup } from "./Backup";
import { ConnectorWidget } from "./ConnectorWidget";
import {
  AuthContext,
  ConfigContext,
  DomainContext,
  SnackbarContext,
} from "./Context";
import { CreateDatabase, DbConfigForm } from "./DbConfigForm";
import { Navigation } from "./Navigation";

/**
 * The settings page, as three ordered steps.
 *
 * Everything used to render unconditionally in a fixed order, which put the
 * first-run warning ("configure your database") at the top of the page and the
 * controls that resolve it below seven dropdowns at the bottom — the
 * instruction and its remedy as far apart as the layout allowed. For a
 * returning user the order was wrong the other way round: the embed URL they
 * came for sat under a warning that no longer applied. The steps are driven by
 * whether a config exists, so each state shows the one thing it is for.
 */
export function UserPage() {
  const { domain } = useContext(DomainContext);
  const auth = useContext(AuthContext);
  const { t } = useTranslation();
  const userConfig = useContext(ConfigContext);
  const { setSnackbar } = useContext(SnackbarContext);

  const [newConfig, setNewConfig] = useState<Config | undefined>(undefined);
  // False while a required column is still unmapped — saving then would store
  // a config that every sync and add would reject as unconfigured.
  const [complete, setComplete] = useState(false);
  // What is stored server-side, overlaid with anything saved since the fetch so
  // a successful save updates the steps without a refetch.
  //
  // Derived rather than mirrored into state by an effect: an effect does not
  // run until after the render that first sees `userConfig`, so on that render
  // `saved` would still be undefined and the mapping form below would mount
  // believing the connector was unconfigured — overwriting an existing user's
  // saved column mapping with a fresh guess on every single page load.
  //
  // The whole `UserConfig` is overlaid, not just `config`: creating a database
  // adds one to the workspace, so keeping the original `notionDatabases` would
  // leave the form pointed at a database missing from its own dropdown.
  const [fetched, setFetched] = useState<UserConfig<any> | undefined>(
    undefined,
  );
  const current = fetched ?? userConfig;
  const saved = current?.config as Config | undefined;
  const [loading, setLoading] = useState(false);
  const [multi, setMulti] = useState(false);
  // Bumped by Discard to remount the mapping form, which owns its own state and
  // would otherwise keep showing the edits that were just thrown away.
  const [formVersion, setFormVersion] = useState(0);

  const isBackup = domain == "backup" || domain == "BitwardenBackup";
  const canMulti = SEARCHABLE_DOMAINS.includes(domain);

  if (!userConfig) {
    return (
      <>
        <Navigation />
        <Container maxWidth="sm" sx={{ py: 3 }}>
          <Stack spacing={2}>
            <Skeleton variant="rounded" height={72} />
            <Skeleton variant="rounded" height={128} />
            <Skeleton variant="rounded" height={220} />
          </Stack>
        </Container>
      </>
    );
  }

  const configured = isBackup || Boolean(saved);
  const embedUrl = `${window.location.origin}?userId=${auth.userId}${
    multi && canMulti ? "&multi=1" : ""
  }`;

  // Only offer to save something that differs from what is stored. The button
  // used to be permanently enabled, so there was no way to tell an unsaved
  // edit from a saved one.
  const dirty =
    Boolean(newConfig) && JSON.stringify(newConfig) !== JSON.stringify(saved);
  const canSave = dirty && complete;

  async function save() {
    setLoading(true);

    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: newConfig }),
      });

      if (response.status != 200) {
        setSnackbar({
          open: true,
          message: t("SETTINGS_FAILURE"),
          color: "error",
        });

        return;
      }

      setFetched((prev) => ({ ...(prev ?? userConfig), config: newConfig }));
      setSnackbar({
        open: true,
        message: t("SETTINGS_SUCCESS"),
        color: "success",
      });
    } catch {
      setSnackbar({
        open: true,
        message: t("SETTINGS_FAILURE"),
        color: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function reloadConfig() {
    const fresh = await fetch("/api/config").then((r) => r.json());

    setFetched(fresh);
    setNewConfig(undefined);
    setFormVersion((n) => n + 1);
    setSnackbar({
      open: true,
      message: t("CREATE_DB_SUCCESS"),
      color: "success",
    });
  }

  const databases = (current?.notionDatabases ?? []) as any[];

  return (
    <>
      <Navigation />

      <Container maxWidth="sm" sx={{ py: 3, pb: dirty ? 12 : 3 }}>
        <Stack spacing={2}>
          <Step
            index={1}
            state="done"
            title={t("STEP_CONNECTED")}
            subtitle={t("STEP_CONNECTED_SUB")}
          />

          {!isBackup ? (
            <Step
              index={2}
              state={configured ? "done" : "active"}
              title={t("STEP_DATABASE")}
              subtitle={
                configured ? t("STEP_DATABASE_DONE") : t("STEP_DATABASE_SUB")
              }
            >
              {databases.length === 0 ? (
                <Stack spacing={2}>
                  <Alert severity="info" variant="outlined">
                    {t("NO_DATABASES")}
                  </Alert>
                  <CreateDatabase onCreated={reloadConfig} />
                </Stack>
              ) : (
                <Stack spacing={2}>
                  <DbConfigForm
                    key={`${(saved as { id?: string } | undefined)?.id ?? "new"}:${formVersion}`}
                    notionDatabases={databases}
                    initialConfig={saved}
                    onConfigChange={(config, isComplete) => {
                      setNewConfig(config);
                      setComplete(isComplete);
                    }}
                  />
                  <Divider>
                    <Typography variant="caption" color="text.secondary">
                      {t("OR")}
                    </Typography>
                  </Divider>
                  <CreateDatabase onCreated={reloadConfig} />
                </Stack>
              )}
            </Step>
          ) : null}

          <Step
            index={isBackup ? 2 : 3}
            state={configured ? "active" : "locked"}
            title={t("STEP_EMBED")}
            subtitle={configured ? t("STEP_EMBED_SUB") : t("STEP_EMBED_LOCKED")}
          >
            {configured ? (
              <Stack spacing={2}>
                <EmbedUrl url={embedUrl} />

                {canMulti ? (
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={multi}
                        onChange={(e) => setMulti(e.target.checked)}
                      />
                    }
                    label={
                      <Typography variant="body2">
                        {t("MULTI_WIDGET_OPTION")}
                      </Typography>
                    }
                  />
                ) : null}

                <Box>
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ display: "block", mb: 0.5 }}
                  >
                    {t("PREVIEW")}
                  </Typography>
                  <Paper variant="outlined">
                    {isBackup ? (
                      <Backup />
                    ) : (
                      <ConnectorWidget multi={multi && canMulti} compact />
                    )}
                  </Paper>
                </Box>
              </Stack>
            ) : null}
          </Step>
        </Stack>
      </Container>

      {/* Sticky, and only present when there is something to save. */}
      {dirty ? (
        <Paper
          elevation={8}
          square
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: (theme) => theme.zIndex.appBar,
          }}
        >
          <Container maxWidth="sm">
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", py: 1.5 }}
            >
              <Typography variant="body2" color="text.secondary">
                {!complete
                  ? t("SAVE_BLOCKED")
                  : saved
                    ? t("UNSAVED_CHANGES")
                    : t("SAVE_TO_FINISH")}
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="text"
                onClick={() => {
                  setNewConfig(saved);
                  setFormVersion((n) => n + 1);
                }}
                disabled={loading}
              >
                {t("DISCARD")}
              </Button>
              <Button
                variant="contained"
                onClick={save}
                loading={loading}
                disabled={!canSave}
              >
                {t("SAVE")}
              </Button>
            </Stack>
          </Container>
        </Paper>
      ) : null}
    </>
  );
}

function Step({
  index,
  state,
  title,
  subtitle,
  children,
}: {
  index: number;
  state: "done" | "active" | "locked";
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, opacity: state === "locked" ? 0.6 : 1 }}
    >
      <Stack direction="row" spacing={1.5}>
        <Box
          aria-hidden
          sx={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            fontSize: 12,
            fontWeight: 600,
            mt: 0.25,
            border: 1,
            borderColor: state === "done" ? "success.main" : "divider",
            bgcolor: state === "done" ? "success.main" : "transparent",
            color: state === "done" ? "success.contrastText" : "text.secondary",
          }}
        >
          {state === "done" ? <CheckCircle sx={{ fontSize: 16 }} /> : index}
        </Box>

        <Stack spacing={children ? 2 : 0} sx={{ flexGrow: 1, minWidth: 0 }}>
          <Box>
            <Typography variant="subtitle2">{title}</Typography>
            {subtitle ? (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          {children}
        </Stack>
      </Stack>
    </Paper>
  );
}

/** The embed URL, with the copy button it always needed. */
function EmbedUrl({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = setTimeout(() => setCopied(false), 2000);

    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the field is still selectable.
    }
  }

  return (
    <TextField
      value={url}
      size="small"
      fullWidth
      label={t("EMBED_URL")}
      helperText={t("EMBED_URL_HELP")}
      slotProps={{
        input: {
          readOnly: true,
          onClick: (i) => (i.target as HTMLInputElement).select(),
          endAdornment: (
            <Tooltip title={copied ? t("COPIED") : t("COPY")}>
              <IconButton onClick={copy} edge="end" aria-label={t("COPY")}>
                {copied ? (
                  <Done fontSize="small" color="success" />
                ) : (
                  <ContentCopy fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          ),
        },
      }}
    />
  );
}
