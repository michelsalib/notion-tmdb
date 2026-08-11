import { describe, expect, test } from "bun:test";
import type { NotionUserData } from "../../types.js";
import { NotionClient } from "./NotionClient.js";

const logger = { log() {}, warn() {}, error() {}, bindAxios() {} };

/** A Notion API error, in the shape the SDK throws one. */
function apiError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

/**
 * A client whose `search` hands back the given responses in order.
 *
 * `createParents` records the `parent` of every `pages.create`, and `refuse`
 * makes the first attempt fail — which is how the workspace-level parent
 * behaves against an API version or a token that will not take one.
 */
function withSearch(
  responses: { results: any[]; next_cursor: string | null }[],
  options?: { refuse?: Error },
): {
  client: NotionClient;
  cursors: (string | undefined)[];
  createParents: any[];
} {
  const cursors: (string | undefined)[] = [];
  const createParents: any[] = [];
  const notion = new NotionClient(
    {
      id: "user-1",
      notionWorkspace: { accessToken: "token" },
    } as unknown as NotionUserData<any>,
    logger,
  );

  let call = 0;

  (notion as any).client = {
    search: async ({ start_cursor }: { start_cursor?: string }) => {
      cursors.push(start_cursor);

      return responses[call++] ?? { results: [], next_cursor: null };
    },
    pages: {
      create: async ({ parent }: { parent: any }) => {
        createParents.push(parent);

        if (options?.refuse && createParents.length === 1) {
          throw options.refuse;
        }

        return { id: "created-1", url: "https://notion.so/created-1" };
      },
    },
  };

  return { client: notion, cursors, createParents };
}

function row(id: string) {
  return {
    object: "page",
    id,
    parent: { type: "database_id", database_id: "db-1" },
    properties: {},
  };
}

function page(id: string, title: string) {
  return {
    object: "page",
    id,
    parent: { type: "workspace" },
    properties: {
      Name: { type: "title", title: [{ plain_text: title }] },
    },
  };
}

describe("listPages", () => {
  test("looks past a first page of results made up entirely of database rows", async () => {
    // The failure this exists for: search returns the most recently edited
    // things first, and in a workspace using these connectors that is the rows
    // they keep rewriting. One unpaginated call filtered all 100 away and told
    // the user to share a page with the integration.
    const { client, cursors } = withSearch([
      {
        results: Array.from({ length: 100 }, (_, index) => row(`row-${index}`)),
        next_cursor: "cursor-1",
      },
      { results: [page("page-1", "Recipes")], next_cursor: null },
    ]);

    expect(await client.listPages()).toEqual([
      { id: "page-1", title: "Recipes" },
    ]);
    expect(cursors).toEqual([undefined, "cursor-1"]);
  });

  test("stops once it has more pages than a picker can show", async () => {
    const { cursors, client } = withSearch(
      Array.from({ length: 5 }, (_, batch) => ({
        results: Array.from({ length: 100 }, (_, index) =>
          page(`page-${batch}-${index}`, "Page"),
        ),
        next_cursor: `cursor-${batch}`,
      })),
    );

    expect(await client.listPages()).toHaveLength(100);
    // One request, not five: the first response already answered the question.
    expect(cursors).toHaveLength(1);
  });

  test("gives up rather than walking a workspace of rows forever", async () => {
    const { cursors, client } = withSearch(
      Array.from({ length: 50 }, (_, batch) => ({
        results: [row(`row-${batch}`)],
        next_cursor: `cursor-${batch}`,
      })),
    );

    expect(await client.listPages()).toEqual([]);
    expect(cursors).toHaveLength(20);
  });

  test("names a page by its title property, whatever that is called", async () => {
    const { client } = withSearch([
      { results: [page("page-1", "Recipes")], next_cursor: null },
    ]);

    expect((await client.listPages())[0]?.title).toBe("Recipes");
  });

  test("calls an untitled page Untitled rather than nothing", async () => {
    const { client } = withSearch([
      {
        results: [{ object: "page", id: "page-1", properties: {} }],
        next_cursor: null,
      },
    ]);

    expect((await client.listPages())[0]?.title).toBe("Untitled");
  });
});

describe("the restore root page", () => {
  test("goes to the top level of the workspace", async () => {
    // What "the base" means: the user's own Private section, not whichever page
    // a dropdown talked them into.
    const { client, createParents, cursors } = withSearch([]);

    const root = await client.restoreTarget().createRoot({ icon: null });

    expect(createParents).toEqual([{ type: "workspace", workspace: true }]);
    expect(root).toEqual({
      id: "created-1",
      url: "https://notion.so/created-1",
    });
    // No search at all on the happy path: the fallback is what needs a page.
    expect(cursors).toHaveLength(0);
  });

  test("falls back to a top-level page when the parent is refused", async () => {
    // Notion allows a workspace parent for public connections, from an API
    // version that accepts it. The SDK still pins 2022-06-28, and an internal
    // integration token is refused outright — so this must not lose the restore.
    const { client, createParents } = withSearch(
      [
        {
          results: [
            {
              object: "page",
              id: "nested-1",
              parent: { type: "page_id", page_id: "page-9" },
              properties: {},
            },
            {
              object: "page",
              id: "top-1",
              parent: { type: "workspace" },
              properties: {},
            },
          ],
          next_cursor: null,
        },
      ],
      { refuse: apiError(400, "body.parent.type should be `page_id`") },
    );

    await client.restoreTarget().createRoot({ icon: null });

    // The workspace-parented page, not merely the first one it saw: a whole
    // workspace nested inside somebody's sub-page is not the intent.
    expect(createParents).toEqual([
      { type: "workspace", workspace: true },
      { type: "page_id", page_id: "top-1" },
    ]);
  });

  test("settles for any page it can see when none is top-level", async () => {
    const { client, createParents } = withSearch(
      [
        {
          results: [
            {
              object: "page",
              id: "nested-1",
              parent: { type: "page_id", page_id: "page-9" },
              properties: {},
            },
          ],
          next_cursor: null,
        },
      ],
      { refuse: apiError(400, "body.parent.type should be `page_id`") },
    );

    await client.restoreTarget().createRoot({ icon: null });

    expect(createParents[1]).toEqual({ type: "page_id", page_id: "nested-1" });
  });

  test("reports the real reason when there is nothing to fall back to", async () => {
    const { client } = withSearch([], {
      refuse: apiError(400, "body.parent.type should be `page_id`"),
    });

    await expect(
      client.restoreTarget().createRoot({ icon: null }),
    ).rejects.toThrow("body.parent.type");
  });

  test("does not retry a rejected token as a filing problem", async () => {
    // A 401 or a rate limit would fail the second attempt too, with a worse
    // message, and a fallback page is not the answer to either.
    const { client, createParents } = withSearch([], {
      refuse: apiError(401, "API token is invalid"),
    });

    await expect(
      client.restoreTarget().createRoot({ icon: null }),
    ).rejects.toThrow("API token is invalid");
    expect(createParents).toHaveLength(1);
  });
});

describe("pageTitle", () => {
  test("calls an untitled page Untitled rather than nothing", async () => {
    const { client } = withSearch([
      {
        results: [{ object: "page", id: "page-1", properties: {} }],
        next_cursor: null,
      },
    ]);

    expect((await client.listPages())[0]?.title).toBe("Untitled");
  });
});
