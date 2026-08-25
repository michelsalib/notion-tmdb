import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_DOMAINS, type DOMAIN, DOMAINS } from "./domains.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The built copy first, because that is the only one the runtime image ships
// (`bun run build` does `cp -r static/. dist/`); the source second, so a
// checkout that has never been built — CI, which runs `bun test` without a
// frontend build — still reads real copy rather than the fallback.
const LOCALE_DIRS = [
  join(__dirname, "../../frontend/dist/locales/en"),
  join(__dirname, "../../frontend/static/locales/en"),
];

/**
 * What gets stamped into the served `index.html` for one request.
 *
 * All six connectors are one Cloud Run service serving one built document, so
 * un-stamped every host returns the same bytes: no `<title>` at all, no
 * canonical, no `og:*`, and a single generic all-connectors `description`.
 * Helmet fills the title in on mount (`App.tsx`), which only ever helped
 * clients that run JS — a crawler saw six identical titleless pages and picked
 * one, and a link pasted into Notion or Slack (where this product lives)
 * unfurled as a bare URL.
 */
export interface PageMeta {
  /**
   * `<title>`. Deliberately the same string Helmet sets on mount, so the tab
   * does not change under the user a moment after first paint.
   */
  title: string;
  /**
   * Card headline for an unfurl: the connector's own pitch, not the product
   * name — `og:site_name` carries that instead.
   */
  ogTitle: string;
  /**
   * Replaces the document's generic description. `undefined` leaves whatever
   * `index.html` ships with in place, rather than dropping it for nothing.
   */
  description: string | undefined;
  /** Absolute URL of this host's bare landing page. */
  canonical: string;
  /** Anything that is not a connector's own landing page stays out of search. */
  noindex: boolean;
}

interface ConnectorPitch {
  ogTitle: string;
  description: string | undefined;
}

let pitches: Promise<Record<DOMAIN, ConnectorPitch>> | undefined;

/**
 * Per-connector copy, read from the same locale files the landing page renders
 * from (`PITCH_TITLE`/`PITCH_BODY`) rather than restated here — the page and
 * the unfurl card describing it must not be able to disagree.
 *
 * Memoised: the files ship inside the image and never change under a running
 * process.
 */
export function connectorPitches(): Promise<Record<DOMAIN, ConnectorPitch>> {
  pitches ??= loadPitches();
  return pitches;
}

async function loadPitches(): Promise<Record<DOMAIN, ConnectorPitch>> {
  const entries = await Promise.all(
    ALL_DOMAINS.map(
      async (domain) => [domain, await readPitch(domain)] as const,
    ),
  );

  return Object.fromEntries(entries) as Record<DOMAIN, ConnectorPitch>;
}

async function readPitch(domain: DOMAIN): Promise<ConnectorPitch> {
  const { label, pre } = DOMAINS[domain];
  const productName = `${pre} ⇄ ${label}`;

  for (const dir of LOCALE_DIRS) {
    const file = Bun.file(join(dir, `${domain}.yaml`));

    try {
      if (!(await file.exists())) {
        continue;
      }

      const parsed = Bun.YAML.parse(await file.text()) as Record<
        string,
        unknown
      > | null;

      return {
        ogTitle: str(parsed?.["PITCH_TITLE"]) ?? productName,
        description: str(parsed?.["PITCH_BODY"]),
      };
    } catch {
      // An unparseable locale file must not take the app down: the head
      // degrades to the product name and the document's own description.
      break;
    }
  }

  return { ogTitle: productName, description: undefined };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** The head for one connector on one host. */
export async function pageMeta(
  domain: DOMAIN,
  canonical: string,
  noindex: boolean,
): Promise<PageMeta> {
  const { label, pre } = DOMAINS[domain];
  const pitch = (await connectorPitches())[domain];

  return {
    title: `${pre} ⇄ ${label}`,
    ogTitle: pitch.ogTitle,
    description: pitch.description,
    canonical,
    noindex,
  };
}

// Matches the shipped tag whether it is written across four lines (as
// `frontend/index.html` formats it) or collapsed onto one. It has to be
// removed rather than merely added to: two `name="description"` tags in one
// head means the generic sentence is still a candidate for the snippet.
const DESCRIPTION_TAG = /[ \t]*<meta\s+name=["']?description["']?[\s\S]*?>\n?/i;

/**
 * Insert this request's head tags into the built document.
 *
 * Pure and string-in/string-out on purpose: it is the part worth pinning in
 * tests, and it keeps the route in `index.ts` down to resolving the connector.
 */
export function stampHead(html: string, meta: PageMeta): string {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    meta.description &&
      `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
    meta.noindex && `<meta name="robots" content="noindex, follow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}" />`,
    meta.description &&
      `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ].filter((tag): tag is string => typeof tag === "string");

  const body = meta.description ? html.replace(DESCRIPTION_TAG, "") : html;
  const block = tags.map((tag) => `    ${tag}\n`).join("");
  // The bundler appends its `<script>` tag right before `</head>` without a
  // trailing newline, so open one rather than starting the block mid-line.
  const lead = /\n[ \t]*<\/head>/.test(body) ? "" : "\n";

  return body.replace("</head>", `${lead}${block}  </head>`);
}

/** Escapes both attribute values and the title's text: a quote in the copy
 * must not be able to end an attribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
