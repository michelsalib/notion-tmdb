import { describe, expect, test } from "bun:test";
import type { SyncEvent } from "../types.js";
import {
  NotionRestore,
  parseArchive,
  type RestoreArchive,
  type RestoreItem,
  RestoreReport,
  type RestoreTarget,
  restoreTitle,
  strip,
} from "./notionRestore.js";

interface Call {
  kind: "root" | "page" | "database" | "blocks";
  parent?: string;
  body?: any;
  children?: any[];
}

/** A target that records what it was asked to create, and can be made to fail. */
function recordingTarget(options?: { failTitles?: string[] }): {
  calls: Call[];
  target: RestoreTarget;
} {
  const calls: Call[] = [];
  let created = 0;

  const create = (kind: "root" | "page" | "database") => async (body: any) => {
    const title = titleOf(body);

    if (options?.failTitles?.includes(title)) {
      throw new Error(`Notion refused "${title}"`);
    }

    calls.push({ kind, parent: parentOf(body), body });
    created++;

    return {
      id: `new-${kind}-${created}`,
      url: `https://notion.so/new-${kind}-${created}`,
    };
  };

  return {
    calls,
    target: {
      // Where the root goes is `NotionClient`'s decision (the top level of the
      // workspace), so the walk hands over a body with no parent of its own.
      createRoot: create("root"),
      createPage: create("page"),
      createDatabase: create("database"),
      appendBlocks: async (parentId, children) => {
        calls.push({ kind: "blocks", parent: parentId, children });

        return children.map((_, index) => `block-${parentId}-${index}`);
      },
    },
  };
}

function titleOf(body: any): string {
  const rich = body.properties?.title?.title ?? body.title ?? [];

  return rich.map((part: any) => part.text?.content ?? "").join("");
}

function parentOf(body: any): string | undefined {
  return body.parent?.page_id ?? body.parent?.database_id;
}

function archive(
  items: RestoreItem[],
  extra?: Partial<RestoreArchive>,
): RestoreArchive {
  return {
    name: "2026-08-09T14-31-07Z.zip",
    takenAt: new Date("2026-08-09T14:31:07Z"),
    items,
    assets: new Map(),
    assetCount: 0,
    ...extra,
  };
}

function page(
  id: string,
  title: string,
  parent?: RestoreItem["parent"],
): RestoreItem {
  return {
    object: "page",
    id,
    ...(parent ? { parent } : {}),
    properties: {
      title: {
        type: "title",
        title: [{ plain_text: title, text: { content: title } }],
      },
    },
  };
}

function block(id: string, parentId: string, type = "paragraph"): RestoreItem {
  return {
    object: "block",
    id,
    type,
    parent: { type: "page_id", page_id: parentId },
    [type]: { rich_text: [{ plain_text: "hi", text: { content: "hi" } }] },
  };
}

async function collect(
  generator: AsyncGenerator<SyncEvent>,
): Promise<SyncEvent[]> {
  const events: SyncEvent[] = [];

  for await (const event of generator) {
    events.push(event);
  }

  return events;
}

async function run(
  items: RestoreItem[],
  options?: { extra?: Partial<RestoreArchive>; failTitles?: string[] },
) {
  const report = new RestoreReport();
  const { calls, target } = recordingTarget({
    failTitles: options?.failTitles,
  });
  const restore = new NotionRestore(
    archive(items, options?.extra),
    report,
    target,
  );
  const events = await collect(restore.run());

  return { report, calls, events };
}

describe("restoreTitle", () => {
  test("says what it is, then which backup it came from", () => {
    expect(restoreTitle(archive([]))).toBe(
      "Restored backup — 2026-08-09 14:31 UTC",
    );
  });

  test("falls back to the archive's own name when it carries no date", () => {
    expect(restoreTitle(archive([], { takenAt: undefined }))).toBe(
      "Restored backup — 2026-08-09T14-31-07Z.zip",
    );
  });
});

