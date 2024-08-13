import { Alert, FormControl, FormHelperText, InputLabel, MenuItem, Select, Stack, Typography } from "@mui/material";
import { UserConfig } from "backend/src/types";
import { Fragment, useEffect, useState } from "react";

function typeToEmoji(type: string): string {
    if (type == 'status') {
        return '🟢';
    }
    if (type == 'url') {
        return '🔗';
    }
    if (type == 'title') {
        return '🗒️';
    }
    if (type == 'multi_select') {
        return '✔️';
    }
    if (type == 'number') {
        return '🔢';
    }

    return '📝';
}

export function DbConfig({ notionDatabases, initialConfig, onConfigChange }: { notionDatabases: UserConfig['notionDatabases'], initialConfig?: UserConfig['dbConfig'], onConfigChange: (dbConfig: UserConfig['dbConfig']) => any }) {
    const [config, setConfig] = useState({
        id: notionDatabases[0].id,
        url: '',
        status: '',
        title: '',
        director: '',
        year: '',
        genre: '',
        rating: '',
        ...initialConfig,
    });

    useEffect(() => onConfigChange(config), [config]);

    const database = notionDatabases.find(db => db.id == config.id) as UserConfig['notionDatabases'][0];
    const columns = Object.values(database.properties);
    const urlColumns: any[] = columns.filter((p: any) => p.type == 'url');
    const statusColumns: any[] = columns.filter((p: any) => p.type == 'status');

    return (
        <Stack spacing={2}>
            <Typography variant="h6">Pick your database</Typography>
            <FormControl>
                <InputLabel>Database</InputLabel>
                <Select label="database" value={config.id} onChange={(event) => setConfig(c => ({ ...c, id: event.target.value }))}>
                    {notionDatabases.map(db =>
                        <MenuItem value={db.id} key={db.id}>
                            <Stack direction={"row"} spacing={2}>
                                <Typography>{(db.icon as any).emoji}</Typography>
                                <Typography>{db.title[0].plain_text}</Typography>
                            </Stack>
                        </MenuItem>
                    )}
                </Select>
            </FormControl>

            {!urlColumns.length || !statusColumns.length ?
                <Alert severity="warning">
                    Database <strong>{database.title[0].plain_text}</strong> is missing mandatory url and status columns
                </Alert>
                :
                <Fragment>
                    <Typography variant="h6">Map your columns</Typography>

                    <FormControl required>
                        <InputLabel>TMDB URL</InputLabel>
                        <Select label="TMDB URL" value={config.url} onChange={event => setConfig({ ...config, url: (event.target.value) })}>
                            {columns.map((property: any) =>
                                <MenuItem value={property.id} key={property.id} disabled={property.type != 'url'}>
                                    {typeToEmoji(property.type)} {property.name}
                                </MenuItem>
                            )}
                        </Select>
                        <FormHelperText>This mandatory field helps associate your entry with a TMDB movie</FormHelperText>
                    </FormControl>

                    <FormControl required>
                        <InputLabel>TMDB Status</InputLabel>
                        <Select label="TMDB Status" value={config.status} onChange={event => setConfig({ ...config, status: (event.target.value) })}>
                            {columns.map((property: any) =>
                                <MenuItem value={property.id} key={property.id} disabled={property.type != 'status'}>
                                    {typeToEmoji(property.type)} {property.name}
                                </MenuItem>
                            )}
                        </Select>
                        <FormHelperText>This mandatory field helps the plugin to identify your entires that need to be synched</FormHelperText>
                    </FormControl>

                    <FormControl>
                        <InputLabel>Title</InputLabel>
                        <Select label="Title" value={config.title} onChange={event => setConfig({ ...config, title: (event.target.value) })}>
                            <MenuItem value=""><em>None</em></MenuItem>
                            {columns.map((property: any) =>
                                <MenuItem value={property.id} key={property.id} disabled={property.type != 'title'}>
                                    {typeToEmoji(property.type)} {property.name}
                                </MenuItem>
                            )}
                        </Select>
                    </FormControl>

                    <FormControl>
                        <InputLabel>Director</InputLabel>
                        <Select label="Director" value={config.director} onChange={event => setConfig({ ...config, director: (event.target.value) })}>
                            <MenuItem value=""><em>None</em></MenuItem>
                            {columns.map((property: any) =>
                                <MenuItem value={property.id} key={property.id} disabled={property.type != 'rich_text'}>
                                    {typeToEmoji(property.type)} {property.name}
                                </MenuItem>
                            )}
                        </Select>
                    </FormControl>

                    <FormControl>
                        <InputLabel>Year</InputLabel>
                        <Select label="Year" value={config.year} onChange={event => setConfig({ ...config, year: (event.target.value) })}>
                            <MenuItem value=""><em>None</em></MenuItem>
                            {columns.map((property: any) =>
                                <MenuItem value={property.id} key={property.id} disabled={property.type != 'number'}>
                                    {typeToEmoji(property.type)} {property.name}
                                </MenuItem>
                            )}
                        </Select>
                    </FormControl>

                    <FormControl>
                        <InputLabel>Genre</InputLabel>
                        <Select label="Genre" value={config.genre} onChange={event => setConfig({ ...config, genre: (event.target.value) })}>
                            <MenuItem value=""><em>None</em></MenuItem>
                            {columns.map((property: any) =>
                                <MenuItem value={property.id} key={property.id} disabled={property.type != 'multi_select'}>
                                    {typeToEmoji(property.type)} {property.name}
                                </MenuItem>
                            )}
                        </Select>
                    </FormControl>

                    <FormControl>
                        <InputLabel>Rating</InputLabel>
                        <Select label="Rating" value={config.rating} onChange={event => setConfig({ ...config, rating: (event.target.value) })}>
                            <MenuItem value=""><em>None</em></MenuItem>
                            {columns.map((property: any) =>
                                <MenuItem value={property.id} key={property.id} disabled={property.type != 'number'}>
                                    {typeToEmoji(property.type)} {property.name}
                                </MenuItem>
                            )}
                        </Select>
                    </FormControl>
                </Fragment>
            }
        </Stack>
    );
}