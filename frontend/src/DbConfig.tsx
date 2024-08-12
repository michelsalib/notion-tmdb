import { Box, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from "@mui/material";
import { Fragment, JSXElementConstructor, ReactElement, ReactNode, ReactPortal, useEffect, useState } from "react";
import { ColumnsConfig } from "./ColumnsConfig";

export function DbConfig() {
    const [dbConfig, setDbConfig] = useState<any>(undefined);
    const [selectedDb, setSelectedDb] = useState<any>(undefined);

    useEffect(() => {
        fetch('/api/config')
            .then(r => r.json())
            .then(data => {
                setDbConfig(data.data);
                setSelectedDb(data.data[0]);
            });
    }, []);

    if (!dbConfig) {
        return;
    }

    return (
        <Stack spacing={2}>
            <Typography variant="h6">Pick your database</Typography>
            <FormControl>
                <InputLabel>Database</InputLabel>
                <Select label="database" value={selectedDb.id} onChange={(event) => setSelectedDb(dbConfig.find((d: any) => d.id == event.target.value))}>
                    {dbConfig?.map((db: any) =>
                        <MenuItem value={db.id} key={db.id}>
                            <Stack direction={"row"} spacing={2}>
                                <Typography>{db.icon.emoji}</Typography>
                                <Typography>{db.title[0].plain_text}</Typography>
                            </Stack>
                        </MenuItem>
                    )}
                </Select>
            </FormControl>
            <ColumnsConfig db={selectedDb}></ColumnsConfig>
        </Stack>
    );
}