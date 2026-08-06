import SyncAlt from "@mui/icons-material/SyncAlt";
import { MenuItem, Select, Typography, useTheme } from "@mui/material";
import { ALL_DOMAINS, DOMAINS } from "backend/src/domains";
import { useCallback, useContext } from "react";
import { DomainContext, PostDomain, PreDomain } from "./Context";

// Both dropdowns come from the shared DOMAINS registry rather than a hand-kept
// list of MenuItems. Bitwarden only fronts the backup connector, so every other
// option is disabled while it is selected — the old markup applied that guard
// to each entry individually and had missed IGDB.
const PRE_OPTIONS: PreDomain[] = [
  ...new Set(ALL_DOMAINS.map((domain) => DOMAINS[domain].pre)),
];

const POST_OPTIONS = ALL_DOMAINS.filter(
  (domain) => DOMAINS[domain].pre === "Notion",
).map((domain) => ({
  value: DOMAINS[domain].post,
  label: DOMAINS[domain].label,
}));

const BITWARDEN_POST: PostDomain = "backup";

export function DomainSwitcher({ variant }: { variant: "h2" | "h6" }) {
  const theme = useTheme();
  const font = theme.typography[variant];
  const { pre, post } = useContext(DomainContext);

  const switchDomain = useCallback((pre: PreDomain, post: PostDomain) => {
    if (pre == "Bitwarden") {
      post = BITWARDEN_POST;
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
        {PRE_OPTIONS.map((option) => (
          <MenuItem
            key={option}
            value={option}
            sx={{ fontSize: "large", fontWeight: font.fontWeight }}
          >
            {option}
          </MenuItem>
        ))}
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
        {POST_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            value={option.value}
            sx={{ fontSize: "large", fontWeight: font.fontWeight }}
            disabled={pre == "Bitwarden" && option.value != BITWARDEN_POST}
          >
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </Typography>
  );
}
