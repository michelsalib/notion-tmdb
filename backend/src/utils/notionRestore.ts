import type { SyncEvent } from "../types.js";
import type { BackupManifest } from "./backupArchive.js";
import { plural } from "./plural.js";

/**
 * Rebuild a Notion workspace from an archive the backup connector wrote.
 *
 * Two things shape everything here.
 *
 * A restore **never writes over the originals**. It creates one new page and
 * rebuilds the tree inside it, so a run can be read, compared and thrown away
 * without touching whatever the workspace holds now. That page is also where
 * the run reports itself: what it read, what it created, and everything it could
 * not bring back (see `restoreIntroBlocks` / `restoreSummaryBlocks`) — a report
 * printed to a terminal is no use to someone who clicked a button in Notion.
 *
 * And **one bad item must not cost the rest of the restore**. Every page is
 * created inside its own try, and what failed is noted rather than thrown, for
 * the same reason `runSync` skips a row instead of dying on it. A run where
 * *nothing* could be created is still an error, so an expired token surfaces as
 * a failure and not as an empty page.
 */

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

/** Notion caps one `children.append` at this many blocks. */
const APPEND_LIMIT = 100;

/** And one rich-text run at this many characters. */
const TEXT_LIMIT = 2000;

/** How many "needs your attention" lines the restored page lists. */
const MAX_LISTED_NOTES = 200;

/** Marks the restored page in the sidebar as a copy rather than the original. */
const RESTORE_ICON = "♻️";

/**
 * One archived object, as loosely as `data.json` can be trusted.
 *
 * Not the SDK's response types: an archive in the bucket may predate any of
 * them, and the whole point of this walk is to send back whatever is there.
 */
export interface RestoreItem {
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

export interface RestoreArchive {
  /** What the archive is called, so the restored page can name its source. */
  name: string;
  /** When the backup ran, where the archive says. */
  takenAt?: Date;
  items: RestoreItem[];
  /** Owner id → the file archived for it, for naming what needs re-uploading. */
  assets: Map<string, { file: string; name?: string }>;
  /** How many files the backup captured. */
  assetCount: number;
}

/**
 * The writes a restore makes.
 *
 * Payload-in rather than one typed helper per shape, because a restore replays
 * whatever the workspace happened to contain. Behind an interface so the walk
 * can be driven against something other than a live workspace in tests — this
 * one writes thousands of pages, and it is not the kind of thing to verify by
 * running it.
 */
export interface RestoreTarget {
  /**
   * Create the one page the restore is built inside.
   *
   * Separate from `createPage` because *where* it goes is not the walk's
   * business: `NotionClient` puts it at the top level of the workspace. The walk
   * only decides what it is called and what it says.
   */
  createRoot(body: any): Promise<{ id: string; url?: string }>;
  createPage(body: any): Promise<{ id: string; url?: string }>;
  createDatabase(body: any): Promise<{ id: string; url?: string }>;
  appendBlocks(parentId: string, children: any[]): Promise<string[]>;
}

/** Everything the run could not bring back, gathered for one report. */
export class RestoreReport {
  readonly created = { pages: 0, databases: 0, blocks: 0 };
  readonly notes: string[] = [];

  note(message: string): void {
    this.notes.push(message);
  }

