import { AppBar, Avatar, Button, Toolbar, Typography } from "@mui/material";
import type { UserData } from "backend/src/types";
import { useCallback, useEffect, useState } from "react";
import { Fragment } from "react/jsx-runtime";
import { DomainSwitcher } from "./DomainSwitcher";

export function Navigation() {
  const [user, setUser] = useState<UserData<any> | undefined>(undefined);

  useEffect(() => {
    void fetch("/api/user")
      .then((r) => r.json())
      .then((data) => setUser(data.user));
  }, []);

  const logout = useCallback(() => {
    window.location.href = `${window.location.origin}/logout`;
  }, []);

  return (
    <Fragment>
      <AppBar>
        <Toolbar>
          <DomainSwitcher variant="h6" />
          <Typography component="div" sx={{ marginRight: 2 }}>
            {(user as any)?.notionWorkspace?.workspaceName}
          </Typography>
          <Avatar
            sx={{ marginRight: 2 }}
            src={(user as any)?.notionWorkspace?.workspaceIcon}
          />
          <Button onClick={logout}>Logout</Button>
        </Toolbar>
      </AppBar>
      <Toolbar />
    </Fragment>
  );
}
