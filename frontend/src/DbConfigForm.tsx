import {
  Box,
  Button,
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
import { Field } from "./ui/Field";
import { Check, Sparkle, Swap } from "./ui/icons";
import { Note } from "./ui/Note";

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
      <Field label={t("DATABASE")}>
        {({ id, labelId }) => (
          <Select
            id={id}
            labelId={labelId}
            fullWidth
            size="small"
            value={config["id"] ?? ""}
            onChange={(event) => selectDatabase(event.target.value)}
          >
            {notionDatabases.map((db) => (
              <MenuItem value={db.id} key={db.id}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center" }}
                >
                  <span aria-hidden>{(db.icon as any)?.emoji ?? "🗄️"}</span>
                  <span>{db.title?.[0]?.plain_text ?? t("UNTITLED")}</span>
                </Stack>
              </MenuItem>
            ))}
          </Select>
        )}
      </Field>

      {!hasRequiredTypes ? (
        <Note severity="warning">
          {t("DB_MISSING_COLUMNS", {
            database: database?.title?.[0]?.plain_text ?? t("UNTITLED"),
          })}
        </Note>
      ) : (
        <>
          {guessed !== null && guessed > 0 ? (
            <Note icon={<Sparkle size={15} />} severity="success">
              {t("AUTO_MATCHED", { matched: guessed, total: fields.length })}
            </Note>
          ) : null}

          {missingRequired.length > 0 ? (
            <Note severity="info">
              {t("PICK_REQUIRED", {
                fields: missingRequired.map((f) => f.label).join(", "),
              })}
            </Note>
          ) : null}

          {/* Two columns bridged by the product's own mark. This screen is the
              most distinctive thing the app does — it is the whole relationship
              the product names — and as a stack of labelled dropdowns it read
              as a settings form like any other. */}
          <Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 24px 1fr" },
                gap: 1,
                mb: 0.5,
              }}
            >
              <Typography variant="overline" color="text.secondary">
                {t("FROM_CONNECTOR")}
              </Typography>
              <Box sx={{ display: { xs: "none", sm: "block" } }} />
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: { xs: "none", sm: "block" } }}
              >
                {t("YOUR_COLUMN")}
              </Typography>
            </Box>

            <Stack
              divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}
              sx={{ borderTop: 1, borderColor: "divider" }}
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

/** One `we fill this in ⇄ into that column` line. */
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
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1fr 24px 1fr" },
        gap: { xs: 0.5, sm: 1 },
        alignItems: "center",
        py: 1.25,
      }}
    >
      <Stack spacing={0.25} sx={{ minWidth: 0, alignItems: "flex-start" }}>
        {/* The connector's side of the pairing, tinted with its own accent —
            the two pills say "this value" and "that column", and the colour is
            what tells you which is which without a heading. */}
        <Stack
          direction="row"
          spacing={0.75}
          sx={{
            alignItems: "center",
            maxWidth: "100%",
            minWidth: 0,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            bgcolor: "action.selected",
            color: "primary.main",
          }}
        >
          {matched ? <Check size={13} /> : null}
          <Typography variant="body2" noWrap sx={{ fontWeight: 560 }}>
            {field.label}
          </Typography>
          {field.required ? (
            <Box
              component="span"
              sx={{
                fontFamily: "monospace",
                fontSize: 9.5,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                opacity: 0.75,
                flexShrink: 0,
              }}
            >
              {t("REQUIRED")}
            </Box>
          ) : null}
        </Stack>
        {field.description ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ px: 1, display: "block" }}
          >
            {field.description}
          </Typography>
        ) : null}
      </Stack>

      {/* Decorative on this row: the relationship is already carried by the
          column headings and by the picker's own accessible name. */}
      <Swap
        size={14}
        sx={{
          color: matched ? "primary.main" : "text.disabled",
          justifySelf: "center",
          display: { xs: "none", sm: "block" },
        }}
      />

      <Box sx={{ minWidth: 0 }}>
        <PropertyPicker
          field={field}
          properties={properties}
          value={value}
          onChange={onChange}
        />
      </Box>
    </Box>
  );
}

export interface NotionPage {
  id: string;
  title: string;
}

/**
 * The pages this integration is allowed to create a database inside. `null`
 * while it is still being fetched.
 *
 * Lifted out of `CreateDatabase` because whether there is anything to offer
 * decides what the *caller* draws, not just what this component renders. Owned
 * privately, it produced two versions of the same fault on the settings page:
 * while the fetch was in flight the component returned `null` under an "or"
 * separator, leaving an "or" dividing nothing; and when Notion returned no
 * shared pages, the separator promised an alternative and was followed only by
 * the prerequisite for it, with the alternative itself absent. Neither is
 * something the caller could avoid without knowing this.
 */
export function useCreatablePages(enabled: boolean): NotionPage[] | null {
  const [pages, setPages] = useState<NotionPage[] | null>(null);

  useEffect(() => {
    // The backup connectors map no columns and never create a database, so
    // they have no use for this. Gated by a flag rather than by calling the
    // hook conditionally, which React does not allow.
    if (!enabled) {
      return;
    }

    void fetch("/api/pages")
      .then((r) => r.json())
      .then(({ pages }: { pages: NotionPage[] }) => setPages(pages))
      .catch(() => setPages([]));
  }, [enabled]);

  return pages;
}

/**
 * Offer to build the database instead of mapping one.
 *
 * For a brand-new user the whole mapping step is avoidable: creating the
 * database here means its shape is right by construction and the mapping is
 * read straight off Notion's response.
 */
export function CreateDatabase({
  pages,
  onCreated,
}: {
  /** Guaranteed non-empty by the caller — see `useCreatablePages`. */
  pages: NotionPage[];
  onCreated: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [parent, setParent] = useState(() => pages[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        {t("CREATE_DB_INTRO")}
      </Typography>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ alignItems: { sm: "flex-end" } }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Field label={t("CREATE_DB_PARENT")}>
            {({ id, labelId }) => (
              <Select
                id={id}
                labelId={labelId}
                fullWidth
                size="small"
                value={parent}
                onChange={(e) => setParent(e.target.value)}
              >
                {pages.map((page) => (
                  <MenuItem key={page.id} value={page.id}>
                    {page.title}
                  </MenuItem>
                ))}
              </Select>
            )}
          </Field>
        </Box>

        <Button
          variant="outlined"
          onClick={create}
          disabled={busy || !parent}
          sx={{ flexShrink: 0 }}
        >
          {t("CREATE_DB_ACTION")}
        </Button>
      </Stack>

      {error ? <Note severity="error">{error}</Note> : null}
    </Stack>
  );
}
