import { Autocomplete, Box, debounce, Stack, TextField, Typography } from "@mui/material";
import type { Suggestion } from "backend/src/types";
import { useEffect, useMemo, useState } from "react";

export function Search({ onChange }: { onChange: (result: Suggestion | null) => void }) {
    const [value, setValue] = useState<Suggestion | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [options, setOptions] = useState<Suggestion[]>([]);

    const fetchSearch = useMemo(
        () =>
            debounce((inputValue, done: (result: { results: Suggestion[] }) => void) => {
                fetch('/api/search?query=' + encodeURIComponent(inputValue))
                    .then(res => res.json())
                    .then(done)
            }, 400),
        [],
    );

    useEffect(() => {
        let active = true;

        if (inputValue === '') {
            setOptions([]);

            return undefined;
        }

        fetchSearch(inputValue, ({ results }) => {
            if (active) {
                setOptions(results);
            }
        });

        return () => {
            active = false;
        };
    }, [inputValue]);

    return (
        <Autocomplete<Suggestion>
            sx={{ width: '100%' }}
            getOptionLabel={(option) => option.title}
            getOptionKey={(x) => x.id}
            options={options}
            value={value}
            isOptionEqualToValue={(o, v) => o.id == v.id}
            noOptionsText="No result"
            filterOptions={x => x}
            onChange={(event, newValue) => {
                setValue(newValue);
                onChange(newValue);
            }}
            onInputChange={(event, newInputValue) => {
                setInputValue(newInputValue);
            }}
            renderInput={(params) => (
                <TextField {...params} label="TMDB lookup" fullWidth />
            )}
            renderOption={(props, option) => {
                const { key, ...optionProps } = props;

                return (
                    <li key={key} {...optionProps}>
                        <Stack direction="row" spacing={1}>
                            <Box
                                component="img"
                                sx={{
                                    width: 40,
                                    height: 60,
                                    objectFit: 'cover',
                                }}
                                src={option.posterPath}
                            />
                            <Stack direction="column">
                                <Typography variant="subtitle2">{option.title}</Typography>
                                <Typography variant="caption">
                                    {option.releaseDate.split('-')[0]}
                                    {option.subtitle ? ' - ' + option.subtitle : ''}
                                </Typography>
                            </Stack>
                        </Stack>
                    </li>
                );
            }}
        />
    );
}