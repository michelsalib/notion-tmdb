import { describe, expect, test } from "bun:test";
import type { BackupAsset } from "./backupArchive.js";
import { propertyText, relative, renderMarkdown } from "./backupMarkdown.js";

/** Rich text as the API returns it. */
function text(content: string, annotations?: any, link?: string): any {
  return {
    type: "text",
    text: { content, ...(link ? { link: { url: link } } : {}) },
    plain_text: content,
    ...(annotations ? { annotations } : {}),
    ...(link ? { href: link } : {}),
  };
}

function page(id: string, title: string, parent?: string, extra?: any): any {
  return {
    object: "page",
    id,
    parent: parent
      ? { type: "page_id", page_id: parent }
      : { type: "workspace", workspace: true },
    properties: { Name: { type: "title", title: [text(title)] } },
    ...extra,
  };
}

function block(id: string, type: string, body: any, parent: string): any {
  return {
    object: "block",
    id,
    parent: { type: "page_id", page_id: parent },
    type,
    [type]: body,
  };
}

/** Every rendered file, keyed by path. */
function render(items: any[], assets: BackupAsset[] = []): Map<string, string> {
  return new Map(
    [...renderMarkdown(items, assets)].map((file) => [file.path, file.content]),
  );
}

/** The one page a single-page fixture produces. */
function only(items: any[], assets: BackupAsset[] = []): string {
  const files = render(items, assets);

  expect(files.size).toBe(1);

  return [...files.values()][0] as string;
}

describe("relative", () => {
  test.each([
    ["markdown/a.md", "markdown/b.md", "b.md"],
    ["markdown/a.md", "assets/i.png", "../assets/i.png"],
    ["markdown/x/y/a.md", "assets/i.png", "../../../assets/i.png"],
    ["markdown/x/a.md", "markdown/x/y/b.md", "y/b.md"],
    ["markdown/x/y/a.md", "markdown/x/b.md", "../b.md"],
  ])("from %s to %s", (from, to, expected) => {
    expect(relative(from, to)).toBe(expected);
  });
});

describe("page files", () => {
  test("mirrors the page tree, a folder beside each parent", () => {
    const files = render([
      page("page-root", "Journal"),
      page("page-kid", "Sub page", "page-root"),
      page("page-grandkid", "Deeper", "page-kid"),
    ]);

    expect([...files.keys()]).toEqual([
      "markdown/Journal pageroot.md",
      "markdown/Journal pageroot/Sub page pagekid.md",
      "markdown/Journal pageroot/Sub page pagekid/Deeper pagegran.md",
    ]);
  });

  test("attaches a page whose parent was never shared to the top level", () => {
    const files = render([page("page-1", "Orphan", "page-nobody-shared")]);

    expect([...files.keys()]).toEqual(["markdown/Orphan page1.md"]);
  });

  test("opens with front matter and the title", () => {
    const content = only([
      page("page-1", "Journal", undefined, {
        created_time: "2026-01-01T00:00:00.000Z",
        last_edited_time: "2026-02-02T00:00:00.000Z",
        url: "https://notion.so/page-1",
      }),
    ]);

    expect(content).toStartWith(
      [
        "---",
        "notion_id: page-1",
        "object: page",
        "created: 2026-01-01T00:00:00.000Z",
        "edited: 2026-02-02T00:00:00.000Z",
        "notion_url: https://notion.so/page-1",
        "---",
        "",
        "# Journal",
      ].join("\n"),
    );
  });

  test.each([
    ["a slash", "Q1/Q2 plans", "markdown/Q1 Q2 plans page1.md"],
    ["a colon", "Notes: draft", "markdown/Notes draft page1.md"],
    ["a leading dot", ".hidden", "markdown/hidden page1.md"],
    ["no title at all", "", "markdown/Untitled page1.md"],
  ])("keeps %s out of the filename", (_label, title, expected) => {
    const files = render([page("page-1", title)]);

    expect([...files.keys()]).toEqual([expected]);
  });

  test("keeps two pages of the same name apart", () => {
    const files = render([page("page-1", "Notes"), page("page-2", "Notes")]);

    expect([...files.keys()]).toEqual([
      "markdown/Notes page1.md",
      "markdown/Notes page2.md",
    ]);
  });
});

