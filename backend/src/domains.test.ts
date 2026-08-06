import { describe, expect, test } from "bun:test";
import {
  ALL_DOMAINS,
  DOMAINS,
  HOSTNAME_DOMAIN,
  isBackupDomain,
  SEARCH_DOMAINS,
  SEARCHABLE_DOMAINS,
  STATE_DOMAIN,
} from "./domains.js";

describe("DOMAINS registry", () => {
  test("every subdomain and state key is unique", () => {
    // The derived lookup maps are built by keying on these, so a duplicate
    // would silently drop a connector rather than fail to compile.
    const subdomains = ALL_DOMAINS.map((d) => DOMAINS[d].subdomain);
    const states = ALL_DOMAINS.map((d) => DOMAINS[d].state);

    expect(new Set(subdomains).size).toBe(subdomains.length);
    expect(new Set(states).size).toBe(states.length);
  });

  test("no subdomain is a substring of another", () => {
    // domainState() in the frontend resolves the connector with
    // origin.includes(subdomain), so an overlap would match the wrong one.
    for (const a of ALL_DOMAINS) {
      for (const b of ALL_DOMAINS) {
        if (a === b) continue;
        expect(DOMAINS[a].subdomain.includes(DOMAINS[b].subdomain)).toBe(false);
      }
    }
  });

  test("the derived lookup maps cover every domain", () => {
    expect(Object.values(HOSTNAME_DOMAIN).sort()).toEqual(
      [...ALL_DOMAINS].sort(),
    );
    expect(Object.values(STATE_DOMAIN).sort()).toEqual([...ALL_DOMAINS].sort());
  });

  test("SEARCH_DOMAINS exposes only searchable connectors", () => {
    // This map backs the per-request ?domain= override, so letting a backup or
    // GoCardless connector in would widen what an arbitrary request can reach.
    for (const domain of Object.values(SEARCH_DOMAINS)) {
      expect(DOMAINS[domain].searchable).toBe(true);
    }

    expect(Object.values(SEARCH_DOMAINS).sort()).toEqual(
      [...SEARCHABLE_DOMAINS].sort(),
    );
  });

  test("no backup connector is searchable", () => {
    for (const domain of ALL_DOMAINS) {
      if (isBackupDomain(domain)) {
        expect(DOMAINS[domain].searchable).toBe(false);
      }
    }
  });

  test("isBackupDomain identifies both backup connectors", () => {
    expect(isBackupDomain("backup")).toBe(true);
    expect(isBackupDomain("BitwardenBackup")).toBe(true);
    expect(isBackupDomain("TMDB")).toBe(false);
    expect(isBackupDomain("GoCardless")).toBe(false);
  });

  test("only Bitwarden-fronted connectors use the bitwarden subdomain", () => {
    for (const domain of ALL_DOMAINS) {
      const { pre, subdomain } = DOMAINS[domain];
      expect(subdomain.startsWith(pre.toLowerCase())).toBe(true);
    }
  });
});