  /** "12 pages, 2 databases and 340 blocks". */
  summary(): string {
    const { pages, databases, blocks } = this.created;

    return `${count(pages, "page")}, ${count(databases, "database")} and ${count(blocks, "block")}`;
  }
}

/**
 * An archive's two JSON entries, as the walk wants them.
 *
 * `manifest` is optional because it did not always exist — an archive from
 * before it names its data entry `data_data.json` and carries no asset list, so
 * a restore of one reports files it cannot name rather than refusing to run.
 */
export function parseArchive(input: {
  name: string;
  takenAt?: Date;
  data: string;
  manifest?: string;
}): RestoreArchive {
  const items = JSON.parse(input.data) as RestoreItem[];

  if (!Array.isArray(items)) {
    throw new Error(`${input.name} does not hold a list of Notion objects.`);
  }

  const assets = new Map<string, { file: string; name?: string }>();
  let manifest: BackupManifest | undefined;

  if (input.manifest) {
    manifest = JSON.parse(input.manifest) as BackupManifest;

    for (const asset of manifest.assets ?? []) {
      assets.set(asset.ownerId, asset);
    }
  }

  const takenAt =
    input.takenAt ??
    (manifest?.createdAt ? new Date(manifest.createdAt) : undefined);

  return {
    name: input.name,
    takenAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : undefined,
    items,
    assets,
    assetCount: manifest?.counts?.assets ?? assets.size,
  };
}

/**
 * What the restored copy is called in the sidebar.
 *
 * Names what it is first, so it can never be mistaken for the live workspace,
 * then which backup it came from — the only thing that distinguishes one restore
 * from another. The stamp is UTC and machine-ordered on purpose: the server has
 * no idea what timezone the person clicking is in, and a sidebar sorts titles.
 */
export function restoreTitle(archive: RestoreArchive): string {
  return archive.takenAt
    ? `Restored backup — ${stamp(archive.takenAt)}`
    : `Restored backup — ${archive.name}`;
}

/**
 * The head of the restored page: where this came from, and what a restore
 * cannot bring back.
 *
 * Written *before* the walk, so someone watching the page fill up already knows
 * what they are looking at, and so the caveats survive a run that dies half way.
 */
export function restoreIntroBlocks(archive: RestoreArchive): any[] {
  const pages = archive.items.filter((item) => item.object === "page").length;
  const databases = archive.items.filter(
    (item) => item.object === "database",
  ).length;
  const blocks = archive.items.filter((item) => item.object === "block").length;

  return [
    callout(
      "Everything below is a copy, rebuilt from a backup of this workspace. " +
        "Nothing you already had was overwritten, moved or deleted — a restore only ever adds this one page.",
    ),
    heading("The backup"),
    bullet(`Archive: ${archive.name}`),
    ...(archive.takenAt ? [bullet(`Taken: ${stamp(archive.takenAt)}`)] : []),
    bullet(
      `Holds: ${count(pages, "page")}, ${count(databases, "database")}, ${count(blocks, "block")} and ${count(archive.assetCount, "file")}`,
    ),
    heading("What a restore cannot bring back"),
    bullet(
      "Uploaded files. Images, PDFs and attachments are in the archive, but Notion's API only accepts a link to a file, not the bytes. Each one is left as a line naming the file to re-upload.",
    ),
    bullet(
      "Relations, rollups, status columns and unique ids. A relation points at a database that no longer exists, and a status column cannot be created through the API at all. Those columns are dropped.",
    ),
    bullet(
      "Comments, and who changed what. The backup captures content, not history.",
    ),
    bullet(
      "Where a sub-page sat. It comes back under the right page, but after that page's own content rather than in the middle of it.",
    ),
  ];
}

/** The tail of the restored page: what this run did, and what it left behind. */
export function restoreSummaryBlocks(
  report: RestoreReport,
  run: { startedAt: Date; finishedAt: Date },
): any[] {
  const listed = report.notes.slice(0, MAX_LISTED_NOTES);
  const remaining = report.notes.length - listed.length;

  return [
    { type: "divider", divider: {} },
    heading("This restore"),
    bullet(`Run: ${stamp(run.startedAt)} → ${stamp(run.finishedAt)}`),
    bullet(`Created: ${report.summary()}`),
    ...(report.notes.length
      ? [
          heading(`${count(report.notes.length, "thing")} to look at`),
          ...listed.map((note) => bullet(note)),
          ...(remaining ? [bullet(`…and ${remaining} more.`)] : []),
        ]
      : [paragraph("Nothing was left behind.")]),
  ];
}

export class NotionRestore {
  private readonly byId = new Map<string, RestoreItem>();
  private readonly children = new Map<string, RestoreItem[]>();
  /** Pages and databases in the archive, i.e. the denominator of the run. */
  private readonly total: number;
  private done = 0;

