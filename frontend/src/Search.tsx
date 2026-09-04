import {
  Autocomplete,
  Box,
  debounce,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Suggestion } from "backend/src/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "./ui/icons";

/**
 * The year, or nothing.
 *
 * Providers disagree about how to say "no date": TMDB sends `""`, GBook and
 * IGDB both send the literal string `"NA"`, and IGDB otherwise sends a `Date`
 * that arrives here as an ISO string. `"NA"` used to be printed at the user, so
 * every book with no publication date read "NA · Ursula K. Le Guin".
 */
function year(releaseDate: string): string {
  const parsed = String(releaseDate ?? "").slice(0, 4);

  return /^\d{4}$/.test(parsed) ? parsed : "";
}

/**
 * The poster, or the space where one would be.
 *
 * `posterPath` cannot be trusted to be either empty or loadable: a poster can
 * 404 long after the provider indexed it, and TMDB in particular used to build
 * `…/w500${poster_path}` unconditionally, so a film with no poster produced the
 * string `…/w500null` — truthy, so the empty-state branch never ran, and the
 * row rendered the browser's broken-image glyph. The provider is fixed, but the
 * fallback belongs here too: this is the only place that finds out.
 */
export function Poster({
  src,
  alt,
  width = 28,
  height = 42,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}) {
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [src]);

  const frame = {
    width,
    height,
    borderRadius: 0.5,
    flexShrink: 0,
  } as const;

  if (!src || broken) {
    return <Box sx={{ ...frame, bgcolor: "action.hover" }} />;
  }

  return (
    <Box
      component="img"
      loading="lazy"
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      sx={{
        ...frame,
        objectFit: "cover",
        // A hairline inset, so a pale poster keeps its edge against the ground
        // instead of bleeding into it.
        boxShadow: (theme) => `inset 0 0 0 1px ${theme.palette.divider}`,
      }}
    />
  );
}

/** The matched run of the query, marked in the accent. */
function Marked({ text, query }: { text: string; query: string }) {
  const at = query
    ? text.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase())
    : -1;

  if (at < 0 || !query.trim()) {
    return <>{text}</>;
  }

  const end = at + query.trim().length;

  return (
    <>
      {text.slice(0, at)}
      <Box component="span" sx={{ color: "primary.main", fontWeight: 640 }}>
        {text.slice(at, end)}
      </Box>
      {text.slice(end)}
    </>
  );
}

