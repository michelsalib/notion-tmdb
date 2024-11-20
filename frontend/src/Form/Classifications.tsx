import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Backspace";
import {
  Button,
  Divider,
  FormControl,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ClassificationRule } from "backend/src/types";
import { MultiTextInput } from "./MultiTextInput";

export function Classifications({
  value,
  onChange,
}: {
  value: ClassificationRule[];
  onChange: (value: ClassificationRule[]) => void;
}) {
  return (
    <Paper sx={{ padding: 2 }}>
      <Stack direction="column" spacing={2}>
        <Typography variant="subtitle2">Categories</Typography>
        {value.map((c, index) => (
          <Stack direction="column" key={index} spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControl required sx={{ flexGrow: 1 }}>
                <TextField
                  required
                  label="Category"
                  value={c.category}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    if (newValue != c.category) {
                      c.category = newValue;
                      onChange(value);
                    }
                  }}
                ></TextField>
              </FormControl>
              <IconButton
                color="error"
                onClick={() => {
                  const newValue = [...value];
                  newValue.splice(newValue.indexOf(c), 1);

                  onChange(newValue);
                }}
              >
                <DeleteIcon />
              </IconButton>
            </Stack>
            <FormControl required sx={{ flexGrow: 1 }}>
              <MultiTextInput
                required
                label="Filter"
                placeholder="Type to add"
                value={c.matchers}
                onChange={(newValue) => {
                  if (JSON.stringify(newValue) != JSON.stringify(c.matchers)) {
                    c.matchers = newValue;
                    onChange(value);
                  }
                }}
              ></MultiTextInput>
            </FormControl>
            <Divider />
          </Stack>
        ))}
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() =>
            onChange([
              ...value,
              {
                category: "",
                matchers: [],
              },
            ])
          }
        >
          Add category
        </Button>
      </Stack>
    </Paper>
  );
}
