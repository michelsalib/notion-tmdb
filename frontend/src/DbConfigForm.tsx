import {
  Alert,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import type {
  DbConfig,
  DOMAIN,
  GBookDbConfig,
  NotionDatabase,
  TmdbDbConfig,
} from "backend/src/types";
import { Fragment, useEffect, useMemo, useState } from "react";

type NotionPropertyType = NotionDatabase["properties"][0]["type"];

interface DbField<T extends DbConfig> {
  label: string;
  required: boolean;
  dbConfigField: keyof T;
  columnType: NotionPropertyType;
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

  return "📝";
}

function computeDefaultState<T extends DbConfig>(
  dbId: string,
  domain: DOMAIN,
): T {
  if (domain == "GBook") {
    return {
      id: dbId,
      url: "",
      status: "",
      title: "",
      author: "",
      genre: "",
      releaseDate: "",
    } as GBookDbConfig as any;
  }

  return {
    id: dbId,
    url: "",
    status: "",
    director: "",
    genre: "",
    rating: "",
    releaseDate: "",
    title: "",
  } as TmdbDbConfig as any;
}

function getdbFields<T extends DbConfig>(domain: DOMAIN): DbField<T>[] {
  const result: DbField<T>[] = [
    {
      label: "URL",
      dbConfigField: "url",
      columnType: "url",
      required: true,
      helperText:
        "This mandatory field helps associate your entry with the data provider.",
    },
    {
      label: "Status",
      dbConfigField: "status",
      columnType: "status",
      required: true,
      helperText:
        "This mandatory field helps the plugin to identify your entries that need to be synched.",
    },
    {
      label: "Title",
      dbConfigField: "title",
      columnType: "title",
      required: false,
    },
    {
      label: "Release date",
      columnType: "date",
      dbConfigField: "releaseDate",
      required: false,
    },
    {
      label: "Genre",
      columnType: "multi_select",
      dbConfigField: "genre",
      required: false,
    },
  ];

  if (domain == "GBook") {
    result.push({
      label: "Author",
      columnType: "rich_text",
      dbConfigField: "author",
      required: false,
    } as DbField<GBookDbConfig> as any);
  } else {
    result.push({
      label: "Director",
      columnType: "rich_text",
      dbConfigField: "director",
      required: false,
    } as DbField<TmdbDbConfig> as any);
    result.push({
      label: "Rating",
      columnType: "number",
      dbConfigField: "rating",
      required: false,
    } as DbField<TmdbDbConfig> as any);
  }

  return result;
}

export function DbConfigForm<T extends DbConfig>({
  domain,
  notionDatabases,
  initialConfig,
  onConfigChange,
}: {
  domain: DOMAIN;
  notionDatabases: NotionDatabase[];
  initialConfig?: T;
  onConfigChange: (dbConfig: T) => any;
}) {
  const [config, setConfig] = useState<T>({
    ...computeDefaultState<T>(notionDatabases[0].id, domain),
    ...initialConfig,
  });

  useEffect(() => onConfigChange(config), [config]);
  const dbFields = useMemo(() => getdbFields<T>(domain), []);

  const database = notionDatabases.find(
    (db) => db.id == config.id,
  ) as NotionDatabase;
  const columns = Object.values(database.properties);
  const urlColumns: any[] = columns.filter((p: any) => p.type == "url");
  const statusColumns: any[] = columns.filter((p: any) => p.type == "status");

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Pick your database</Typography>
      <FormControl>
        <InputLabel>Database</InputLabel>
        <Select
          label="database"
          value={config.id}
          onChange={(event) =>
            setConfig((c) => ({ ...c, id: event.target.value }))
          }
        >
          {notionDatabases.map((db) => (
            <MenuItem value={db.id} key={db.id}>
              <Stack direction={"row"} spacing={2}>
                <Typography>{(db.icon as any).emoji}</Typography>
                <Typography>{db.title[0].plain_text}</Typography>
              </Stack>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {!urlColumns.length || !statusColumns.length ? (
        <Alert severity="warning">
          Database <strong>{database.title[0].plain_text}</strong> is missing
          mandatory url and status columns
        </Alert>
      ) : (
        <Fragment>
          <Typography variant="h6">Map your columns</Typography>

          {dbFields.map((dbField) => {
            return (
              <FormControl
                required={dbField.required}
                key={dbField.dbConfigField as string}
              >
                <InputLabel>{dbField.label}</InputLabel>
                <Select
                  label={dbField.label}
                  value={config[dbField.dbConfigField]}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      [dbField.dbConfigField]: event.target.value,
                    })
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
              </FormControl>
            );
          })}
        </Fragment>
      )}
    </Stack>
  );
}
