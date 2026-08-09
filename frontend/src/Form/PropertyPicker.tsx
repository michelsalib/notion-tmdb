import {
  Box,
  ListSubheader,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { type FieldSpec, typeLabel } from "backend/src/fields";
import type { MappableProperty } from "backend/src/mapping";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Glyph for a Notion property type.
 *
 * Always rendered next to the property's name and marked `aria-hidden`: the
 * emoji used to be the only indicator of a column's type, which left it
 * unreadable to a screen reader and undocumented to everyone else.
 */
export function propertyIcon(type: string): string {
  switch (type) {
    case "status":
      return "🟢";
    case "url":
      return "🔗";
    case "title":
      return "🗒️";
    case "multi_select":
      return "✔️";
    case "select":
      return "🏷️";
    case "number":
      return "🔢";
    case "date":
      return "📆";
    case "checkbox":
      return "☑️";
    case "people":
      return "👤";
    case "files":
      return "📎";
    default:
      return "📝";
  }
}

/**
 * The property's Notion type, set in the utility face.
 *
 * Shown on the closed control, not just inside the open menu: "wrong type" was
 * only ever explained *after* someone opened the list and found their column
 * greyed out. On the row it is what tells them, before they touch anything,
 * that the column they are looking at is a status where a date is needed.
 */
function TypeTag({ type }: { type: string }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        fontFamily: "monospace",
        fontSize: 10,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: "text.disabled",
        flexShrink: 0,
      }}
    >
      {type.replace("_", " ")}
    </Box>
  );
}

/**
 * Choose which Notion property a connector field writes to.
 *
 * Incompatible properties stay visible but disabled, each stating the type it
 * has and the type the field needs. Hiding them would be worse — the property
 * someone is looking for (their column literally named "Status", which is a
 * status property where a date is needed) would simply be absent, and they
 * would conclude the app could not see their database.
 */
export function PropertyPicker({
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

  const [compatible, incompatible] = useMemo(() => {
    const ok: MappableProperty[] = [];
    const no: MappableProperty[] = [];

    for (const property of properties) {
      (property.type === field.columnType ? ok : no).push(property);
    }

    return [ok, no];
  }, [properties, field.columnType]);

  const selected = properties.find((p) => p.id === value);

  return (
    <Select
      fullWidth
      size="small"
      displayEmpty
      value={selected ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label={field.label}
      sx={{
        // A pill, not a form field. Both sides of a mapping row are one value
        // each — this column *is* your Notion column — and a boxed dropdown
        // made the row read as a form to fill in rather than as a pairing to
        // check. Mapped: a filled tablet with no border. Unmapped: a dashed
        // outline, so the one thing blocking Save reads as an empty slot.
        borderRadius: 1,
        bgcolor: selected ? "action.hover" : "transparent",
        "& .MuiOutlinedInput-notchedOutline": selected
          ? { border: 0 }
          : { borderStyle: "dashed", borderColor: "text.disabled" },
        "&:hover .MuiOutlinedInput-notchedOutline": selected
          ? { border: 0 }
          : undefined,
        "& .MuiSelect-select": { paddingBlock: 0.75 },
      }}
      renderValue={() =>
        selected ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              minWidth: 0,
            }}
          >
            <span aria-hidden>{propertyIcon(selected.type)}</span>
            <Box
              component="span"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexGrow: 1,
              }}
            >
              {selected.name}
            </Box>
            <TypeTag type={selected.type} />
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" component="span">
            {field.required ? t("PICK_A_COLUMN") : t("NOT_SYNCED")}
          </Typography>
        )
      }
    >
      {!field.required ? (
        <MenuItem value="">
          <Typography variant="body2" color="text.secondary">
            {t("NOT_SYNCED")}
          </Typography>
        </MenuItem>
      ) : null}

      {compatible.length > 0 ? (
        <ListSubheader>
          {t("COMPATIBLE_COLUMNS", { type: typeLabel(field.columnType) })}
        </ListSubheader>
      ) : null}

      {compatible.map((property) => (
        <MenuItem key={property.id} value={property.id} sx={{ gap: 1 }}>
          <span aria-hidden>{propertyIcon(property.type)}</span>
          {property.name}
        </MenuItem>
      ))}

      {incompatible.length > 0 ? (
        <ListSubheader>{t("UNAVAILABLE_COLUMNS")}</ListSubheader>
      ) : null}

      {incompatible.map((property) => (
        <MenuItem
          key={property.id}
          value={property.id}
          disabled
          sx={{ gap: 1 }}
        >
          <span aria-hidden>{propertyIcon(property.type)}</span>
          <Box component="span" sx={{ flexGrow: 1 }}>
            {property.name}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {t("WRONG_TYPE", {
              has: typeLabel(property.type),
              needs: typeLabel(field.columnType),
            })}
          </Typography>
        </MenuItem>
      ))}
    </Select>
  );
}
