import { describe, expect, test } from "bun:test";
import { computeDomain } from "./di.js";
import type { ScopedRequest } from "./router.js";

function request(overrides: Partial<ScopedRequest> = {}): ScopedRequest {
  return {
    cookies: {},
    headers: {},
    query: {},
    body: undefined,
    hostname: "notion-tmdb.micheldev.com",
    host: "notion-tmdb.micheldev.com",
    url: "/",
    protocol: "https",
    port: 443,
    ...overrides,
  };
}

describe("computeDomain", () => {
  test("resolves from the request subdomain", () => {
    expect(
      computeDomain(request({ hostname: "notion-igdb.micheldev.com" })),
    ).toBe("IGDB");
    expect(
      computeDomain(request({ hostname: "bitwarden-backup.micheldev.com" })),
    ).toBe("BitwardenBackup");
  });

  test("distinguishes the two backup subdomains", () => {
    // They share the "backup" suffix, which is exactly the pair a looser
    // match would collapse.
    expect(
      computeDomain(request({ hostname: "notion-backup.micheldev.com" })),
    ).toBe("backup");
    expect(
      computeDomain(request({ hostname: "bitwarden-backup.micheldev.com" })),
    ).toBe("BitwardenBackup");
  });

  test("the ?domain= override wins over the hostname", () => {
    expect(
      computeDomain(
        request({
          hostname: "notion-tmdb.micheldev.com",
          query: { domain: "gbook" },
        }),
      ),
    ).toBe("GBook");
  });

  test("the ?domain= override is case-insensitive", () => {
    expect(computeDomain(request({ query: { domain: "BilletReduc" } }))).toBe(
      "BilletReduc",
    );
  });

  test("the ?domain= override cannot reach a non-search connector", () => {
    // Guards the embed widget: an arbitrary request must not be able to steer
    // itself into the backup flows.
    for (const attempt of ["backup", "bitwardenbackup"]) {
      expect(
        computeDomain(
          request({
            hostname: "notion-tmdb.micheldev.com",
            query: { domain: attempt },
          }),
        ),
      ).toBe("TMDB");
    }
  });

  test("falls back to the OAuth state when the hostname does not match", () => {
    expect(
      computeDomain(
        request({ hostname: "localhost", query: { state: "backup" } }),
      ),
    ).toBe("backup");
  });

  test("?domain= takes precedence over state", () => {
    expect(
      computeDomain(
        request({
          hostname: "localhost",
          query: { domain: "igdb", state: "gbook" },
        }),
      ),
    ).toBe("IGDB");
  });

  test("defaults to TMDB for an unrecognised host", () => {
    expect(computeDomain(request({ hostname: "localhost" }))).toBe("TMDB");
  });
});
