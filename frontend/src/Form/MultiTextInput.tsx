import { Autocomplete, TextField } from "@mui/material";

export function MultiTextInput({
  label,
  value,
  placeholder,
  required,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <Autocomplete
      clearOnBlur
      freeSolo
      handleHomeEndKeys
      multiple
      selectOnFocus
      value={value || []}
      onChange={(event, newValue) => {
        console.log(value, newValue);
        if (JSON.stringify(newValue) != JSON.stringify(value)) {
          onChange(newValue);
        }
      }}
      options={value || []}
      getOptionLabel={(v) => v}
      filterOptions={(o, p) => {
        if (!p.inputValue) {
          return [...o];
        }

        return [...o, p.inputValue];
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          required={required}
        />
      )}
    />
  );
}
