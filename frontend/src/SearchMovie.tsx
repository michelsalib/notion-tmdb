import { Autocomplete, Box, debounce, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Movie } from "./types";

export function SearchMovie({ onMovieChange }: { onMovieChange: (movie: Movie | null) => void}) {
    const [value, setValue] = useState<Movie | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [options, setOptions] = useState<Movie[]>([]);

    const fetchMovieSearch = useMemo(
        () =>
            debounce((inputValue, done: (result: { results: Movie[]}) => void) => {
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

        fetchMovieSearch(inputValue, ({ results }) => {
            if (active) {
                setOptions(results);
            }
        });

        return () => {
            active = false;
        };
    }, [inputValue, fetchMovieSearch]);

    return (
        <Autocomplete<Movie>
            sx={{ width: '100%' }}
            getOptionLabel={(option) => option.title}
            getOptionKey={(x) => x.id}
            options={options}
            value={value}
            isOptionEqualToValue={(o, v) => o.id == v.id}
            noOptionsText="No movie"
            onChange={(event, newValue) => {
                setValue(newValue);
                onMovieChange(newValue);
            }}
            onInputChange={(event, newInputValue) => {
                setInputValue(newInputValue);
            }}
            renderInput={(params) => (
                <TextField {...params} label="TMDB lookup" fullWidth />
            )}
            renderOption={(props, option) => {
                return (
                    <li {...props}>
                        <Stack direction="row" spacing={1}>
                            <Box
                                component="img"
                                sx={{
                                    width: 40,
                                    height: 60,
                                    objectFit: 'cover',
                                }}
                                src={"https://image.tmdb.org/t/p/w500" + option.poster_path}
                            />
                            <Stack direction="column">
                                <Typography variant="subtitle2">{option.title}</Typography>
                                <Typography variant="caption">
                                    {option.release_date.split('-')[0]}
                                    {option.original_title != option.title ? ' - ' + option.original_title : ''}
                                </Typography>
                            </Stack>
                        </Stack>
                    </li>
                );
            }}
        />
    );
}