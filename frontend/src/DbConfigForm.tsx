import AutoAwesome from "@mui/icons-material/AutoAwesome";
import CheckCircle from "@mui/icons-material/CheckCircle";
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { type FieldSpec, fieldsFor } from "backend/src/fields";
import { guessMapping, type MappableProperty } from "backend/src/mapping";
import type { Config, DOMAIN, NotionDatabase } from "backend/src/types";
import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DomainContext } from "./Context";
import { PropertyPicker } from "./Form/PropertyPicker";

/** The properties of one Notion database, in the shape the matcher wants. */
function toMappable(database: NotionDatabase): MappableProperty[] {
  return Object.values(database.properties).map((p: any) => ({
    id: p.id,
    name: p.name,
    type: p.type,
  }));
}

/**
 * The mapping under construction: `id` plus one property id per field.
 *
 * Held as a flat record rather than as a `Config` union member because the
 * whole form is driven by the field registry — it addresses fields by
 * `FieldSpec.key`, which no single member of the union declares. The union is
 * restored at the boundary, where the shape is complete.
 */
type Mapping = Record<string, string>;

function emptyMapping(dbId: string, fields: readonly FieldSpec[]): Mapping {
  return {
    id: dbId,
    ...Object.fromEntries(fields.map((f) => [f.key, ""])),
  };
}

/**
 * Pick a database and say which column each piece of data goes in.
 *
 * This was seven identical dropdowns, each listing every property in the
 * database with the incompatible ones greyed out and no reason given — a dead
 * end the user could neither act on nor explain, and the step people abandoned.
 * Three things changed: the mapping is guessed on selection and shown as a
 * reviewable suggestion, every unavailable option now states why, and the
 * layout reads as what it is (this piece of data → that column) instead of as
 * a stack of unrelated form fields.
 */
export function DbConfigForm({
  notionDatabases,
  initialConfig,
  onConfigChange,
}: {
  notionDatabases: NotionDatabase[];
  initialConfig?: Config;
  /** `complete` is false while a required field is still unmapped. */
  onConfigChange: (dbConfig: Config, complete: boolean) => void;
}) {
  const { domain } = useContext(DomainContext) as { domain: DOMAIN };
  const { t } = useTranslation();
  const fields = useMemo(() => fieldsFor(domain), [domain]);

  /** Guess a mapping for `dbId`, discarding whatever was mapped before. */
  function match(dbId: string): { mapping: Mapping; count: number } {
    const target = notionDatabases.find((db) => db.id == dbId);
    const mapping = emptyMapping(dbId, fields);

    if (!target) {
      return { mapping, count: 0 };
    }

    const matches = guessMapping(fields, toMappable(target));

    for (const m of matches) {
      mapping[m.key] = m.propertyId;
    }

    return { mapping, count: matches.length };
  }

  // Guess on mount for a user who has not configured this connector yet.
  // Running the guess only from the database dropdown's `onChange` meant it
  // never fired for the commonest case of all: one database, already selected
  // by default, so nothing ever changed and the whole feature sat silent.
  const [initial] = useState(() =>
    initialConfig
      ? {
          mapping: initialConfig as unknown as Mapping,
          count: null as number | null,
        }
      : match(notionDatabases[0]?.id ?? ""),
  );

  const [config, setConfig] = useState<Mapping>(initial.mapping);
  // How many fields the last auto-match filled in, so the banner can say so.
  // `null` means no guess has run (an already-configured connector).
  const [guessed, setGuessed] = useState<number | null>(initial.count);

  const database = notionDatabases.find((db) => db.id == config["id"]);
  const properties = useMemo(
    () => (database ? toMappable(database) : []),
    [database],
  );

  const missingRequired = fields.filter((f) => f.required && !config[f.key]);

  useEffect(
    () =>
      onConfigChange(config as unknown as Config, missingRequired.length === 0),
    [config],
  );

  function selectDatabase(dbId: string) {
    // Re-guess on every change of database: the previous mapping's property ids
    // belong to a different database and would silently point at nothing.
    const { mapping, count } = match(dbId);

    setConfig(mapping);
    setGuessed(count);
  }

  function setField(key: string, value: string) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  const hasRequiredTypes = fields
    .filter((f) => f.required)
    .every((f) => properties.some((p) => p.type === f.columnType));

  return (
    <Stack spacing={2}>
      <FormControl fullWidth size="small">
        <InputLabel id="database-label">{t("DATABASE")}</InputLabel>
        <Select
          labelId="database-label"
          label={t("DATABASE")}
          value={config["id"] ?? ""}
          onChange={(event) => selectDatabase(event.target.value)}
        >
          {notionDatabases.map((db) => (
            <MenuItem value={db.id} key={db.id}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <span aria-hidden>{(db.icon as any)?.emoji ?? "🗄️"}</span>
                <span>{db.title?.[0]?.plain_text ?? t("UNTITLED")}</span>
              </Stack>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {!hasRequiredTypes ? (
        <Alert severity="warning">
          {t("DB_MISSING_COLUMNS", {
            database: database?.title?.[0]?.plain_text ?? t("UNTITLED"),
          })}
        </Alert>
      ) : (
        <>
          {guessed !== null && guessed > 0 ? (
            <Alert
              icon={<AutoAwesome fontSize="inherit" />}
              severity="success"
              variant="outlined"
            >
              {t("AUTO_MATCHED", { matched: guessed, total: fields.length })}
            </Alert>
          ) : null}

          {missingRequired.length > 0 ? (
            <Alert severity="info" variant="outlined">
              {t("PICK_REQUIRED", {
                fields: missingRequired.map((f) => f.label).join(", "),
              })}
            </Alert>
          ) : null}

          <Box>
            <Stack
              direction="row"
              sx={{ justifyContent: "space-between", mb: 0.5 }}
            >
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ lineHeight: 1.6 }}
              >
                {t("FROM_CONNECTOR")}
              </Typography>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ lineHeight: 1.6 }}
              >
                {t("YOUR_COLUMN")}
              </Typography>
            </Stack>

            <Stack
              divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}
            >
              {fields.map((field) => (
                <MappingRow
                  key={field.key}
                  field={field}
                  properties={properties}
                  value={config[field.key] ?? ""}
                  onChange={(v) => setField(field.key, v)}
                />
              ))}
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
}

/** One `data → column` line. */
function MappingRow({
  field,
  properties,
  value,
  onChange,
}: {
  field: FieldSpec;
  properties: MappableProperty[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const matched = Boolean(value);

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.5, sm: 2 }}
      sx={{ alignItems: { sm: "center" }, py: 1.25 }}
    >
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          {matched ? (
            <CheckCircle color="success" sx={{ fontSize: 15 }} />
          ) : null}
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {field.label}
          </Typography>
          {field.required ? (
            <Typography variant="caption" color="text.secondary">
              {t("REQUIRED")}
            </Typography>
          ) : null}
        </Stack>
        {field.description ? (
          <Typography variant="caption" color="text.secondary">
            {field.description}
          </Typography>
        ) : null}
      </Stack>

      <Box sx={{ flex: 1, minWidth: 0, width: { xs: "100%", sm: "auto" } }}>
        <PropertyPicker
          field={field}
          properties={properties}
          value={value}
          onChange={onChange}
        />
      </Box>
    </Stack>
  );
}

