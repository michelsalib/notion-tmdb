import { Readable } from "node:stream";
import type { Archiver } from "archiver";
import archiver from "archiver";
import { Axios } from "axios";
import { inject, injectable } from "tsyringe";
import { LOGGER, REQUEST, STORAGE_PROVIDER } from "../../fx/keys.js";
import type { Logger } from "../../fx/logger/Logger.js";
import type { ScopedRequest } from "../../fx/router.js";
import type { Suggestion } from "../../types.js";
import {
  type AssetRef,
  assetFileName,
  assetsOf,
  type BackupAsset,
  type BackupItem,
  type BackupManifest,
  DATA_ENTRY,
  MANIFEST_ENTRY,
  MANIFEST_VERSION,
} from "../../utils/backupArchive.js";
import { MARKDOWN_DIR, renderMarkdown } from "../../utils/backupMarkdown.js";
import { retriable } from "../../utils/retriable.js";
import type { BackupDataProvider } from "../BackupDataProvider.js";
import { NotionClient } from "../Notion/NotionClient.js";
import type { BackupRef, StorageProvider } from "../Storage/StorageProvider.js";

/** Archives kept per user; older ones are deleted after a successful run. */
const KEEP_BACKUPS = 10;

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@injectable()
export class NotionBackup implements BackupDataProvider<"backup"> {
  private readonly client: Axios;

  constructor(
    @inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @inject(NotionClient) private readonly notion: NotionClient,
    @inject(REQUEST) readonly request: ScopedRequest,
    @inject(LOGGER) private readonly logger: Logger,
  ) {
    this.client = new Axios({
      headers: {
        "User-Agent": request.headers["user-agent"],
      },
    });

    // Was logging responses with `headers: true`. Notion hands out its assets
    // as pre-signed S3 URLs, so those response headers carry credentials —
    // `bindAxios` pins headers (and bodies, and params) off.
    this.logger.bindAxios(this.client);
  }

  search(): Promise<Suggestion[]> {
    throw new Error("Method not implemented.");
  }

  loadNotionEntry(): Promise<any> {
    throw new Error("Method not implemented.");
  }

  /**
   * Walk the workspace and stream it into a zip in storage.
   *
   * One pass, not two. The walk used to collect every item first and only then
   * download the files they point at, but Notion serves those as pre-signed S3
   * URLs that expire about an hour after they are issued — so on a workspace
   * big enough to take an hour to enumerate, every URL gathered in the first
   * pass was dead before the second one reached it. Downloading an item's
   * files as the item arrives keeps each URL seconds old.
   */
  async *sync(): AsyncGenerator<string> {
    const startedAt = new Date();
    const archive = archiver("zip");

    // Begin the upload *before* filling the archive. `finalize()` used to be
    // awaited with nothing consuming the stream, so the whole zip — every
    // asset in the workspace — piled up in archiver's buffer, which is what
    // the Cloud Run instance had to be sized around. Consuming as we go turns
    // that into real backpressure.
    let uploadError: unknown;
    const upload = this.storage.putBackup(archive, startedAt).catch((error) => {
      uploadError = error;

      return "";
    });

    const items: BackupItem[] = [];
    const assets: BackupAsset[] = [];
    const unreadable: string[] = [];
    let attempted = 0;
    let firstAssetFailure: unknown;
    let finalized = false;
    let skipped = 0;
    let pages = 0;

    try {
      for await (const item of this.notion.listContent((subject, error) => {
        unreadable.push(`Skipped blocks under ${subject}: ${reason(error)}`);
      })) {
        // A failed upload cannot be recovered from, and every further download
        // would be work thrown away.
        if (uploadError) {
          throw uploadError;
        }

        items.push(item);

        for (const asset of assetsOf(item)) {
          attempted++;

          try {
            assets.push(await this.load(archive, asset));
          } catch (error) {
            firstAssetFailure ??= error;

            yield `Skipped ${describe(asset)}: ${reason(error)}`;
          }
        }

        // Drained here rather than reported from the callback, because a
        // generator cannot yield from inside one.
        while (unreadable.length) {
          yield unreadable.shift() as string;
        }

        yield `Processed item ${items.length}.`;
      }

      skipped = attempted - assets.length;

      // Every single file failing is not 25 unlucky assets, it is one cause —
      // expired URLs, a network that is gone. Same rule as `runSync`: a run
      // where nothing succeeded is an error, not a backup.
      if (attempted && !assets.length) {
        throw firstAssetFailure;
      }

      // The readable copy. Rendered from what was captured rather than during
      // the walk, because a page's Markdown needs its sub-pages' filenames to
      // link to them, and those are only known once every page is in.
      for (const page of renderMarkdown(items, assets)) {
        archive.append(page.content, { name: page.path });
        pages++;
      }

      yield `Wrote ${pages} Markdown ${pages === 1 ? "page" : "pages"}.`;

      const manifest: BackupManifest = {
        version: MANIFEST_VERSION,
        createdAt: startedAt.toISOString(),
        data: DATA_ENTRY,
        markdown: `${MARKDOWN_DIR}/`,
        counts: { items: items.length, assets: assets.length, skipped, pages },
        assets,
      };

      archive.append(Readable.from(itemChunks(items), { objectMode: false }), {
        name: DATA_ENTRY,
      });
      archive.append(JSON.stringify(manifest, null, 2), {
        name: MANIFEST_ENTRY,
      });

      await archive.finalize();
      finalized = true;
    } finally {
      // An expired token part-way through the walk, or a browser that closed
      // the stream, leaves an upload with no more input and a socket held open
      // until the request times out. Aborting destroys the archive stream, so
      // the pipeline settles and the single-request upload leaves no
      // half-written object behind.
      if (!finalized) {
        archive.abort();

        await upload;
      }
    }

    await upload;

    if (uploadError) {
      throw uploadError;
    }

    yield `Stored ${items.length} items and ${assets.length} files${
      skipped ? `, skipped ${skipped}` : ""
    }.`;

    // Only once the new archive is safely stored, so a failed run never costs
    // the user the backup it was meant to replace.
    await this.storage.pruneBackups(KEEP_BACKUPS);
  }