describe("the restored page", () => {
  test("is one new page, and everything hangs off it", async () => {
    const { calls } = await run([page("page-1", "Recipes")]);
    const root = calls.find((call) => call.kind === "root");
    const restored = calls.find((call) => call.kind === "page");

    expect(titleOf(root?.body)).toBe("Restored backup — 2026-08-09 14:31 UTC");
    expect(root?.body.icon).toEqual({ type: "emoji", emoji: "♻️" });
    // Where it goes is the target's business — the app puts it at the top level
    // of the workspace — so the walk sends no parent of its own.
    expect(root?.body.parent).toBeUndefined();
    // The archived page goes inside the new page, never beside it: a restore
    // adds exactly one page to wherever it landed.
    expect(restored?.parent).toBe("new-root-1");
    expect(calls.filter((call) => call.kind === "root")).toHaveLength(1);
  });

  test("explains itself before the walk starts", async () => {
    const { calls } = await run([]);
    const intro = calls[0]?.body.children.map(
      (b: any) => b[b.type].rich_text[0].text.content,
    );

    expect(intro[0]).toContain("Nothing you already had was overwritten");
    expect(intro.join("\n")).toContain("Archive: 2026-08-09T14-31-07Z.zip");
    expect(intro.join("\n")).toContain("Taken: 2026-08-09 14:31 UTC");
    expect(intro.join("\n")).toContain("Uploaded files");
    expect(intro.join("\n")).toContain("Relations, rollups, status columns");
  });

  test("is given the run's own report once the walk is done", async () => {
    const { calls } = await run([
      page("page-1", "Recipes"),
      { ...block("block-1", "page-1"), type: "synced_block", synced_block: {} },
    ]);
    const summary = calls
      .filter((call) => call.kind === "blocks")
      .at(-1)
      ?.children?.map(
        (b: any) => b[b.type]?.rich_text?.[0]?.text?.content ?? "",
      )
      .join("\n");

    expect(summary).toContain("Created: 1 page");
    expect(summary).toContain("Skipped a synced_block block");
    expect(summary).toContain("1 thing to look at");
  });

  test("says so when there was nothing to leave behind", async () => {
    const { calls } = await run([page("page-1", "Recipes")]);
    const summary = calls
      .at(-1)
      ?.children?.map(
        (b: any) => b[b.type]?.rich_text?.[0]?.text?.content ?? "",
      );

    expect(summary?.join("\n")).toContain("Nothing was left behind.");
  });
});

describe("walking the archive", () => {
  test("nests a sub-page under the page it belonged to", async () => {
    const { calls, report } = await run([
      page("page-1", "Recipes"),
      page("page-2", "Bread", { type: "page_id", page_id: "page-1" }),
    ]);
    const pages = calls.filter((call) => call.kind === "page");

    expect(titleOf(pages[0]?.body)).toBe("Recipes");
    expect(titleOf(pages[1]?.body)).toBe("Bread");
    // "Recipes" came back as `new-page-2`, so "Bread" is created inside that.
    expect(pages[1]?.parent).toBe("new-page-2");
    expect(report.created.pages).toBe(2);
  });

  test("restores a page under a parent that is missing from the archive", async () => {
    // An integration only sees what it was shared, so a page's parent is very
    // often not in the archive at all. Those are top-level items, not orphans.
    const { report } = await run([
      page("page-1", "Shared page", { type: "page_id", page_id: "never-seen" }),
    ]);

    expect(report.created.pages).toBe(1);
  });

  test("keeps a page's own title in the shape the API documents", async () => {
    const { calls } = await run([page("page-1", "Recipes")]);
    const restored = calls.find((call) => call.kind === "page");

    // Nested, not the bare `{ title: [...] }` array: that shorthand is neither
    // what the API documents nor what the SDK's types accept. And `plain_text`
    // is Notion's own derived copy, which some payloads reject.
    expect(restored?.body.properties).toEqual({
      title: { title: [{ text: { content: "Recipes" } }] },
    });
  });

  test("rebuilds a database with its rows, dropping what cannot be created", async () => {
    const { calls, report } = await run([
      {
        object: "database",
        id: "db-1",
        title: [{ plain_text: "Films", text: { content: "Films" } }],
        properties: {
          Name: { type: "title", title: {} },
          Status: { type: "status", status: {} },
          Cast: { type: "relation", relation: { database_id: "gone" } },
          Rating: { type: "number", number: { format: "number" } },
        },
      },
      {
        object: "page",
        id: "row-1",
        parent: { type: "database_id", database_id: "db-1" },
        properties: {
          Name: { type: "title", title: [{ text: { content: "Dune" } }] },
          Rating: { type: "number", number: 8 },
          Watched: { type: "formula", formula: { type: "number", number: 1 } },
        },
      },
    ]);

    const database = calls.find((call) => call.kind === "database");
    expect(Object.keys(database?.body.properties)).toEqual(["Name", "Rating"]);
    expect(report.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('dropped the "Status" column (status'),
        expect.stringContaining('dropped the "Cast" column (relation'),
      ]),
    );

    const row = calls.find((call) => call.kind === "page");
    expect(row?.parent).toBe("new-database-2");
    // A formula is computed by Notion; sending one back is rejected.
    expect(Object.keys(row?.body.properties)).toEqual(["Name", "Rating"]);
  });

  test("skips a row that Notion refuses and carries on with the next", async () => {
    const { report, calls } = await run(
      [
        page("page-1", "Good"),
        page("page-2", "Bad"),
        page("page-3", "Also good"),
      ],
      { failTitles: ["Bad"] },
    );

    expect(report.created.pages).toBe(2);
    expect(report.notes).toEqual(['page "Bad" failed: Notion refused "Bad"']);
    expect(
      calls.filter((call) => call.kind === "page").map((c) => titleOf(c.body)),
    ).toEqual(["Good", "Also good"]);
  });

  test("fails the run when the archive had items and none came back", async () => {
    // One cause, not bad luck: a revoked token looks exactly like this, and
    // reporting it as a finished restore of nothing is worse than an error.
    const report = new RestoreReport();
    const { calls, target } = recordingTarget({ failTitles: ["Recipes"] });
    const restore = new NotionRestore(
      archive([page("page-1", "Recipes")]),
      report,
      target,
    );

    await expect(collect(restore.run())).rejects.toThrow(
      "Nothing could be restored",
    );
    // The page still got the notes explaining why.
    expect(calls.at(-1)?.kind).toBe("blocks");
  });
});

