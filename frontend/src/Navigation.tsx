import SyncAlt from "@mui/icons-material/SyncAlt";
import { AppBar, Avatar, Button, Toolbar, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Fragment } from "react/jsx-runtime";
import type { UserData } from 'backend/src/types';

export function Navigation() {
    const [user, setUser] = useState<UserData | undefined>(undefined);

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
                    <Typography component="div" sx={{marginRight: 2}}>
                        {user?.notionWorkspace.workspaceName}
                    </Typography>
                    <Avatar sx={{marginRight: 2}} src={user?.notionWorkspace.workspaceIcon} />
                    <Button onClick={logout}>Logout</Button>
                </Toolbar>
            </AppBar>
            <Toolbar />
        </Fragment>
    );
}