describe("blocks", () => {
  test("renders headings one level down, leaving H1 to the title", () => {
    const content = only([
      page("page-1", "P"),
      block("b1", "heading_1", { rich_text: [text("Top")] }, "page-1"),
      block("b2", "heading_3", { rich_text: [text("Deep")] }, "page-1"),
    ]);

    expect(content).toContain("## Top");
    expect(content).toContain("#### Deep");
  });

  test("numbers each run of list items from one", () => {
    const content = only([
      page("page-1", "P"),
      block("b1", "numbered_list_item", { rich_text: [text("one")] }, "page-1"),
      block("b2", "numbered_list_item", { rich_text: [text("two")] }, "page-1"),
      block("b3", "paragraph", { rich_text: [text("break")] }, "page-1"),
      block(
        "b4",
        "numbered_list_item",
        { rich_text: [text("again")] },
        "page-1",
      ),
    ]);

    expect(content).toContain("1. one\n2. two");
    expect(content).toContain("1. again");
  });

  test("indents a nested list under its parent item", () => {
    const parent = block(
      "b1",
      "bulleted_list_item",
      { rich_text: [text("outer")] },
      "page-1",
    );
    parent.has_children = true;

    const child = block(
      "b2",
      "bulleted_list_item",
      { rich_text: [text("inner")] },
      "page-1",
    );
    child.parent = { type: "block_id", block_id: "b1" };

    expect(only([page("page-1", "P"), parent, child])).toContain(
      "- outer\n  - inner",
    );
  });

  test("writes a to-do as a task list", () => {
    const content = only([
      page("page-1", "P"),
      block(
        "b1",
        "to_do",
        { rich_text: [text("done")], checked: true },
        "page-1",
      ),
      block(
        "b2",
        "to_do",
        { rich_text: [text("todo")], checked: false },
        "page-1",
      ),
    ]);

    expect(content).toContain("- [x] done");
    expect(content).toContain("- [ ] todo");
  });

  test("keeps a toggle collapsible", () => {
    const toggle = block(
      "b1",
      "toggle",
      { rich_text: [text("Details")] },
      "page-1",
    );
    toggle.has_children = true;

    const inner = block(
      "b2",
      "paragraph",
      { rich_text: [text("hidden")] },
      "page-1",
    );
    inner.parent = { type: "block_id", block_id: "b1" };

    const content = only([page("page-1", "P"), toggle, inner]);

    expect(content).toContain("<details>\n<summary>Details</summary>");
    expect(content).toContain("hidden");
    expect(content).toContain("</details>");
  });

  test("carries the quote marker onto a quote's children", () => {
    const quote = block("b1", "quote", { rich_text: [text("said")] }, "page-1");
    quote.has_children = true;

    const inner = block(
      "b2",
      "paragraph",
      { rich_text: [text("more")] },
      "page-1",
    );
    inner.parent = { type: "block_id", block_id: "b1" };

    expect(only([page("page-1", "P"), quote, inner])).toContain("> said");
    expect(only([page("page-1", "P"), quote, inner])).toContain("> more");
  });

  test("puts a callout's emoji in front of it", () => {
    expect(
      only([
        page("page-1", "P"),
        block(
          "b1",
          "callout",
          { rich_text: [text("Careful")], icon: { type: "emoji", emoji: "⚠️" } },
          "page-1",
        ),
      ]),
    ).toContain("> ⚠️ Careful");
  });

  test("fences code with its language", () => {
    expect(
      only([
        page("page-1", "P"),
        block(
          "b1",
          "code",
          { rich_text: [text("const a = 1;")], language: "typescript" },
          "page-1",
        ),
      ]),
    ).toContain("```typescript\nconst a = 1;\n```");
  });

  test("gives a table the header rule Markdown needs", () => {
    const table = block("b1", "table", { table_width: 2 }, "page-1");
    table.has_children = true;

    const rows = ["Name", "Alien"].map((first, index) => {
      const row = block(
        `r${index}`,
        "table_row",
        { cells: [[text(first)], [text(index ? "1979" : "Year")]] },
        "page-1",
      );
      row.parent = { type: "block_id", block_id: "b1" };

      return row;
    });

    expect(only([page("page-1", "P"), table, ...rows])).toContain(
      ["| Name | Year |", "| --- | --- |", "| Alien | 1979 |"].join("\n"),
    );
  });

  test("escapes a pipe inside a cell", () => {
    const table = block("b1", "table", {}, "page-1");
    table.has_children = true;

    const row = block("r0", "table_row", { cells: [[text("a|b")]] }, "page-1");
    row.parent = { type: "block_id", block_id: "b1" };

    expect(only([page("page-1", "P"), table, row])).toContain("| a\\|b |");
  });

  test("flattens columns, which Markdown has no notion of", () => {
    const list = block("b1", "column_list", {}, "page-1");
    list.has_children = true;

    const column = block("b2", "column", {}, "page-1");
    column.parent = { type: "block_id", block_id: "b1" };
    column.has_children = true;

    const inner = block(
      "b3",
      "paragraph",
      { rich_text: [text("Left")] },
      "page-1",
    );
    inner.parent = { type: "block_id", block_id: "b2" };

    expect(only([page("page-1", "P"), list, column, inner])).toContain("Left");
  });

  test("leaves a comment where a block has no Markdown form", () => {
    expect(
      only([
        page("page-1", "P"),
        block("b1", "ai_block", { rich_text: [text("summary")] }, "page-1"),
      ]),
    ).toContain("<!-- ai_block: summary -->");
  });

  test("drops page chrome that says nothing", () => {
    expect(
      only([page("page-1", "P"), block("b1", "breadcrumb", {}, "page-1")]),
    ).not.toContain("breadcrumb");
  });
});

