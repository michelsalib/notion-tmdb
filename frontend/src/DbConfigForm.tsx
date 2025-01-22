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
  DOMAIN,
  DomainToConfig,
  GBookDbConfig,
  GoCardlessDbConfig,
  NotionDatabase,
  TmdbDbConfig,
} from "backend/src/types";
import { Fragment, useContext, useEffect, useMemo, useState } from "react";
import { DomainContext } from "./Context";
import { DbConfigField, DbField } from "./Form/DbConfigField";
import { GoCardlessBanks } from "./Form/GoCardlessBanks";

function computeDefaultState<T extends DOMAIN>(
  dbId: string,
  domain: T,
): DomainToConfig<T> {
  if (domain === "GBook") {
    return {
      id: dbId,
      url: "",
      status: "",
      title: "",
      author: "",
      genre: "",
      releaseDate: "",
    } as GBookDbConfig as DomainToConfig<T>;
  }

  if (domain == "GoCardless") {
    return {
      id: dbId,
      url: "",
      status: "",
      amount: "",
      bookingDate: "",
      title: "",
      valueDate: "",
      goCardlessAccounts: [],
      goCardlessId: "",
      goCardlessKey: "",
      classification: "",
      account: "",
      classificationRules: [],
    } as GoCardlessDbConfig as DomainToConfig<T>;
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
  } as TmdbDbConfig as DomainToConfig<T>;
}

function getdbFields<T extends "GBook" | "TMDB" | "GoCardless">(
  domain: T,
): DbField<T>[] {
  if (domain == "GoCardless") {
    return [
      {
        label: "Id",
        dbConfigField: "url",
        columnType: "rich_text",
        required: true,
        helperText:
          "This mandatory field helps associate your entry with the data provider.",
      },
      {
        label: "Status",
        dbConfigField: "status",
        columnType: "date",
        required: true,
        helperText:
          "This mandatory field helps the plugin to identify your entries that need to be synched.",
      },
      {
        label: "Account",
        columnType: "select",
        dbConfigField: "account",
        required: false,
      },
      {
        label: "Title",
        dbConfigField: "title",
        columnType: "title",
        required: false,
      },
      {
        label: "Amount",
        dbConfigField: "amount",
        columnType: "number",
        required: false,
      },
      {
        label: "Payment date",
        dbConfigField: "valueDate",
        columnType: "date",
        required: false,
      },
      {
        label: "Debit date",
        dbConfigField: "bookingDate",
        columnType: "date",
        required: false,
      },
      {
        label: "Classification",
        dbConfigField: "classification",
        columnType: "multi_select",
        required: false,
      },
      {
        label: "Classification rules",
        dbConfigField: "classificationRules",
        columnType: "classification[]",
        required: false,
      },
    ] as DbField<"GoCardless">[] as DbField<T>[];
  }

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
      columnType: "date",
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
  ] as DbField<"GBook" | "TMDB">[] as DbField<T>[];

  if (domain == "GBook") {
    result.push({
      label: "Author",
      columnType: "rich_text",
      dbConfigField: "author",
      required: false,
    } as DbField<"GBook"> as DbField<T>);
  } else {
    result.push({
      label: "Director",
      columnType: "rich_text",
      dbConfigField: "director",
      required: false,
    } as DbField<"TMDB"> as DbField<T>);
    result.push({
      label: "Rating",
      columnType: "number",
      dbConfigField: "rating",
      required: false,
    } as DbField<"TMDB"> as DbField<T>);
  }

  return result;
}

export function DbConfigForm<T extends "GBook" | "TMDB" | "GoCardless">({
  notionDatabases,
  initialConfig,
  onConfigChange,
}: {
  notionDatabases: NotionDatabase[];
  initialConfig?: DomainToConfig<T>;
  onConfigChange: (dbConfig: DomainToConfig<T>) => any;
}) {
  const { domain }: { domain: T } = useContext(DomainContext as any);
  const [config, setConfig] = useState<DomainToConfig<T>>({
    ...computeDefaultState(notionDatabases[0].id, domain),
    ...initialConfig,
  });

  useEffect(() => onConfigChange(config), [config]);
  const dbFields = useMemo(() => getdbFields(domain), []);

  const database = notionDatabases.find(
    (db) => db.id == config.id,
  ) as NotionDatabase;
  const columns = Object.values(database.properties);
  const idColumns = columns.filter(
    (p) => p.type == (domain == "GoCardless" ? "rich_text" : "url"),
  );
  const statusColumns = columns.filter((p) => p.type == "date");

  return (
    <Stack spacing={2}>
      {domain == "GoCardless" ? (
        <Fragment>
          <Typography variant="h6">Connect your bank</Typography>
          <GoCardlessBanks
            value={(config as GoCardlessDbConfig).goCardlessAccounts}
          ></GoCardlessBanks>
        </Fragment>
      ) : (
        ""
      )}

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

      {!idColumns.length || !statusColumns.length ? (
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
                <DbConfigField
                  onChange={(v) =>
                    setConfig({
                      ...config,
                      [dbField.dbConfigField]: v,
                    })
                  }
                  columns={columns}
                  dbField={dbField}
                  value={config[dbField.dbConfigField]}
                />
              </FormControl>
            );
          })}
        </Fragment>
      )}
    </Stack>
  );
}
