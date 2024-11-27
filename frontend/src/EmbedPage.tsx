import { Button, LinearProgress, Stack } from "@mui/material";
import type { Suggestion } from "backend/src/types";
import { Fragment, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { DomainContext, SnackbarContext } from "./Context";
import { Search } from "./Search";
import { StreamButton } from "./StreamButton";

export function EmbedPage() {
  const { t } = useTranslation();
  const domain = useContext(DomainContext);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState<Suggestion | null>(null);
  const { setSnackbar } = useContext(SnackbarContext);

  async function submit() {
    if (!value) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/add?id=" + value.id, {
        method: "POST",
      });

      if (response.status != 200) {
        setSnackbar({
          open: true,
          message: t("ADD_FAILURE"),
          color: "error",
        });

        return;
      }

      setSnackbar({
        open: true,
        message: t("ADD_SUCCESS"),
        color: "success",
      });
    } catch {
      setSnackbar({
        open: true,
        message: t("ADD_FAILURE"),
        color: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Fragment>
      {loading ? (
        <LinearProgress
          sx={{ position: "absolute", top: 0, left: 0, right: 0 }}
        />
      ) : (
        ""
      )}

      <Stack direction="column" spacing={2} sx={{ padding: 2 }}>
        {domain != "GoCardless" ? (
          <Stack direction="row" spacing={2}>
            <Search onChange={(m) => setValue(m)} />
            <Button
              variant="contained"
              size="large"
              onClick={submit}
              disabled={loading || !value}
            >
              Create
            </Button>
          </Stack>
        ) : (
          ""
        )}

        <StreamButton
          onChange={(loading) => setLoading(loading)}
          disabled={loading}
        >
          Sync all
        </StreamButton>
      </Stack>
    </Fragment>
  );
}
