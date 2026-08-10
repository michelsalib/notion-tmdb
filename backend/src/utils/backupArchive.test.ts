import { describe, expect, test } from "bun:test";
import { assetFileName, assetsOf, extensionFor } from "./backupArchive.js";

/** A pre-signed Notion asset URL, shaped like the real thing. */
function signed(path: string): string {
  return `https://prod-files-secure.s3.us-west-2.amazonaws.com/ws/${path}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F20260809%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Expires=3600`;
}

describe("extensionFor", () => {
  test("reads the extension out of the path, not the signature", () => {
    expect(extensionFor(signed("Screenshot.png"))).toBe(".png");
  });

  test("falls back to the content type when the path has none", () => {
    expect(extensionFor(signed("d7f1a2b3"), "image/webp")).toBe(".webp");
  });

  test("ignores parameters on the content type", () => {
    expect(extensionFor(signed("note"), "text/plain; charset=utf-8")).toBe(
      ".txt",
    );
  });

  test("settles for .bin when neither source says anything useful", () => {
    expect(extensionFor(signed("d7f1a2b3"), "application/octet-stream")).toBe(
      ".bin",
    );
  });

  test("does not mistake a long dotted segment for an extension", () => {
    // `.aws4_request` is a real substring of every signed URL; taking the last
    // dot of the raw string would give it to every asset in the archive.
    expect(extensionFor(signed("aws4_request"), "image/png")).toBe(".png");
  });

  test("survives a value that is not a URL at all", () => {
    expect(extensionFor("not a url", "image/jpeg")).toBe(".jpg");
  });
});

describe("assetsOf", () => {
  test("takes a page's hosted icon and cover", () => {
    const page: any = {
      object: "page",
      id: "page-1",
      icon: { type: "file", file: { url: signed("icon.png") } },
      cover: { type: "file", file: { url: signed("cover.jpg") } },
    };

    expect(assetsOf(page).map((asset) => asset.kind)).toEqual([
      "icon",
      "cover",
    ]);
  });

  test("leaves external files alone", () => {
    // Nothing to copy: the URL is already preserved in the item's own JSON,
    // and the bytes are not Notion's to hand out.
    const page: any = {
      object: "page",
      id: "page-1",
      icon: {
        type: "external",
        external: { url: "https://example.com/i.png" },
      },
      cover: null,
    };

    expect(assetsOf(page)).toEqual([]);
  });

  test.each([
    ["image", "image"],
    ["audio", "audio"],
    ["pdf", "pdf"],
    ["video", "video"],
    ["file", "file"],
  ])("takes a hosted %s block", (type, kind) => {
    const block: any = {
      object: "block",
      id: "block-1",
      type,
      [type]: { type: "file", file: { url: signed(`asset.${type}`) } },
    };

    expect(assetsOf(block)).toMatchObject([{ kind, ownerId: "block-1" }]);
  });

  test("keeps the name Notion gives a file block", () => {
    const block: any = {
      object: "block",
      id: "block-1",
      type: "file",
      file: {
        type: "file",
        name: "Q3 report.xlsx",
        file: { url: signed("q3.xlsx") },
      },
    };

    expect(assetsOf(block)[0]?.name).toBe("Q3 report.xlsx");
  });

  test("ignores a block that carries no file", () => {
    const block: any = {
      object: "block",
      id: "block-1",
      type: "paragraph",
      paragraph: { rich_text: [] },
    };

    expect(assetsOf(block)).toEqual([]);
  });
});

describe("assetFileName", () => {
  test("names the entry by kind, owner and extension", () => {
    expect(
      assetFileName(
        { kind: "image", ownerId: "block-1", url: signed("a.png") },
        "image/png",
      ),
    ).toBe("assets/image_block-1.png");
  });
});