/**
 * Offer to build the database instead of mapping one.
 *
 * For a brand-new user the whole mapping step is avoidable: creating the
 * database here means its shape is right by construction and the mapping is
 * read straight off Notion's response.
 */
export function CreateDatabase({
  onCreated,
}: {
  onCreated: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [pages, setPages] = useState<{ id: string; title: string }[] | null>(
    null,
  );
  const [parent, setParent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/pages")
      .then((r) => r.json())
      .then(({ pages }: { pages: { id: string; title: string }[] }) => {
        setPages(pages);
        setParent(pages[0]?.id ?? "");
      })
      .catch(() => setPages([]));
  }, []);

  async function create() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPageId: parent }),
      });

      if (!response.ok) {
        setError(t("CREATE_DB_FAILURE"));

        return;
      }

      await onCreated();
    } catch {
      setError(t("CREATE_DB_FAILURE"));
    } finally {
      setBusy(false);
    }
  }

  if (pages === null) {
    return null;
  }

  // Notion databases live inside a page, so with nothing shared there is no
  // place to put one. Say what to do rather than failing on the API call.
  if (pages.length === 0) {
    return (
      <Alert severity="info" variant="outlined">
        {t("CREATE_DB_NO_PAGES")}
      </Alert>
    );
  }

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        {t("CREATE_DB_INTRO")}
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
          <InputLabel id="parent-page-label">
            {t("CREATE_DB_PARENT")}
          </InputLabel>
          <Select
            labelId="parent-page-label"
            label={t("CREATE_DB_PARENT")}
            value={parent}
            onChange={(e) => setParent(e.target.value)}
          >
            {pages.map((page) => (
              <MenuItem key={page.id} value={page.id}>
                {page.title}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          variant="outlined"
          onClick={create}
          disabled={busy || !parent}
          sx={{ flexShrink: 0 }}
        >
          {t("CREATE_DB_ACTION")}
        </Button>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
