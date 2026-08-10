#!/usr/bin/env bun

/**
 * Recreate a Notion workspace from an archive written by the backup connector.
 *
 *   bun support/restoreNotionBackup.ts --from <archive.zip|dir> --parent <page id>
 *
 * `--from` takes either the downloaded zip or a directory you already
 * extracted. `--parent` is the page everything is recreated under: restore
 * never writes over the originals, it rebuilds the tree somewhere you choose,
 * so a restore run can be inspected before anything is thrown away.
 *
 * The token comes from `--token` or `$NOTION_TOKEN`, and the integration needs
 * access to the parent page.
 *
 * `--dry-run` walks the whole archive and prints the same report without
 * calling the API once — worth doing first, because it tells you exactly what
 * cannot be restored before you have half a workspace.
 *
 * What does not come back, and why:
 *
 * - **Uploaded files.** Images, PDFs and attachments are in the archive, but
 *   the public API takes a URL, not bytes. Each one becomes a placeholder
 *   paragraph naming the file in the archive, so the position survives and the
 *   report tells you what to re-upload. Externally-hosted files restore fine.
 * - **Relations, rollups, status properties and unique ids.** A relation points
 *   at a database id that no longer exists; status columns cannot be created
 *   through the API at all. The columns are dropped and reported.
 * - **Comments, and who edited what.** Never in the archive — the backup reads
 *   content, not history.
 * - **Position of sub-pages.** A sub-page is restored as a child of its parent
 *   page, but Notion appends it after the parent's blocks rather than at the
 *   spot it used to sit in.
 */

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Client } from "@notionhq/client";

/** Blocks whose children must be created in the same request as the parent. */
const INLINE_CHILDREN = new Set(["column_list", "column", "table"]);

/** Blocks that are another archived entry, or that the API will not create. */
const NOT_CREATABLE = new Set([
  "child_page",
  "child_database",
  "unsupported",
  "ai_block",
  "template",
  "synced_block",
  "link_preview",
]);

/** Property types the API refuses to create, or that cannot survive the move. */
const UNRESTORABLE_PROPERTIES = new Set([
  "relation",
  "rollup",
  "status",
  "unique_id",
]);

/** Property values Notion computes for itself. */
const READ_ONLY_VALUES = new Set([
  "created_by",
  "created_time",
  "last_edited_by",
  "last_edited_time",
  "formula",
  "rollup",
  "unique_id",
]);

/**
 * Keys Notion assigns, removed from every payload before it is sent back.
 *
 * Deliberately does *not* include `url`. `strip` runs over the whole nested
 * body, and `url` is load-bearing several levels down — a bookmark's target, an
 * embed's source, an externally-hosted image, the value of a url column. It
 * only looks like server-owned metadata because pages happen to have one too,
 * and pages never reach `strip`.
 */
const FIELDS_NOTION_OWNS = [
  "id",
  "object",
  "created_time",
  "created_by",
  "last_edited_time",
  "last_edited_by",
  "has_children",
  "archived",
  "in_trash",
  "parent",
  "request_id",
  "developer_survey",
  // Derived from `text.content`, and rejected in some payloads.
  "plain_text",
];

interface Item {
  object: "page" | "database" | "block";
  id: string;
  type?: string;
  parent?: {
    type: string;
    page_id?: string;
    block_id?: string;
    database_id?: string;
  };
  properties?: Record<string, any>;
  icon?: any;
  cover?: any;
  title?: any;
  description?: any;
  has_children?: boolean;
  [key: string]: any;
}

interface Archive {
  items: Item[];
  /** Zip entry name → the manifest record for that file. */
  assets: Map<string, { file: string; name?: string }>;
}

/** Everything the run could not bring back, gathered for one report at the end. */
class Report {
  readonly created = { pages: 0, databases: 0, blocks: 0 };
  private readonly lines: string[] = [];

  note(message: string): void {
    this.lines.push(message);
  }

