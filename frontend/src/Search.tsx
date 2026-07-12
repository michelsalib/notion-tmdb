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
  domain,
  placeholder,
  borderless,
}: {
  onChange: (result: Suggestion | null) => void;
  // When set, target this connector per-request instead of the host's default
  // (the multi-connector embed widget). Honored by computeDomain in fx/di.ts.
  domain?: string;
  placeholder?: string;
  // Drop the field's own outline + floating label so it can sit inside a shared
  // input group (the multi-connector widget merges dropdown + search + button).
  borderless?: boolean;
}) {
  const [value, setValue] = useState<Suggestion | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<Suggestion[]>([]);
  const { t } = useTranslation();

  const fetchSearch = useMemo(
    () =>
      debounce(
        (inputValue, done: (result: { results: Suggestion[] }) => void) => {
          const params = new URLSearchParams({ query: inputValue });
          if (domain) {
            params.set("domain", domain);
          }
          void fetch("/api/search?" + params.toString())
            .then((res) => res.json())
            .then(done);
        },
        400,
      ),
    [domain],
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
          fullWidth
          label={
            borderless ? undefined : (placeholder ?? t("SEARCH_PLACEHOLDER"))
          }
          placeholder={
            borderless ? (placeholder ?? t("SEARCH_PLACEHOLDER")) : undefined
          }
          sx={
            borderless
              ? { "& .MuiOutlinedInput-notchedOutline": { border: 0 } }
              : undefined
          }
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
