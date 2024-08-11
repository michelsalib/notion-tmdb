import SyncAlt from "@mui/icons-material/SyncAlt";
import { AppBar, Avatar, Button, Toolbar, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Fragment } from "react/jsx-runtime";

export function Navigation() {
    const [user, setUser] = useState<any>(undefined);

    useEffect(() => {
        fetch('/api/user')
            .then(r => r.json())
            .then(data => setUser(data.user));
    }, []);

    const logout = useCallback(() => {
        window.location.href = `${window.location.origin}/logout`;
    }, []);

    return (
        <Fragment>
            <AppBar>
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Notion <SyncAlt fontSize="small" color="primary" /> TMDB
                    </Typography>
                    <Avatar sx={{marginRight: 2}} src={user?.notionWorkspace?.workspaceIcon} />
                    <Button onClick={logout}>Logout</Button>
                </Toolbar>
            </AppBar>
            <Toolbar />
        </Fragment>
    );
}