  print(dryRun: boolean): void {
    const verb = dryRun ? "Would create" : "Created";

    console.log(
      `\n${verb} ${this.created.pages} pages, ${this.created.databases} databases, ${this.created.blocks} blocks.`,
    );

    if (!this.lines.length) {
      console.log("Nothing was left behind.");

      return;
    }

    console.log(`\n${this.lines.length} things need your attention:\n`);

    for (const line of this.lines) {
      console.log(`  - ${line}`);
    }
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      from: { type: "string" },
      parent: { type: "string" },
      token: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const dryRun = values["dry-run"] === true;
  const token = values.token ?? process.env["NOTION_TOKEN"];

  if (!values.from) {
    throw new Error("--from <archive.zip|dir> is required.");
  }

  if (!dryRun && !values.parent) {
    throw new Error("--parent <page id> is required (or pass --dry-run).");
  }

  if (!dryRun && !token) {
    throw new Error(
      "--token, or NOTION_TOKEN in the environment, is required.",
    );
  }

  const { archive, cleanup } = await openArchive(values.from);

  try {
    const report = new Report();
    const restore = new Restore(
      archive,
      report,
      dryRun ? undefined : new Client({ auth: token }),
    );

    await restore.run(values.parent ?? "dry-run");

    report.print(dryRun);
  } finally {
    await cleanup();
  }
}

/** Read `data.json` and `manifest.json` out of a zip or an extracted folder. */
async function openArchive(
  path: string,
): Promise<{ archive: Archive; cleanup: () => Promise<void> }> {
  let directory = path;
  let cleanup = async (): Promise<void> => {};

  if (path.toLowerCase().endsWith(".zip")) {
    directory = await mkdtemp(join(tmpdir(), "notion-restore-"));
    cleanup = () => rm(directory, { recursive: true, force: true });

    const unzip = Bun.spawn(["unzip", "-q", "-o", path, "-d", directory], {
      stderr: "pipe",
    });

    if ((await unzip.exited) !== 0) {
      await cleanup();

      throw new Error(
        `Could not extract ${path}: ${await new Response(unzip.stderr).text()}` +
          "\nExtract it yourself and pass the directory instead.",
      );
    }
  }

  const names = await readdir(directory);
  // Archives written before the manifest existed call it `data_data.json`.
  const dataEntry = ["data.json", "data_data.json"].find((name) =>
    names.includes(name),
  );

  if (!dataEntry) {
    await cleanup();

    throw new Error(`No data.json in ${path} — is this a Notion backup?`);
  }

  const items = JSON.parse(
    await readFile(join(directory, dataEntry), "utf8"),
  ) as Item[];

  const assets = new Map<string, { file: string; name?: string }>();

  if (names.includes("manifest.json")) {
    const manifest = JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8"),
    );

    for (const asset of manifest.assets ?? []) {
      assets.set(asset.ownerId, asset);
    }
  }

  console.log(
    `Read ${items.length} items and ${assets.size} archived files from ${dataEntry}.`,
  );

  return { archive: { items, assets }, cleanup };
}

class Restore {
  private readonly byId = new Map<string, Item>();
  private readonly children = new Map<string, Item[]>();

  constructor(
    private readonly archive: Archive,
    private readonly report: Report,
    /** Absent on a dry run: nothing is sent, everything is still walked. */
    private readonly client?: Client,
  ) {
    for (const item of archive.items) {
      this.byId.set(item.id, item);
    }

    for (const item of archive.items) {
      const parentId = parentOf(item);

      if (parentId) {
        const siblings = this.children.get(parentId) ?? [];

        siblings.push(item);
        this.children.set(parentId, siblings);
      }
    }
  }

  async run(parentPageId: string): Promise<void> {
    // A page whose parent is the workspace, or whose parent did not make it
    // into the archive — an integration only ever sees what it was shared.
    const roots = this.archive.items.filter((item) => {
      if (item.object === "block") {
        return false;
      }

      const parentId = parentOf(item);

      return !parentId || !this.byId.has(parentId);
    });

    console.log(`Restoring ${roots.length} top-level items.`);

    for (const root of roots) {
      await this.restoreItem(root, { type: "page_id", page_id: parentPageId });
    }
  }