export function Search({
  onChange,
  domain,
  placeholder,
  borderless,
  seed,
  checkExisting,
}: {
  onChange: (result: Suggestion | null) => void;
  // When set, target this connector per-request instead of the host's default
  // (the multi-connector embed widget). Honored by computeDomain in fx/di.ts.
  domain?: string;
  placeholder?: string;
  // Drop the field's own outline so it can sit inside a shared input group
  // (the multi-connector widget merges dropdown + search + button).
  borderless?: boolean;
  /** Fills the field from outside — the landing page's example chips. */
  seed?: string;
  /**
   * Mark results the workspace already has rows for. Needs a session, so the
   * landing page leaves it off.
   */
  checkExisting?: boolean;
}) {
  const [value, setValue] = useState<Suggestion | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<Suggestion[]>([]);
  // Distinct from "no options": before the first response there is nothing to
  // report, and the panel used to sit blank through the 400ms debounce plus a
  // round trip and then say "No results" — which was a lie while in flight.
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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
    if (seed) {
      setInputValue(seed);
    }
  }, [seed]);

  // Switching connector in the multi widget invalidates the selection and the
  // list — those ids belong to the provider that just went away — but not the
  // query, which the widget deliberately keeps across a switch. Guarded on a
  // real change so the mount pass does not report a selection nobody made.
  const lastDomain = useRef(domain);
  useEffect(() => {
    if (lastDomain.current === domain) {
      return;
    }

    lastDomain.current = domain;
    setValue(null);
    setOptions([]);
    onChange(null);

    if (!inputValue.trim()) {
      return;
    }

    // Reopen on the new connector's answer, rather than leaving the same text
    // sitting over a list that was just emptied. Focus moves with it and is
    // not optional: the panel closes on the input's blur, so opening it while
    // focus is still on the connector picker leaves something a click outside
    // cannot dismiss. Safe to do here — MUI's FocusTrap hands focus back to
    // the picker from an effect *cleanup*, and React flushes every cleanup
    // before any effect body.
    inputRef.current?.focus();
    setOpen(true);
  }, [domain, inputValue, onChange]);

  useEffect(() => {
    let active = true;

    if (inputValue === "") {
      setOptions([]);
      setLoading(false);

      return undefined;
    }

    setLoading(true);

    fetchSearch(inputValue, ({ results }) => {
      if (!active) {
        return;
      }

      setOptions(results);
      setLoading(false);

      if (!checkExisting || results.length === 0) {
        return;
      }

      // Fired after the results are on screen and merged in when it answers,
      // so the Notion round trip never delays the list and a failure just
      // leaves the badges off.
      const params = new URLSearchParams({
        ids: results.map((result) => result.id).join(","),
      });

      if (domain) {
        params.set("domain", domain);
      }

      void fetch(`/api/existing?${params.toString()}`)
        .then((response) => (response.ok ? response.json() : { existing: {} }))
        .then(({ existing }: { existing: Record<string, { url: string }> }) => {
          if (!active || !existing) {
            return;
          }

          setOptions((current) =>
            current.map((option) =>
              existing[option.id]
                ? { ...option, existing: existing[option.id] }
                : option,
            ),
          );
        })
        .catch(() => {});
    });

    return () => {
      active = false;
    };
    // `fetchSearch` is memoized on `domain`, so it is what re-runs the same
    // query against a newly picked connector.
  }, [inputValue, fetchSearch]);

  return (
    <Autocomplete<Suggestion>
      sx={{ width: "100%" }}
      size="small"
      autoHighlight
      // No caret: this is a search field, not a closed list to open. Inside
      // the merged input group it read as a second, non-functional control.
      forcePopupIcon={false}
      // Defaults to `!freeSolo`, so true — and that is what emptied the field
      // on a connector switch. It clears the input on *blur* whenever nothing
      // is selected, and reaching the connector picker means blurring the
      // field, so a query typed and not yet picked from was gone before
      // pickDomain even ran. It clears it a second way too: MUI resets the
      // input whenever the controlled `value` goes null, which is exactly what
      // the switch below does to drop the stale selection. Both paths early-
      // return once this is off. Selecting an option still fills the field,
      // and the clear button still clears it — neither goes through here.
      clearOnBlur={false}
      getOptionLabel={(option) => option.title}
      getOptionKey={(x) => x.id}
      options={options}
      value={value}
      // Controlled so `seed` can fill it from the landing page's chips.
      inputValue={inputValue}
      loading={loading}
      // An empty query has nothing to report, and MUI opens on focus: clicking
      // into an empty field popped a panel reading `No results for ""`.
      open={open && inputValue.trim().length > 0}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      isOptionEqualToValue={(o, v) => o.id == v.id}
      noOptionsText={
        <Stack spacing={0.25}>
          <Typography variant="body2">
            {t("NO_RESULTS_FOR", { query: inputValue })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("NO_RESULTS_HINT")}
          </Typography>
        </Stack>
      }
      loadingText={
        <Stack spacing={1} sx={{ py: 0.5 }} aria-label={t("SEARCHING")}>
          {[0, 1].map((row) => (
            <Stack
              key={row}
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
                opacity: row === 0 ? 1 : 0.55,
                // Held still for anyone who has asked for that; the rows still
                // communicate shape and count without the pulse.
                animation: "searchPulse 1.4s ease-in-out infinite",
                "@media (prefers-reduced-motion: reduce)": {
                  animation: "none",
                },
                "@keyframes searchPulse": {
                  "0%, 100%": { opacity: row === 0 ? 1 : 0.55 },
                  "50%": { opacity: 0.35 },
                },
              }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 42,
                  borderRadius: 0.5,
                  bgcolor: "action.hover",
                  flexShrink: 0,
                }}
              />
              <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    height: 9,
                    width: `${62 - row * 14}%`,
                    borderRadius: 0.5,
                    bgcolor: "action.hover",
                  }}
                />
                <Box
                  sx={{
                    height: 7,
                    width: `${38 - row * 8}%`,
                    borderRadius: 0.5,
                    bgcolor: "action.hover",
                  }}
                />
              </Stack>
            </Stack>
          ))}
        </Stack>
      }
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
      // the list and keep each row small so several fit in a short embed. The
      // viewport clause stops the list from being clipped by the iframe's
      // bottom edge on a short embed: the widget sits ~52px from the top (Stack
      // padding + input), so leave ~80px of headroom and let the list scroll
      // within whatever height remains; 300px stays the cap on taller embeds.
      slotProps={{
        listbox: { sx: { maxHeight: "min(300px, calc(100vh - 80px))" } },
        // Position the popup relative to the viewport, not the document. The
        // popup is portalled to <body> and, with Popper's default absolute
        // strategy, its height extends the short embed iframe's scroll area —
        // adding a second (page) scrollbar next to the listbox's own. Fixed
        // positioning keeps it out of the document flow, so only the listbox
        // scrolls.
        popper: { popperOptions: { strategy: "fixed" } },
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={inputRef}
          size="small"
          fullWidth
          placeholder={placeholder ?? t("SEARCH_PLACEHOLDER")}
          sx={
            borderless
              ? {
                  // Both the resting and the focused outline have to be named
                  // explicitly. The theme's focused rule is
                  // `.MuiOutlinedInput-root.Mui-focused .notchedOutline`, which
                  // out-specifies a bare `& .notchedOutline` — so stripping
                  // only the resting border left the field drawing its own
                  // accent outline inside the group the moment it was focused.
                  "& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline": {
                    border: 0,
                  },
                  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline":
                    { border: 0 },
                  "& .MuiOutlinedInput-root.Mui-focused": { boxShadow: "none" },
                }
              : undefined
          }
        />
      )}
      renderOption={(props, option) => {
        const { key, ...optionProps } = props;
        const released = year(option.releaseDate);

        return (
          <Box
            component="li"
            key={key}
            {...optionProps}
            sx={{
              gap: 1,
              py: 0.5,
              alignItems: "center",
              // The highlighted row is what Enter will pick, so it carries the
              // accent as a rail rather than only a grey wash.
              "&.Mui-focused": {
                bgcolor: "action.selected",
                boxShadow: (theme) =>
                  `inset 2px 0 0 ${theme.palette.primary.main}`,
              },
              "&.Mui-focused .searchEnterHint": { opacity: 1 },
            }}
          >
            <Poster src={option.posterPath} alt="" />

            <Stack direction="column" sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="body2" noWrap>
                <Marked text={option.title} query={inputValue} />
              </Typography>
              {option.subtitle ? (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {option.subtitle}
                </Typography>
              ) : null}
            </Stack>

            {/* The one thing this list could say that stops a mistake rather
                than describing a result: you already have this one. */}
            {option.existing ? (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  alignItems: "center",
                  flexShrink: 0,
                  px: 0.6,
                  borderRadius: 0.5,
                  border: 1,
                  borderColor: "success.main",
                  color: "success.main",
                }}
              >
                <Check size={9} />
                <Box
                  component="span"
                  sx={{
                    fontFamily: "monospace",
                    fontSize: 9.5,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    display: { xs: "none", sm: "block" },
                  }}
                >
                  {t("ALREADY_ADDED")}
                </Box>
              </Stack>
            ) : null}

            {/* `autoHighlight` is on, so Enter already picks the top row and
                nothing ever said so. */}
            <Box
              className="searchEnterHint"
              component="span"
              sx={{
                opacity: 0,
                flexShrink: 0,
                fontFamily: "monospace",
                fontSize: 10,
                lineHeight: 1.4,
                px: 0.5,
                borderRadius: 0.5,
                border: 1,
                borderColor: "divider",
                color: "text.secondary",
                display: { xs: "none", sm: "block" },
              }}
            >
              ↩
            </Box>

            {/* Its own column, tabular, so a list of near-identical titles is
                separable by the one thing that differs. */}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                flexShrink: 0,
                fontFamily: "monospace",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {released || "—"}
            </Typography>
          </Box>
        );
      }}
    />
  );
}