describe("rich text", () => {
  test.each([
    [{ bold: true }, "**word**"],
    [{ italic: true }, "*word*"],
    [{ strikethrough: true }, "~~word~~"],
    [{ code: true }, "`word`"],
    [{ underline: true }, "<u>word</u>"],
    [{ bold: true, italic: true }, "***word***"],
  ])("renders %o", (annotations, expected) => {
    expect(
      only([
        page("page-1", "P"),
        block(
          "b1",
          "paragraph",
          { rich_text: [text("word", annotations)] },
          "page-1",
        ),
      ]),
    ).toContain(expected);
  });

  test("keeps a trailing space outside the emphasis", () => {
    // `**bold ** next` is not bold in any renderer — the delimiter has to
    // touch the word.
    const content = only([
      page("page-1", "P"),
      block(
        "b1",
        "paragraph",
        { rich_text: [text("bold ", { bold: true }), text("next")] },
        "page-1",
      ),
    ]);

    expect(content).toContain("**bold** next");
  });

  test("renders a link", () => {
    expect(
      only([
        page("page-1", "P"),
        block(
          "b1",
          "paragraph",
          { rich_text: [text("TMDB", undefined, "https://themoviedb.org")] },
          "page-1",
        ),
      ]),
    ).toContain("[TMDB](https://themoviedb.org)");
  });

  test("renders an inline equation", () => {
    expect(
      only([
        page("page-1", "P"),
        block(
          "b1",
          "paragraph",
          {
            rich_text: [{ type: "equation", equation: { expression: "x^2" } }],
          },
          "page-1",
        ),
      ]),
    ).toContain("$x^2$");
  });

  test("turns a mention of an archived page into a link to its file", () => {
    const files = render([
      page("page-1", "Journal"),
      page("page-2", "Target"),
      block(
        "b1",
        "paragraph",
        {
          rich_text: [
            {
              type: "mention",
              mention: { type: "page", page: { id: "page-2" } },
              plain_text: "Target",
            },
          ],
        },
        "page-1",
      ),
    ]);

    expect(files.get("markdown/Journal page1.md")).toContain(
      "[Target](Target%20page2.md)",
    );
  });

  test("leaves a mention of a page outside the archive as text", () => {
    expect(
      only([
        page("page-1", "P"),
        block(
          "b1",
          "paragraph",
          {
            rich_text: [
              {
                type: "mention",
                mention: { type: "page", page: { id: "page-elsewhere" } },
                plain_text: "Elsewhere",
              },
            ],
          },
          "page-1",
        ),
      ]),
    ).toContain("Elsewhere");
  });
});

describe("assets", () => {
  const archived: BackupAsset[] = [
    {
      file: "assets/image_b1.png",
      kind: "image",
      ownerId: "b1",
      name: "diagram.png",
    },
  ];

  test("points an image at the copy inside the archive", () => {
    const content = only(
      [
        page("page-1", "P"),
        block(
          "b1",
          "image",
          { type: "file", file: { url: "https://s3/dead" } },
          "page-1",
        ),
      ],
      archived,
    );

    expect(content).toContain("![diagram.png](../assets/image_b1.png)");
  });

  test("reaches back out of a nested folder", () => {
    const files = render(
      [
        page("page-1", "Journal"),
        page("page-2", "Sub", "page-1"),
        {
          ...block("b1", "image", { type: "file", file: {} }, "page-2"),
          parent: { type: "page_id", page_id: "page-2" },
        },
      ],
      archived,
    );

    expect(files.get("markdown/Journal page1/Sub page2.md")).toContain(
      "![diagram.png](../../assets/image_b1.png)",
    );
  });

  test("keeps an external image's own URL", () => {
    expect(
      only([
        page("page-1", "P"),
        block(
          "b1",
          "image",
          { type: "external", external: { url: "https://example.com/p.png" } },
          "page-1",
        ),
      ]),
    ).toContain("![image](https://example.com/p.png)");
  });

  test("links a file rather than embedding it", () => {
    const content = only(
      [
        page("page-1", "P"),
        block("b1", "file", { type: "file", file: {} }, "page-1"),
      ],
      archived,
    );

    expect(content).toContain("[diagram.png](../assets/image_b1.png)");
    expect(content).not.toContain("![diagram.png]");
  });
});

