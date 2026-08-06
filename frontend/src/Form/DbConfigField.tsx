import { Alert, InputLabel, MenuItem, Select, TextField } from "@mui/material";
import type { DOMAIN, DomainToConfig, NotionDatabase } from "backend/src/types";
import { Fragment } from "react";
import { MultiTextInput } from "./MultiTextInput";

type NotionPropertyType = NotionDatabase["properties"][0]["type"];

export interface DbField<T extends DOMAIN> {
  label: string;
  required: boolean;
  dbConfigField: keyof DomainToConfig<T>;
  columnType: NotionPropertyType | "string" | "string[]";
  helperText?: string;
}

function typeToEmoji(type: NotionPropertyType): string {
  if (type == "status") {
    return "🟢";
  }
  if (type == "url") {
    return "🔗";
  }
  if (type == "title") {
    return "🗒️";
  }
  if (type == "multi_select") {
    return "✔️";
  }
  if (type == "number") {
    return "🔢";
  }
  if (type == "date") {
    return "📆";
  }
  if (type == "select") {
    return "📝";
  }

  return "📝";
}

export function DbConfigField<T extends DOMAIN>({
  dbField,
  value,
  onChange,
  columns,
}: {
  dbField: DbField<T>;
  value: any;
  onChange: (value: any) => void;
  columns: any[];
}) {
  switch (dbField.columnType) {
    case "string":
      return (
        <TextField
          label={dbField.label}
          value={value}
          required={dbField.required}
          onChange={(event) =>
            event.target.value != value && onChange(event.target.value)
          }
        />
      );
    case "string[]":
      return (
        <MultiTextInput
          label={dbField.label}
          value={value as string[]}
          required={dbField.required}
          placeholder="Type to add"
          onChange={(newValue) => {
            if (JSON.stringify(newValue) != JSON.stringify(value)) {
              onChange(newValue);
            }
          }}
        ></MultiTextInput>
      );
    case "date":
    case "rich_text":
    case "title":
    case "number":
    case "url":
    case "select":
    case "multi_select":
      return (
        <Fragment>
          <InputLabel>{dbField.label}</InputLabel>
          <Select
            label={dbField.label}
            value={value}
            onChange={(e) =>
              e.target.value != value && onChange(e.target.value)
            }
          >
            {!dbField.required ? (
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
            ) : (
              ""
            )}
            {columns.map((property: any) => (
              <MenuItem
                value={property.id}
                key={property.id}
                disabled={property.type != dbField.columnType}
              >
                {typeToEmoji(property.type)} {property.name}
              </MenuItem>
            ))}
          </Select>
        </Fragment>
      );
    default:
      return (
        <Alert severity="warning">No definition for {dbField.columnType}</Alert>
      );
  }
}
