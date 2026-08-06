/**
 * The single source of truth for "which connectors exist".
 *
 * This used to be restated independently in about ten places — the DOMAIN
 * union, DomainToConfig, four maps/switches in fx/di.ts, and four more lists
 * across the frontend (Context.domainState, UserPage.SEARCH_DOMAINS,
 * DomainSwitcher, MultiEmbedPage.CONNECTORS). Adding a connector meant editing
 * every one of them with no compiler help, and they had already drifted: the
 * `DomainToConfig` chain tested a `"Backup"` that the union spells `"backup"`.
 *
 * Everything else is derived from this table, so a new entry here is picked up
 * everywhere and a missing field is a type error.
 */
export interface DomainDefinition {
  /** Hostname prefix — `<subdomain>.micheldev.com`, or `.localhost` in dev. */
  subdomain: string;
  /** Lowercase key carried in the Notion OAuth `state` round-trip. */
  state: string;
  /** Has the search → add shape, so it can appear in the multi-embed widget. */
  searchable: boolean;
  /** Display label. Not always the domain key — see BilletRéduc's accent. */
  label: string;
  /** Which identity provider fronts this connector. */
  pre: "Bitwarden" | "Notion";
  /** Display suffix used by the frontend's title/theme lookup. */
  post: string;
}

export const DOMAINS = {
  TMDB: {
    subdomain: "notion-tmdb",
    state: "tmdb",
    searchable: true,
    label: "TMDB",
    pre: "Notion",
    post: "TMDB",
  },
  IGDB: {
    subdomain: "notion-igdb",
    state: "igdb",
    searchable: true,
    label: "IGDB",
    pre: "Notion",
    post: "IGDB",
  },
  GBook: {
    subdomain: "notion-gbook",
    state: "gbook",
    searchable: true,
    label: "GBook",
    pre: "Notion",
    post: "GBook",
  },
  BilletReduc: {
    subdomain: "notion-billetreduc",
    state: "billetreduc",
    searchable: true,
    label: "BilletRéduc",
    pre: "Notion",
    post: "BilletReduc",
  },
  GoCardless: {
    subdomain: "notion-gocardless",
    state: "gocardless",
    searchable: false,
    label: "GoCardless",
    pre: "Notion",
    post: "GoCardless",
  },
  backup: {
    subdomain: "notion-backup",
    state: "backup",
    searchable: false,
    // Lowercase because the domain switcher renders it as "Notion ⇄ backup".
    label: "backup",
    pre: "Notion",
    post: "backup",
  },
  BitwardenBackup: {
    subdomain: "bitwarden-backup",
    state: "bitwardenbackup",
    searchable: false,
    label: "Bitwarden Backup",
    pre: "Bitwarden",
    post: "backup",
  },
} as const satisfies Record<string, DomainDefinition>;

export type DOMAIN = keyof typeof DOMAINS;

export const ALL_DOMAINS = Object.keys(DOMAINS) as DOMAIN[];

function byField(field: "subdomain" | "state"): Record<string, DOMAIN> {
  return Object.fromEntries(
    ALL_DOMAINS.map((domain) => [DOMAINS[domain][field], domain]),
  );
}

/** Subdomain → domain, for resolving a connector from the request hostname. */
export const HOSTNAME_DOMAIN: Record<string, DOMAIN> = byField("subdomain");

/** OAuth `state` value → domain. */
export const STATE_DOMAIN: Record<string, DOMAIN> = byField("state");

/**
 * Connectors a single embed widget may target per-request via `?domain=`.
 *
 * Deliberately only the search → add ones: the override must not be able to
 * reach the backup or GoCardless flows from an arbitrary request.
 */
export const SEARCH_DOMAINS: Record<string, DOMAIN> = Object.fromEntries(
  ALL_DOMAINS.filter((domain) => DOMAINS[domain].searchable).map((domain) => [
    DOMAINS[domain].state,
    domain,
  ]),
);

export const SEARCHABLE_DOMAINS: DOMAIN[] = ALL_DOMAINS.filter(
  (domain) => DOMAINS[domain].searchable,
);

export function isBackupDomain(domain: DOMAIN): boolean {
  return domain === "backup" || domain === "BitwardenBackup";
}