describe("databases", () => {
  const database: any = {
    object: "database",
    id: "db-1",
    parent: { type: "workspace", workspace: true },
    title: [text("Films")],
    properties: {
      Name: { type: "title", title: {} },
      Year: { type: "number", number: {} },
    },
  };

  const row: any = {
    object: "page",
    id: "row-1",
    parent: { type: "database_id", database_id: "db-1" },
    properties: {
      Name: { type: "title", title: [text("Alien")] },
      Year: { type: "number", number: 1979 },
    },
  };

  test("renders the database as a table of linked rows", () => {
    const files = render([database, row]);
    const index = files.get("markdown/Films db1.md") as string;

    expect(index).toContain("1 row.");
    expect(index).toContain("| Name | Year |");
    expect(index).toContain("| [Alien](Films%20db1/Alien%20row1.md) | 1979 |");
  });

  test("gives each row its own file under the database", () => {
    expect([...render([database, row]).keys()]).toEqual([
      "markdown/Films db1.md",
      "markdown/Films db1/Alien row1.md",
    ]);
  });

  test("lists a row's other properties above its content", () => {
    const content = render([database, row]).get(
      "markdown/Films db1/Alien row1.md",
    ) as string;

    expect(content).toContain("# Alien");
    expect(content).toContain("**Year:** 1979");
    // The title is the heading; repeating it as a property is noise.
    expect(content).not.toContain("**Name:**");
  });
});

describe("sub-page links", () => {
  test("does not list a sub-page twice when the body already links it", () => {
    const child = block("page-2", "child_page", { title: "Sub" }, "page-1");
    const files = render([
      page("page-1", "Journal"),
      child,
      page("page-2", "Sub", "page-1"),
    ]);
    const content = files.get("markdown/Journal page1.md") as string;

    expect(content).toContain("[Sub](Journal%20page1/Sub%20page2.md)");
    expect(content).not.toContain("## Sub-pages");
  });

  test("still reaches a sub-page whose parent's blocks were unreadable", () => {
    const files = render([
      page("page-1", "Journal"),
      page("page-2", "Sub", "page-1"),
    ]);
    const content = files.get("markdown/Journal page1.md") as string;

    expect(content).toContain("## Sub-pages");
    expect(content).toContain("[Sub](Journal%20page1/Sub%20page2.md)");
  });
});

describe("propertyText", () => {
  test.each([
    ["rich_text", { type: "rich_text", rich_text: [text("note")] }, "note"],
    ["number", { type: "number", number: 7 }, "7"],
    ["number zero", { type: "number", number: 0 }, "0"],
    ["empty number", { type: "number", number: null }, ""],
    ["select", { type: "select", select: { name: "Sci-fi" } }, "Sci-fi"],
    [
      "multi_select",
      { type: "multi_select", multi_select: [{ name: "a" }, { name: "b" }] },
      "a, b",
    ],
    ["status", { type: "status", status: { name: "Done" } }, "Done"],
    ["date", { type: "date", date: { start: "2026-01-01" } }, "2026-01-01"],
    [
      "date range",
      { type: "date", date: { start: "2026-01-01", end: "2026-01-05" } },
      "2026-01-01 → 2026-01-05",
    ],
    ["checked", { type: "checkbox", checkbox: true }, "☑"],
    ["unchecked", { type: "checkbox", checkbox: false }, "☐"],
    ["url", { type: "url", url: "https://a.b" }, "https://a.b"],
    ["people", { type: "people", people: [{ name: "Ada" }] }, "Ada"],
    ["files", { type: "files", files: [{ name: "p.jpg" }] }, "p.jpg"],
    [
      "relation",
      { type: "relation", relation: [{ id: "x" }, { id: "y" }] },
      "2 linked",
    ],
    [
      "formula",
      { type: "formula", formula: { type: "number", number: 42 } },
      "42",
    ],
    ["rollup", { type: "rollup", rollup: { type: "number", number: 3 } }, "3"],
    [
      "unique_id",
      { type: "unique_id", unique_id: { prefix: "F", number: 3 } },
      "F-3",
    ],
    ["nothing", undefined, ""],
  ])("renders a %s value", (_label, value, expected) => {
    expect(propertyText(value)).toBe(expected);
  });
});