  constructor(
    private readonly archive: RestoreArchive,
    private readonly report: RestoreReport,
    private readonly target: RestoreTarget,
  ) {
    this.total = archive.items.filter((item) => item.object !== "block").length;

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

  async *run(): AsyncGenerator<SyncEvent> {
    const startedAt = new Date();

    // A page whose parent is the workspace, or whose parent did not make it
    // into the archive — an integration only ever sees what it was shared.
    const roots = this.archive.items.filter((item) => {
      if (item.object === "block") {
        return false;
      }

      const parentId = parentOf(item);

      return !parentId || !this.byId.has(parentId);
    });

    // Not in a try: if the one page everything hangs off cannot be created
    // (no access to the parent, an expired token) there is nothing to report
    // into and nowhere to put it, so the run fails outright.
    const root = await this.target.createRoot({
      icon: { type: "emoji", emoji: RESTORE_ICON },
      properties: { title: { title: [richText(restoreTitle(this.archive))] } },
      children: restoreIntroBlocks(this.archive),
    });

    yield {
      ...this.progress(
        `Restoring ${count(roots.length, "top-level item")} from ${this.archive.name}.`,
      ),
      url: root.url,
    };

    for (const item of roots) {
      yield* this.restoreItem(item, { type: "page_id", page_id: root.id });
    }

    await this.appendPayloads(
      root.id,
      restoreSummaryBlocks(this.report, { startedAt, finishedAt: new Date() }),
    );

    // Nothing created out of an archive that had something to create is one
    // cause, not a run of bad luck — a revoked token, a workspace the
    // integration lost access to. Reported as a failure, after the page has
    // been given the notes explaining it.
    if (
      roots.length &&
      !this.report.created.pages &&
      !this.report.created.databases
    ) {
      throw new Error(
        `Nothing could be restored. ${this.report.notes[0] ?? ""}`.trim(),
      );
    }

    yield {
      ...this.progress(`Restored ${this.report.summary()}.`),
      url: root.url,
    };
  }

  private async *restoreItem(
    item: RestoreItem,
    parent: any,
  ): AsyncGenerator<SyncEvent> {
    try {
      if (item.object === "database") {
        yield* this.restoreDatabase(item, parent);
      } else {
        yield* this.restorePage(item, parent);
      }
    } catch (error) {
      // One unrestorable page must not cost the user the rest of the restore.
      this.report.note(`${describe(item)} failed: ${reason(error)}`);

      yield this.progress(`Skipped ${describe(item)}: ${reason(error)}`);
    }
  }

  private async *restorePage(
    page: RestoreItem,
    parent: any,
  ): AsyncGenerator<SyncEvent> {
    const properties =
      parent.type === "database_id"
        ? this.rowProperties(page)
        : // A page's own title, keyed the way every other property is. The bare
          // `{ title: [...] }` shorthand this used to send is not what the API
          // documents, nor what the SDK's own types accept.
          { title: { title: strip(titleOf(page)) } };

    const created = await this.target.createPage({
      parent,
      properties,
      ...this.decoration(page),
    });

    this.report.created.pages++;
    this.done++;

    yield this.progress(`Restored ${describe(page)}.`);

    const contents = this.children.get(page.id) ?? [];

    try {
      await this.appendArchivedBlocks(
        created.id,
        contents.filter((child) => child.object === "block"),
      );
    } catch (error) {
      // The page exists; only its content did not land. Noting it here rather
      // than throwing keeps its sub-pages, which are separate creates.
      this.report.note(`${describe(page)}: content missing — ${reason(error)}`);
    }

    // Sub-pages and sub-databases are their own archived entries, so they are
    // rebuilt here rather than as blocks of this page.
    for (const child of contents) {
      if (child.object !== "block") {
        yield* this.restoreItem(child, {
          type: "page_id",
          page_id: created.id,
        });
      }
    }
  }

  private async *restoreDatabase(
    database: RestoreItem,
    parent: any,
  ): AsyncGenerator<SyncEvent> {
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

    const created = await this.target.createDatabase({
      parent,
      title: strip(database.title ?? []),
      ...(database.description
        ? { description: strip(database.description) }
        : {}),
      properties,
      ...this.decoration(database),
    });

    this.report.created.databases++;
    this.done++;

    yield this.progress(`Restored ${describe(database)}.`);

    for (const row of this.children.get(database.id) ?? []) {
      yield* this.restoreItem(row, {
        type: "database_id",
        database_id: created.id,
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
  private async appendArchivedBlocks(
    parentId: string,
    blocks: RestoreItem[],
  ): Promise<void> {
    const payloads: any[] = [];
    const deferred: (RestoreItem[] | undefined)[] = [];

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

    const created = await this.appendPayloads(parentId, payloads);

    this.report.created.blocks += payloads.length;

    for (const [index, id] of created.entries()) {
      const grandchildren = deferred[index];

      if (id && grandchildren?.length) {
        await this.appendArchivedBlocks(id, grandchildren);
      }
    }
  }

  /** Send ready-made block payloads, in the batches the API accepts. */
  private async appendPayloads(
    parentId: string,
    payloads: any[],
  ): Promise<string[]> {
    const ids: string[] = [];

    for (let start = 0; start < payloads.length; start += APPEND_LIMIT) {
      ids.push(
        ...(await this.target.appendBlocks(
          parentId,
          payloads.slice(start, start + APPEND_LIMIT),
        )),
      );
    }

    return ids;
  }

  /** One block as the API wants it, or undefined if it cannot be recreated. */
  private blockPayload(block: RestoreItem): any {
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

      this.report.note(
        `Re-upload ${where} — its ${type} block is a placeholder`,
      );

      return paragraph(`[restore: re-upload ${where}]`);
    }

    const payload: any = { type, [type]: strip(body ?? {}) };

    if (INLINE_CHILDREN.has(type)) {
      const inline = (this.children.get(block.id) ?? [])
        .map((child) => this.blockPayload(child))
        .filter(Boolean);

      if (inline.length) {
        payload[type].children = inline;
        // Counted here because they never pass through `appendArchivedBlocks`.
        this.report.created.blocks += inline.length;
      }
    }

    return payload;
  }

  /** Row values, minus the ones Notion computes and the ones we dropped. */
  private rowProperties(page: RestoreItem): Record<string, any> {
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
  private decoration(item: RestoreItem): Record<string, any> {
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

  private progress(message: string): SyncEvent {
    return { message, current: this.done, total: this.total };
  }
}

function parentOf(item: RestoreItem): string | undefined {
  const parent = item.parent;

  return parent?.page_id ?? parent?.database_id ?? parent?.block_id;
}

/** Drop everything Notion assigns, recursively. */
export function strip<T>(value: T): T {
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

function titleOf(page: RestoreItem): any[] {
  const property = Object.values(page.properties ?? {}).find(
    (value: any) => value?.type === "title",
  );

  return (property as any)?.title ?? [];
}

function describe(item: RestoreItem): string {
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

/** "1 page", "3 pages", "no pages". */
function count(value: number, noun: string): string {
  return `${value || "no"} ${plural(value, noun)}`;
}

/** `2026-08-09 14:31 UTC` — see `restoreTitle` for why it is not local time. */
function stamp(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function richText(content: string): any {
  return {
    type: "text",
    // A Notion error message can be longer than one rich-text run is allowed to
    // be, and it arrives here as the text of a note.
    text: { content: content.slice(0, TEXT_LIMIT) },
  };
}

function paragraph(content: string): any {
  return { type: "paragraph", paragraph: { rich_text: [richText(content)] } };
}

function heading(content: string): any {
  return { type: "heading_2", heading_2: { rich_text: [richText(content)] } };
}

function bullet(content: string): any {
  return {
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: [richText(content)] },
  };
}

function callout(content: string): any {
  return {
    type: "callout",
    callout: {
      rich_text: [richText(content)],
      icon: { type: "emoji", emoji: RESTORE_ICON },
    },
  };
}