describe("blocks", () => {
  test("appends in the batches the API accepts", async () => {
    const blocks = Array.from({ length: 101 }, (_, index) =>
      block(`block-${index}`, "page-1"),
    );
    const { calls, report } = await run([page("page-1", "Long"), ...blocks]);
    const appends = calls.filter(
      (call) => call.kind === "blocks" && call.parent === "new-page-2",
    );

    expect(appends.map((call) => call.children?.length)).toEqual([100, 1]);
    expect(report.created.blocks).toBe(101);
  });

  test("builds a column list in one request, with its columns inside", async () => {
    // A `column_list` with no columns is rejected, so the subtree cannot be
    // appended level by level like everything else.
    const { calls } = await run([
      page("page-1", "Layout"),
      { ...block("cols", "page-1", "column_list"), column_list: {} },
      {
        object: "block",
        id: "col-1",
        type: "column",
        parent: { type: "block_id", block_id: "cols" },
        column: {},
      },
    ]);
    const [append] = calls.filter((call) => call.kind === "blocks");

    expect(append?.children?.[0].column_list.children).toHaveLength(1);
    expect(
      calls.some(
        (call) => call.kind === "blocks" && call.parent?.includes("col"),
      ),
    ).toBe(false);
  });

  test("replaces an uploaded file with a line naming it", async () => {
    const { calls, report } = await run(
      [
        page("page-1", "Notes"),
        {
          ...block("file-1", "page-1", "image"),
          image: { type: "file", file: { url: "https://expired" } },
        },
      ],
      {
        extra: {
          assets: new Map([
            ["file-1", { file: "assets/image_file-1.png", name: "Plan.png" }],
          ]),
        },
      },
    );
    const [append] = calls.filter((call) => call.kind === "blocks");

    expect(append?.children?.[0].paragraph.rich_text[0].text.content).toBe(
      "[restore: re-upload Plan.png]",
    );
    expect(report.notes).toEqual([
      "Re-upload Plan.png — its image block is a placeholder",
    ]);
  });

  test("says nothing about a child page block, which is restored as a page", async () => {
    const { report } = await run([
      page("page-1", "Recipes"),
      {
        ...block("cp", "page-1", "child_page"),
        child_page: { title: "Bread" },
      },
    ]);

    expect(report.notes).toEqual([]);
    expect(report.created.blocks).toBe(0);
  });
});

describe("progress", () => {
  test("counts pages and databases against the archive, and links the new page", async () => {
    const { events } = await run([
      page("page-1", "One"),
      page("page-2", "Two"),
      block("block-1", "page-1"),
    ]);

    expect(events[0]).toMatchObject({ current: 0, total: 2 });
    expect(events[0]?.url).toBe("https://notion.so/new-root-1");
    expect(events.at(-1)).toMatchObject({ current: 2, total: 2 });
    expect(events.at(-1)?.message).toContain("2 pages");
    expect(events.at(-1)?.url).toBe("https://notion.so/new-root-1");
  });
});

describe("strip", () => {
  test("keeps a url, which is content wherever it appears below a page", () => {
    // A bookmark's target, an embed's source, an external image, a url column.
    // It only looks like server metadata because pages have one too.
    expect(
      strip<any>({
        id: "block-1",
        object: "block",
        last_edited_time: "2026-01-01T00:00:00Z",
        bookmark: { url: "https://example.com", caption: [] },
      }),
    ).toEqual({ bookmark: { url: "https://example.com", caption: [] } });
  });

  test("drops what Notion assigns, however deep", () => {
    expect(
      strip<any>({
        rich_text: [
          { type: "text", plain_text: "hi", text: { content: "hi" } },
        ],
      }),
    ).toEqual({ rich_text: [{ type: "text", text: { content: "hi" } }] });
  });
});

describe("parseArchive", () => {
  test("reads the backup's own date out of the manifest", () => {
    const parsed = parseArchive({
      name: "backup.zip",
      data: "[]",
      manifest: JSON.stringify({
        version: 2,
        createdAt: "2026-08-09T14:31:07.482Z",
        counts: { items: 0, assets: 3, skipped: 0, pages: 0 },
        assets: [{ file: "assets/image_b1.png", ownerId: "b1" }],
      }),
    });

    expect(parsed.takenAt?.toISOString()).toBe("2026-08-09T14:31:07.482Z");
    expect(parsed.assetCount).toBe(3);
    expect(parsed.assets.get("b1")?.file).toBe("assets/image_b1.png");
  });

  test("opens an archive written before the manifest existed", () => {
    const parsed = parseArchive({
      name: "user-1.zip",
      data: JSON.stringify([page("page-1", "Old")]),
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.takenAt).toBeUndefined();
    expect(parsed.assetCount).toBe(0);
  });

  test("refuses something that is not an archive's data", () => {
    expect(() =>
      parseArchive({ name: "x.zip", data: '{"error":"nope"}' }),
    ).toThrow("does not hold a list");
  });
});
