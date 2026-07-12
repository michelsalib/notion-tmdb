import {
  Autocomplete,
  Box,
  debounce,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Suggestion } from "backend/src/types";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export function Search({
  onChange,
}: {
  onChange: (result: Suggestion | null) => void;
}) {
  const [value, setValue] = useState<Suggestion | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<Suggestion[]>([]);
  const { t } = useTranslation();

  const fetchSearch = useMemo(
    () =>
      debounce(
        (inputValue, done: (result: { results: Suggestion[] }) => void) => {
          void fetch("/api/search?query=" + encodeURIComponent(inputValue))
            .then((res) => res.json())
            .then(done);
        },
        400,
      ),
    [],
  );

  useEffect(() => {
    let active = true;

    if (inputValue === "") {
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
      sx={{ width: "100%" }}
      size="small"
      autoHighlight
      getOptionLabel={(option) => option.title}
      getOptionKey={(x) => x.id}
      options={options}
      value={value}
      isOptionEqualToValue={(o, v) => o.id == v.id}
      noOptionsText="No result"
      filterOptions={(x) => x}
      onChange={(event, newValue) => {
        setValue(newValue);
        onChange(newValue);
      }}
      onInputChange={(event, newInputValue) => {
        setInputValue(newInputValue);
      }}
      // Keep the dropdown compact: a Notion embed is a fixed-height iframe that
      // can't grow to fit content, so tall rows force an oversized embed. Cap
      // the list and keep each row small so several fit in a short embed.
      slotProps={{ listbox: { sx: { maxHeight: 300 } } }}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label={t("SEARCH_PLACEHOLDER")}
          fullWidth
        />
      )}
      renderOption={(props, option) => {
        const { key, ...optionProps } = props;

        return (
          <Box
            component="li"
            key={key}
            {...optionProps}
            sx={{ gap: 1, py: 0.5, alignItems: "center" }}
          >
            {option.posterPath ? (
              <Box
                component="img"
                loading="lazy"
                src={option.posterPath}
                sx={{
                  width: 28,
                  height: 42,
                  objectFit: "cover",
                  borderRadius: 0.5,
                  flexShrink: 0,
                }}
              />
            ) : (
              <Box
                sx={{
                  width: 28,
                  height: 42,
                  borderRadius: 0.5,
                  flexShrink: 0,
                  bgcolor: "action.hover",
                }}
              />
            )}
            <Stack direction="column" sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {option.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {[option.releaseDate.split("-")[0], option.subtitle]
                  .filter(Boolean)
                  .join(" · ")}
              </Typography>
            </Stack>
          </Box>
        );
      }}
    />
  );
}
