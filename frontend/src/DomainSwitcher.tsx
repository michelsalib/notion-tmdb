import ExpandMore from "@mui/icons-material/ExpandMore";
import { Box, Button, Menu, MenuItem, Typography } from "@mui/material";
import { ALL_DOMAINS, type DOMAIN, DOMAINS } from "backend/src/domains";
import { useCallback, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { DomainContext } from "./Context";
import { connectorStyle } from "./theme";

/**
 * Switch connector from the app bar.
 *
 * This used to be two `Select variant="standard"` controls rendered at `h2` on
 * the login page, doubling as the wordmark. The concept was right and now lives
 * as type on the landing page; what remains here is the ordinary navigation
 * job, so it is an ordinary labelled menu — one entry per connector, each with
 * its own mark, instead of two coupled dropdowns whose valid combinations had
 * to be maintained by disabling options.
 */
export function DomainSwitcher() {
  const { domain, pre } = useContext(DomainContext);
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const switchTo = useCallback((next: DOMAIN) => {
    window.location.href = window.location.origin.replace(
      /(notion|bitwarden)-\w+/,
      DOMAINS[next].subdomain,
    );
  }, []);

  return (
    <>
      <Button
        color="inherit"
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<ExpandMore />}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-label={t("SWITCH_CONNECTOR")}
        sx={{ textTransform: "none", gap: 0.5 }}
      >
        <Box
          component="img"
          src={connectorStyle(domain).logo}
          alt=""
          sx={{ height: 18, width: 18, objectFit: "contain", mr: 0.75 }}
        />
        <Typography component="span" sx={{ fontWeight: 600 }}>
          {pre}{" "}
          <Box component="span" sx={{ opacity: 0.6 }}>
            ⇄
          </Box>{" "}
          {DOMAINS[domain].label}
        </Typography>
      </Button>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        {ALL_DOMAINS.map((d) => (
          <MenuItem
            key={d}
            selected={d === domain}
            onClick={() => switchTo(d)}
            sx={{ gap: 1.5 }}
          >
            <Box
              component="img"
              src={connectorStyle(d).logo}
              alt=""
              sx={{ height: 20, width: 20, objectFit: "contain" }}
            />
            <Box>
              <Typography variant="body2">{DOMAINS[d].label}</Typography>
              <Typography variant="caption" color="text.secondary">
                {DOMAINS[d].pre}
              </Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
