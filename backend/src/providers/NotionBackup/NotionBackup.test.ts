import { describe, expect, test } from "bun:test";
import archiver from "archiver";
import type { SyncEvent } from "../../types.js";
import {
  DATA_ENTRY,
  LEGACY_DATA_ENTRY,
  MANIFEST_ENTRY,
} from "../../utils/backupArchive.js";
import type { RestoreTarget } from "../../utils/notionRestore.js";
import type { RangeSource } from "../../utils/zipReader.js";
import type { NotionClient } from "../Notion/NotionClient.js";
import type {
  OpenedBackup,
  StorageProvider,
} from "../Storage/StorageProvider.js";
import { NotionBackup } from "./NotionBackup.js";

/** An archive as the backup connector writes one: entries streamed, data last. */
async function archive(entries: Record<string, string>): Promise<Uint8Array> {
  const zip = archiver("zip");
  const chunks: Uint8Array[] = [];

  zip.on("data", (chunk: Uint8Array) => chunks.push(chunk));

  for (const [name, content] of Object.entries(entries)) {
    zip.append(content, { name });
  }

  await zip.finalize();

  return new Uint8Array(Buffer.concat(chunks as any));
}

function storage(bytes: Uint8Array, key = "user-1/2026-08-09T14-31-07Z.zip") {
  const source: RangeSource = {
    size: bytes.byteLength,
    read: async (start, end) => bytes.subarray(start, end + 1),
  };

  return {
    openBackup: async (): Promise<OpenedBackup | undefined> => ({
      ref: {
        key,
        date: new Date("2026-08-09T14:31:07Z"),
        size: bytes.byteLength,
      },
      source,
    }),
  } as unknown as StorageProvider;
}

function notion(): { titles: string[]; client: NotionClient } {
  const titles: string[] = [];
  let created = 0;

  const create = async (body: any) => {
    titles.push(
      (body.properties?.title?.title ?? [])
        .map((part: any) => part.text?.content ?? "")
        .join(""),
    );

    return {
      id: `new-page-${++created}`,
      url: `https://notion.so/${created}`,
    };
  };

  const target: RestoreTarget = {
    createRoot: create,
    createPage: create,
    createDatabase: async () => ({ id: `new-database-${++created}` }),
    appendBlocks: async (_parentId, children) =>
      children.map((_, index) => `new-block-${index}`),
  };

  return {
    titles,
    client: { restoreTarget: () => target } as unknown as NotionClient,
  };
}

function connector(store: StorageProvider, client: NotionClient): NotionBackup {
  return new NotionBackup(
    store,
    client,
    { headers: { "user-agent": "test" } } as any,
    { log() {}, warn() {}, error() {}, bindAxios() {} },
  );
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

const items = JSON.stringify([
  {
    object: "page",
    id: "page-1",
    properties: {
      title: { type: "title", title: [{ text: { content: "Recipes" } }] },
    },
  },
]);

describe("restore", () => {
  test("reads a stored archive and rebuilds it into a new page", async () => {
    const { titles, client } = notion();
    const backup = connector(
      storage(
        await archive({
          "assets/image_block-1.png": "bytes",
          [DATA_ENTRY]: items,
          [MANIFEST_ENTRY]: JSON.stringify({
            version: 2,
            createdAt: "2026-08-09T14:31:07.482Z",
            counts: { items: 1, assets: 1, skipped: 0, pages: 1 },
            assets: [
              {
                file: "assets/image_block-1.png",
                kind: "image",
                ownerId: "block-1",
              },
            ],
          }),
        }),
      ),
      client,
    );

    const events = await collect(backup.restore());

    expect(events[0]?.message).toBe(
      "Read 1 archived item from 2026-08-09T14-31-07Z.zip.",
    );
    // The restored page first, named after the backup's own instant, then the
    // archive's contents inside it.
    expect(titles).toEqual([
      "Restored backup — 2026-08-09 14:31 UTC",
      "Recipes",
    ]);
    expect(events.at(-1)?.url).toBe("https://notion.so/1");
  });

  test("opens an archive from before the manifest existed", async () => {
    // Those name their data entry `data_data.json`, and there are still some in
    // the bucket.
    const { titles, client } = notion();
    const backup = connector(
      storage(await archive({ [LEGACY_DATA_ENTRY]: items })),
      client,
    );

    await collect(backup.restore());

    expect(titles).toContain("Recipes");
  });

  test("says so when the zip is not a backup at all", async () => {
    const { client } = notion();
    const backup = connector(
      storage(await archive({ "notes.txt": "hello" })),
      client,
    );

    await expect(collect(backup.restore())).rejects.toThrow(
      `holds no ${DATA_ENTRY}`,
    );
  });

  test("says so when the user has no backup to restore", async () => {
    const { client } = notion();
    const backup = connector(
      { openBackup: async () => undefined } as unknown as StorageProvider,
      client,
    );

    await expect(collect(backup.restore())).rejects.toThrow(
      "no backup to restore",
    );
  });
});