  private async restoreItem(item: Item, parent: any): Promise<void> {
    try {
      if (item.object === "database") {
        await this.restoreDatabase(item, parent);
      } else {
        await this.restorePage(item, parent);
      }
    } catch (error) {
      // One unrestorable page must not cost the user the rest of the restore.
      this.report.note(`${describe(item)} failed: ${reason(error)}`);
    }
  }

  private async restorePage(page: Item, parent: any): Promise<void> {
    const properties =
      parent.type === "database_id"
        ? this.rowProperties(page)
        : { title: strip(titleOf(page)) };

    const created = await this.create("page", {
      parent,
      properties,
      ...this.decoration(page),
    });

    this.report.created.pages++;

    const contents = this.children.get(page.id) ?? [];

    await this.appendBlocks(
      created,
      contents.filter((child) => child.object === "block"),
    );

    // Sub-pages and sub-databases are their own archived entries, so they are
    // rebuilt here rather than as blocks of this page.
    for (const child of contents) {
      if (child.object !== "block") {
        await this.restoreItem(child, { type: "page_id", page_id: created });
      }
    }
  }

  private async restoreDatabase(database: Item, parent: any): Promise<void> {
    const properties: Record<string, any> = {};

    for (const [name, definition] of Object.entries(
      database.properties ?? {},
    )) {
      const type = (definition as any).type;

      if (UNRESTORABLE_PROPERTIES.has(type)) {
        this.report.note(
          `${describe(database)}: dropped the "${name}" column (${type} cannot be recreated through the API)`,
        );

        continue;
      }

      properties[name] = { [type]: strip((definition as any)[type] ?? {}) };
    }

    const created = await this.create("database", {
      parent,
      title: strip(database.title ?? []),
      ...(database.description
        ? { description: strip(database.description) }
        : {}),
      properties,
      ...this.decoration(database),
    });

    this.report.created.databases++;

    for (const row of this.children.get(database.id) ?? []) {
      await this.restoreItem(row, {
        type: "database_id",
        database_id: created,
      });
    }
  }

  /**
   * Append `blocks` under `parentId`, then their own children, level by level.
   *
   * Container blocks are the exception: a `column_list` with no columns, or a
   * `table` with no rows, is rejected by the API, so those subtrees are built
   * inline in the one request.
   */
  private async appendBlocks(parentId: string, blocks: Item[]): Promise<void> {
    const payloads: any[] = [];
    const deferred: (Item[] | undefined)[] = [];

    for (const block of blocks) {
      const payload = this.blockPayload(block);

      if (!payload) {
        continue;
      }

      payloads.push(payload);
      deferred.push(
        INLINE_CHILDREN.has(block.type ?? "")
          ? undefined
          : this.children.get(block.id),
      );
    }

    // Notion caps a single append at 100 children.
    for (let start = 0; start < payloads.length; start += 100) {
      const batch = payloads.slice(start, start + 100);
      const created = await this.append(parentId, batch);

      this.report.created.blocks += batch.length;

      for (const [index, id] of created.entries()) {
        const grandchildren = deferred[start + index];

        if (id && grandchildren?.length) {
          await this.appendBlocks(id, grandchildren);
        }
      }
    }
  }

