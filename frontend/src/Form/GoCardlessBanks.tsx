import {
  Autocomplete,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Bank, GoCardlessAccount } from "backend/src/types";
import { useEffect, useState } from "react";
import { Fragment } from "react/jsx-runtime";

export function GoCardlessBanks({ value }: { value: GoCardlessAccount[] }) {
  const [bankToAdd, setBankToAdd] = useState<Bank | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);

  useEffect(() => {
    fetch("/api/banks")
      .then((r) => r.json())
      .then((data) => setBanks(data.banks));
  }, []);

  async function submit() {
    if (!bankToAdd) {
      return;
    }

    const response = await fetch("/api/accounts?id=" + bankToAdd.id, {
      method: "POST",
    });

    if (response.status == 200) {
      const data = await response.json();

      window.location.href = data.link;
    }
  }

  return (
    <Fragment>
      <Stack spacing={2}>
        {value.map((bank) => {
          return (
            <Paper key={bank.requisitionId}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Box
                  component="img"
                  sx={{
                    width: 50,
                    height: 50,
                    objectFit: "cover",
                  }}
                  src={bank.logo}
                />
                <Stack direction="column">
                  <Typography variant="subtitle2">{bank.name}</Typography>
                  <Typography variant="caption">
                    {bank.accountIds.length} connected
                  </Typography>
                </Stack>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
      <Stack direction="row" spacing={2}>
        <Autocomplete
          sx={{ flexGrow: 1 }}
          options={banks}
          onChange={(event, newValue) => setBankToAdd(newValue)}
          getOptionLabel={(o) => o.name}
          isOptionEqualToValue={(o, v) => o.id == v.id}
          renderInput={(params) => <TextField {...params} placeholder="Search your bank" fullWidth />}
          renderOption={(props, option) => {
            const { key, ...optionProps } = props;

            return (
              <li key={key} {...optionProps}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center" }}
                >
                  <Box
                    component="img"
                    sx={{
                      width: 30,
                      height: 30,
                      objectFit: "cover",
                    }}
                    src={option.logo}
                  />
                  <Typography variant="subtitle2">{option.name}</Typography>
                </Stack>
              </li>
            );
          }}
        ></Autocomplete>
        <Button onClick={submit}>Add bank</Button>
      </Stack>
    </Fragment>
  );
}
