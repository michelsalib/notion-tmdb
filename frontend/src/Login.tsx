import { Container, Stack } from "@mui/material";
import { useContext } from "react";
import { DomainContext } from "./Context";
import { DomainSwitcher } from "./DomainSwitcher";
import { BitwardenLogin } from "./Login/BitwardenLogin";
import { NotionLogin } from "./Login/NotionLogin";

export function Login() {
  const { pre } = useContext(DomainContext);

  return (
    <Container maxWidth="sm" sx={{ padding: 2 }}>
      <Stack alignItems={"center"} spacing={3}>
        <DomainSwitcher variant="h2" />
        {pre == "Notion" && <NotionLogin />}
        {pre == "Bitwarden" && <BitwardenLogin />}
      </Stack>
    </Container>
  );
}