  /** One block as the API wants it, or undefined if it cannot be recreated. */
  private blockPayload(block: Item): any {
    const type = block.type ?? "";

    if (NOT_CREATABLE.has(type)) {
      // Sub-pages and databases come back through `restorePage`; the rest
      // genuinely cannot be created, so say so rather than dropping silently.
      if (type !== "child_page" && type !== "child_database") {
        this.report.note(`Skipped a ${type} block (the API cannot create one)`);
      }

      return undefined;
    }

    const body = block[type];

    // An uploaded file's URL died with the backup that captured it, so the
    // block is replaced by a marker naming the file inside the archive.
    if (body?.type === "file") {
      const asset = this.archive.assets.get(block.id);
      const where = asset?.name ?? asset?.file ?? "in the archive";

      this.report.note(`Re-upload ${where} (was a ${type} block)`);

      return {
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: `[restore: re-upload ${where}]` },
            },
          ],
        },
      };
    }

    const payload: any = { type, [type]: strip(body ?? {}) };

    if (INLINE_CHILDREN.has(type)) {
      const inline = (this.children.get(block.id) ?? [])
        .map((child) => this.blockPayload(child))
        .filter(Boolean);

      if (inline.length) {
        payload[type].children = inline;
        // Counted here because they never pass through `appendBlocks`.
        this.report.created.blocks += inline.length;
      }
    }

    return payload;
  }

  /** Row values, minus the ones Notion computes and the ones we dropped. */
  private rowProperties(page: Item): Record<string, any> {
    const properties: Record<string, any> = {};

    for (const [name, value] of Object.entries(page.properties ?? {})) {
      const type = (value as any).type;

      if (READ_ONLY_VALUES.has(type) || UNRESTORABLE_PROPERTIES.has(type)) {
        continue;
      }

      const content = (value as any)[type];

      // `files` values are uploaded attachments with the same dead URLs as
      // file blocks; `people` are user ids that mean nothing in a restore.
      if (type === "files" || type === "people") {
        if (Array.isArray(content) && content.length) {
          this.report.note(
            `${describe(page)}: dropped the "${name}" ${type} value`,
          );
        }

        continue;
      }

      if (content !== null && content !== undefined) {
        properties[name] = { [type]: strip(content) };
      }
    }

    return properties;
  }

  /** Icon and cover, keeping only what outlives the archive. */
  private decoration(item: Item): Record<string, any> {
    const decoration: Record<string, any> = {};

    for (const slot of ["icon", "cover"] as const) {
      const value = item[slot];

      if (!value) {
        continue;
      }

      if (value.type === "file") {
        this.report.note(`Re-upload the ${slot} of ${describe(item)}`);

        continue;
      }

      decoration[slot] = value;
    }

    return decoration;
  }

  private async create(kind: "page" | "database", body: any): Promise<string> {
    if (!this.client) {
      return `dry-run-${kind}`;
    }

    const created =
      kind === "page"
        ? await this.client.pages.create(body)
        : await this.client.databases.create(body);

    return created.id;
  }

  private async append(parentId: string, children: any[]): Promise<string[]> {
    if (!this.client) {
      // Placeholder ids, not empty strings: the caller descends only into
      // children whose parent came back with an id, so blanks here would make
      // a dry run stop at the first level and miss every nested block it is
      // meant to be warning about.
      return children.map((_, index) => `dry-run-${parentId}-${index}`);
    }

    const { results } = await this.client.blocks.children.append({
      block_id: parentId,
      children,
    });

    return results.map((block) => block.id);
  }
}

function parentOf(item: Item): string | undefined {
  const parent = item.parent;

  return parent?.page_id ?? parent?.database_id ?? parent?.block_id;
}

/** Drop everything Notion assigns, recursively. */
function strip<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(strip) as T;
  }

  if (value && typeof value === "object") {
    const copy: Record<string, any> = {};

    for (const [key, nested] of Object.entries(value)) {
      if (!FIELDS_NOTION_OWNS.includes(key)) {
        copy[key] = strip(nested);
      }
    }

    return copy as T;
  }

  return value;
}

function titleOf(page: Item): any[] {
  const property = Object.values(page.properties ?? {}).find(
    (value: any) => value?.type === "title",
  );

  return (property as any)?.title ?? [];
}

function describe(item: Item): string {
  const title = plain(titleOf(item)) || plain(item.title) || "Untitled";

  return `${item.object} "${title}"`;
}

function plain(richText: any): string {
  return Array.isArray(richText)
    ? richText.map((part) => part.plain_text ?? "").join("")
    : "";
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

await main();
