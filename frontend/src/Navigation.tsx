import {
  AppBar,
  Avatar,
  Button,
  Container,
  Skeleton,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import type { UserData } from "backend/src/types";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DomainSwitcher } from "./DomainSwitcher";

export function Navigation() {
  const { t } = useTranslation();
  const [user, setUser] = useState<UserData<any> | undefined>(undefined);

  useEffect(() => {
    void fetch("/api/user")
      .then((r) => r.json())
      .then((data) => setUser(data.user));
  }, []);

  const logout = useCallback(() => {
    window.location.href = `${window.location.origin}/logout`;
  }, []);

  const workspace = (user as any)?.notionWorkspace;

  return (
    <Fragment>
      <AppBar position="fixed" color="default" elevation={0} variant="outlined">
        {/* Constrained to the same width as the page body: the toolbar used to
            run edge to edge while the content sat in a 600px column, leaving
            the logout button stranded far from everything it belongs to. */}
        <Container maxWidth="sm" disableGutters>
          <Toolbar variant="dense" sx={{ gap: 1 }}>
            <DomainSwitcher />

            <Stack sx={{ flexGrow: 1 }} />

            {user ? (
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", minWidth: 0 }}
              >
                <Avatar
                  src={workspace?.workspaceIcon}
                  alt=""
                  sx={{ width: 24, height: 24 }}
                />
                <Typography
                  variant="body2"
                  noWrap
                  sx={{ display: { xs: "none", sm: "block" } }}
                >
                  {workspace?.workspaceName}
                </Typography>
              </Stack>
            ) : (
              <Skeleton variant="circular" width={24} height={24} />
            )}

            <Button size="small" color="inherit" onClick={logout}>
              {t("LOGOUT")}
            </Button>
          </Toolbar>
        </Container>
      </AppBar>
      <Toolbar variant="dense" />
    </Fragment>
  );
}
