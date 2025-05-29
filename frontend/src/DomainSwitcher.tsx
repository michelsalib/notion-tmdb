import { MenuItem, Select, Typography, useTheme } from "@mui/material";
import SyncAlt from "@mui/icons-material/SyncAlt";
import { useCallback, useContext } from "react";
import { DomainContext, PostDomain, PreDomain } from "./Context";

export function DomainSwitcher({ variant }: { variant: "h2" | "h6" }) {
  const theme = useTheme();
  const font = theme.typography[variant];
  const { pre, post } = useContext(DomainContext);

  const switchDomain = useCallback((pre: PreDomain, post: PostDomain) => {
    if (pre == "Bitwarden") {
      post = "backup";
    }

    window.location.href = window.location.origin.replace(
      /(notion|bitwarden)-\w+/,
      `${pre}-${post}`,
    );
  }, []);

  return (
    <Typography variant={variant} component="div" sx={{ flexGrow: 1 }}>
      <Select
        value={pre}
        variant="standard"
        sx={{ fontSize: font.fontSize, fontWeight: font.fontWeight }}
        onChange={(e) => switchDomain(e.target.value as PreDomain, post)}
      >
        <MenuItem
          value="Notion"
          sx={{ fontSize: "large", fontWeight: font.fontWeight }}
        >
          Notion
        </MenuItem>
        <MenuItem
          value="Bitwarden"
          sx={{ fontSize: "large", fontWeight: font.fontWeight }}
        >
          Bitwarden
        </MenuItem>
      </Select>
      <SyncAlt
        fontSize={variant == "h2" ? "large" : "small"}
        color="primary"
        sx={{ marginRight: 1, marginLeft: 1 }}
      />
      <Select
        value={post}
        variant="standard"
        sx={{ fontSize: font.fontSize, fontWeight: font.fontWeight }}
        onChange={(e) => switchDomain(pre, e.target.value as PostDomain)}
      >
        <MenuItem
          value="TMDB"
          sx={{ fontSize: "large", fontWeight: font.fontWeight }}
          disabled={pre == "Bitwarden"}
        >
          TMDB
        </MenuItem>
        <MenuItem
          value="IGDB"
          sx={{ fontSize: "large", fontWeight: font.fontWeight }}
        >
          IGDB
        </MenuItem>
        <MenuItem
          value="GBook"
          sx={{ fontSize: "large", fontWeight: font.fontWeight }}
          disabled={pre == "Bitwarden"}
        >
          GBook
        </MenuItem>
        <MenuItem
          value="backup"
          sx={{ fontSize: "large", fontWeight: font.fontWeight }}
        >
          backup
        </MenuItem>
        <MenuItem
          value="GoCardless"
          sx={{ fontSize: "large", fontWeight: font.fontWeight }}
          disabled={pre == "Bitwarden"}
        >
          GoCardless
        </MenuItem>
      </Select>
    </Typography>
  );
}
