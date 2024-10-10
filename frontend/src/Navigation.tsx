import SyncAlt from "@mui/icons-material/SyncAlt";
import {
  AppBar,
  Avatar,
  Button,
  MenuItem,
  Select,
  Toolbar,
  Typography,
  useTheme,
} from "@mui/material";
import type { DOMAIN, UserData } from "backend/src/types";
import { useCallback, useEffect, useState } from "react";
import { Fragment } from "react/jsx-runtime";

export function Navigation({ domain }: { domain: DOMAIN }) {
  const theme = useTheme();
  const h6 = theme.typography.h6;
  const [user, setUser] = useState<UserData<any> | undefined>(undefined);

  useEffect(() => {
    fetch("/api/user")
      .then((r) => r.json())
      .then((data) => setUser(data.user));
  }, []);

  const logout = useCallback(() => {
    window.location.href = `${window.location.origin}/logout`;
  }, []);

  const switchDomain = useCallback((target: "gbook" | "tmdb" | "backup") => {
    window.location.href = window.location.origin.replace(
      /notion-\w+/,
      "notion-" + target,
    );
  }, []);

  return (
    <Fragment>
      <AppBar>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Notion
            <SyncAlt
              fontSize="small"
              color="primary"
              sx={{ marginRight: 1, marginLeft: 1 }}
            />
            <Select
              value={domain}
              variant="standard"
              sx={{ fontSize: h6.fontSize, fontWeight: h6.fontWeight }}
              onChange={(e) =>
                switchDomain(e.target.value.toLowerCase() as any)
              }
            >
              <MenuItem
                value="TMDB"
                sx={{ fontSize: "large", fontWeight: h6.fontWeight }}
              >
                TMDB
              </MenuItem>
              <MenuItem
                value="GBook"
                sx={{ fontSize: "large", fontWeight: h6.fontWeight }}
              >
                GBook
              </MenuItem>
              <MenuItem
                value="backup"
                sx={{ fontSize: "large", fontWeight: h6.fontWeight }}
              >
                backup
              </MenuItem>
            </Select>
          </Typography>
          <Typography component="div" sx={{ marginRight: 2 }}>
            {user?.notionWorkspace.workspaceName}
          </Typography>
          <Avatar
            sx={{ marginRight: 2 }}
            src={user?.notionWorkspace.workspaceIcon}
          />
          <Button onClick={logout}>Logout</Button>
        </Toolbar>
      </AppBar>
      <Toolbar />
    </Fragment>
  );
}
