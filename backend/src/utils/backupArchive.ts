import type {
  BlockObjectResponse,
  DatabaseObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints.js";

export type BackupItem =
  | PageObjectResponse
  | DatabaseObjectResponse
  | BlockObjectResponse;

export type AssetKind =
  | "icon"
  | "cover"
  | "image"
  | "audio"
  | "pdf"
  | "video"
  | "file";

/** A Notion-hosted file to pull into the archive. */
export interface AssetRef {
  kind: AssetKind;
  /** Id of the page, database or block the file hangs off. */
  ownerId: string;
  url: string;
  /** Notion's own name for the file, where it exposes one. */
  name?: string;
}

/** One archived file, as recorded in `manifest.json`. */
export interface BackupAsset {
  /** Name of the entry inside the zip. */
  file: string;
  kind: AssetKind;
  ownerId: string;
  name?: string;
  contentType?: string;
}

export interface BackupManifest {
  /** Bumped when the layout of the archive changes. */
  version: number;
  createdAt: string;
  /** Entry holding the raw Notion objects. */
  data: string;
  /** Folder holding the readable copy, one Markdown file per page. */
  markdown: string;
  counts: {
    items: number;
    assets: number;
    skipped: number;
    /** Markdown files written, i.e. pages and databases rendered. */
    pages: number;
  };
  assets: BackupAsset[];
}

/** 2 added `markdown/`; 1 was `data.json` + `assets/` only. */
export const MANIFEST_VERSION = 2;
export const MANIFEST_ENTRY = "manifest.json";
export const DATA_ENTRY = "data.json";
/** What `DATA_ENTRY` was called before the manifest existed. */
export const LEGACY_DATA_ENTRY = "data_data.json";

/**
 * Only files Notion hosts itself.
 *
 * An `external` asset needs no copy — its URL is already in the item's own JSON
 * in `data.json`, and it is not ours to archive.
 */
export function assetsOf(item: BackupItem): AssetRef[] {
  const assets: AssetRef[] = [];

  if (item.object !== "block") {
    if (item.icon?.type === "file") {
      assets.push({ kind: "icon", ownerId: item.id, url: item.icon.file.url });
    }

    if (item.cover?.type === "file") {
      assets.push({
        kind: "cover",
        ownerId: item.id,
        url: item.cover.file.url,
      });
    }

    return assets;
  }

  if (item.type === "image" && item.image.type === "file") {
    assets.push({ kind: "image", ownerId: item.id, url: item.image.file.url });
  }

  if (item.type === "audio" && item.audio.type === "file") {
    assets.push({ kind: "audio", ownerId: item.id, url: item.audio.file.url });
  }

  if (item.type === "pdf" && item.pdf.type === "file") {
    assets.push({ kind: "pdf", ownerId: item.id, url: item.pdf.file.url });
  }

  if (item.type === "video" && item.video.type === "file") {
    assets.push({ kind: "video", ownerId: item.id, url: item.video.file.url });
  }

  if (item.type === "file" && item.file.type === "file") {
    assets.push({
      kind: "file",
      ownerId: item.id,
      url: item.file.file.url,
      name: nameOf(item.file),
    });
  }

  return assets;
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "text/plain": ".txt",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
};

/**
 * File extension for an archived asset.
 *
 * Notion's S3 URLs keep the original filename, so the path is the better
 * source and the `Content-Type` is the fallback. The path is read via `URL`
 * rather than off the raw string: these URLs are pre-signed, and the last dot
 * in the whole string is somewhere in `X-Amz-Credential`, not in the filename.
 */
export function extensionFor(url: string, contentType?: string): string {
  let pathname: string;

  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = "";
  }

  const filename = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dot = filename.lastIndexOf(".");

  if (dot > 0 && dot < filename.length - 1) {
    const extension = filename.slice(dot).toLowerCase();

    // Guards against a dot in a directory-ish segment producing something like
    // `.aws4_request` as the extension of every file in the archive.
    if (/^\.[a-z0-9]{1,5}$/.test(extension)) {
      return extension;
    }
  }

  const mime = contentType?.split(";")[0]?.trim().toLowerCase();

  return (mime && EXTENSIONS[mime]) || ".bin";
}

/**
 * Name for the asset's entry in the zip, e.g. `image_<block id>.png`.
 *
 * Entries used to be `image_<block id>` with no extension at all, which left
 * the archive unopenable by anything that dispatches on one — including the
 * user double-clicking a file in it.
 */
export function assetFileName(asset: AssetRef, contentType?: string): string {
  return `assets/${asset.kind}_${asset.ownerId}${extensionFor(asset.url, contentType)}`;
}

function nameOf(file: unknown): string | undefined {
  const name = (file as { name?: unknown }).name;

  return typeof name === "string" && name ? name : undefined;
}
