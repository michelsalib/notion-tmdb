import { Box, Skeleton, Stack, Typography } from "@mui/material";
import type { FieldPreview, Suggestion } from "backend/src/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Poster } from "../Search";
import { Swap } from "../ui/icons";

interface Preview {
  title: string;
  preview: FieldPreview[];
  cover: string;
}

/**
 * The row a suggestion would become, shown on the landing page.
 *
 * "What does it actually fill in?" is the question the pitch copy answers in a
 * sentence and this answers by doing it. `GET /api/preview` needs no session —
 * it builds the same payload `add` would write, addressed by field key instead
 * of by a Notion property id — so a visitor can see a real filled-in row before
 * connecting anything.
 *
 * Set in the same `⇄` vocabulary as the column mapping on the settings page: it
 * is the same relationship, seen once before you own it and once while you
 * configure it.
 */
export function RowPreview({ suggestion }: { suggestion: Suggestion }) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    setPreview(null);
    setFailed(false);

    void fetch(`/api/preview?id=${encodeURIComponent(suggestion.id)}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("preview failed");
        }

        return response.json();
      })
      .then((data: Preview) => {
        if (active) {
          setPreview(data);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [suggestion.id]);

  if (failed) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ p: 1.5 }}>
        {t("PREVIEW_FAILED")}
      </Typography>
    );
  }

  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ p: 1.5, borderTop: 1, borderColor: "divider" }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <Poster
          src={preview?.cover || suggestion.posterPath}
          alt=""
          width={64}
          height={96}
        />
      </Box>

      <Stack spacing={0.75} sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant="overline" color="text.secondary">
          {t("PREVIEW_HEADING")}
        </Typography>

        {preview ? (
          preview.preview.map((line) => (
            <Box
              key={line.key}
              sx={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 16px minmax(0, 1.4fr)",
                gap: 0.75,
                alignItems: "center",
              }}
            >
              <Typography variant="overline" color="text.secondary" noWrap>
                {line.label}
              </Typography>
              <Swap size={11} sx={{ color: "primary.main" }} />
              <Typography variant="caption" noWrap title={line.value}>
                {line.value}
              </Typography>
            </Box>
          ))
        ) : (
          // Sized to the row count a connector actually produces, so the panel
          // does not jump when the values arrive.
          <Stack spacing={0.75}>
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} height={14} width={`${88 - row * 11}%`} />
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
