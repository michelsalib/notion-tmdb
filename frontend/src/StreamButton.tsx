import { Button, LinearProgress } from "@mui/material";
import { ReactNode, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Fragment } from "react/jsx-runtime";
import { SnackbarContext } from "./Context";
import { streaming } from "./stream";

export function StreamButton({
  disabled,
  onChange,
  children,
}: {
  disabled?: boolean;
  onChange?: (loading: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const { setSnackbar } = useContext(SnackbarContext);

  async function sync() {
    setLoading(true);
    onChange?.(true);

    try {
      let error = false;
      for await (const chunk of streaming("/api/sync")) {
        error = chunk.type == "error";

        setSnackbar({
          message: chunk.data,
          open: true,
          color: chunk.type == "error" ? "error" : "info",
        });
      }

      if (!error) {
        setSnackbar({
          open: true,
          message: t("SYNC_SUCESS"),
          color: "success",
        });
      }
    } catch {
      setSnackbar({
        open: true,
        message: t("SYNC_FAILURE"),
        color: "error",
      });
    } finally {
      setLoading(false);
      onChange?.(false);
    }
  }

  return (
    <Fragment>
      <Button
        size="large"
        color="success"
        variant="contained"
        disabled={disabled || loading}
        onClick={sync}
        sx={{
          display: "block",
        }}
      >
        {children}
        {loading ? (
          <LinearProgress
            color="success"
            sx={{
              marginBottom: "-4px", // has it is hardcoded within the component
            }}
          ></LinearProgress>
        ) : (
          ""
        )}
      </Button>
    </Fragment>
  );
}