  async getBackupDate(): Promise<Date | undefined> {
    const meta = await this.storage.getBackupMeta();

    return meta.lastModified;
  }

  listBackups(): Promise<BackupRef[]> {
    return this.storage.listBackups();
  }

  async getLink(key?: string): Promise<string> {
    return this.storage.getBackupLink(key);
  }

  /**
   * Streams one asset into the zip and records it for the manifest.
   *
   * Buffering with `responseType: "arraybuffer"` held the whole file in RAM
   * twice (the ArrayBuffer plus its `Buffer.from` copy).
   *
   * A request that never returns a body — an expired URL, a deleted file — is
   * thrown before anything is appended, so the caller can skip it. A transfer
   * that dies *after* the headers is deliberately not caught: the entry is
   * already open in the zip, and finishing it quietly would put a truncated
   * file in a backup, which is worse than not having the backup.
   */
  private async load(archive: Archiver, asset: AssetRef): Promise<BackupAsset> {
    const response = await retriable(
      this.client,
      "get",
      this.logger,
    )(asset.url, {
      responseType: "stream",
    });

    const declared = response.headers["content-type"];
    const contentType = typeof declared === "string" ? declared : undefined;
    const file = assetFileName(asset, contentType);
    const stream: Readable = response.data;

    archive.append(stream, { name: file });

    // archiver consumes queued entries serially, so wait for this one to drain
    // before requesting the next asset. Without it every download would be
    // issued up front and sit there holding a socket open while archiver
    // worked through the backlog one entry at a time.
    await new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    return {
      file,
      kind: asset.kind,
      ownerId: asset.ownerId,
      name: asset.name,
      contentType,
    };
  }
}

/** What to call an asset in a skip message, so the user can go and find it. */
function describe(asset: AssetRef): string {
  return asset.name
    ? `${asset.name} (${asset.kind} on ${asset.ownerId})`
    : `${asset.kind} on ${asset.ownerId}`;
}

/**
 * `data.json`, a chunk at a time.
 *
 * `JSON.stringify(items)` would build one string holding the entire workspace
 * before a byte of it reached the archive — the same peak the streaming upload
 * exists to avoid.
 */
function* itemChunks(items: BackupItem[]): Generator<Buffer> {
  yield Buffer.from("[");

  for (const [index, item] of items.entries()) {
    yield Buffer.from((index ? "," : "") + JSON.stringify(item));
  }

  yield Buffer.from("]");
}
