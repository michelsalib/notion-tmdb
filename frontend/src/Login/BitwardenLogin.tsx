import { Button, SvgIcon, useTheme } from "@mui/material";
import { Fragment, useState } from "react";
import { BitwardenForm } from "./BitwardenForm";

export function BitwardenLogin() {
  const theme = useTheme();
  const [form, setForm] = useState(false);

  return (
    <Fragment>
      {form && <BitwardenForm />}
      {!form && (
        <Button variant="outlined" onClick={() => setForm(true)}>
          <SvgIcon sx={{ marginRight: 1 }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              aria-label="imgur"
              role="img"
              viewBox="0 0 512 512"
            >
              <rect
                width="512"
                height="512"
                rx="15%"
                fill={theme.palette.primary.main}
              />
              <path
                fill="white"
                d="M372 297V131H256v294c47-28 115-74 116-128zm49-198v198c0 106-152 181-165 181S91 403 91 297V99s0-17 17-17h296s17 0 17 17z"
              />
            </svg>
          </SvgIcon>
          Connect with Bitwarden
        </Button>
      )}
    </Fragment>
  );
}
