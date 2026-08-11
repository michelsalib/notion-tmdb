import { describe, expect, test } from "bun:test";
import archiver from "archiver";
import {
  findZipEntry,
  type RangeSource,
  readZipEntries,
  readZipEntry,
} from "./zipReader.js";

interface Entry {
  name: string;
  content: string | Uint8Array;
  store?: boolean;
}

/**
 * A zip built the way the backup connector builds one.
 *
 * Deliberately `archiver` rather than a fixture: the reader exists to open
 * archives this project wrote, and archiver streams entries whose sizes are
 * only known afterwards — the exact case a local-header reader gets wrong.
 */
async function zip(entries: Entry[]): Promise<Uint8Array> {
  const archive = archiver("zip");
  const chunks: Uint8Array[] = [];

  archive.on("data", (chunk: Uint8Array) => chunks.push(chunk));

  for (const entry of entries) {
    archive.append(Buffer.from(entry.content as any), {
      name: entry.name,
      store: entry.store ?? false,
    });
  }

  await archive.finalize();

  return new Uint8Array(Buffer.concat(chunks as any));
}

/** A `RangeSource` over a buffer that records what was asked for. */
function source(bytes: Uint8Array): RangeSource & { bytesRead: number } {
  return {
    size: bytes.byteLength,
    bytesRead: 0,
    async read(start, end) {
      this.bytesRead += end - start + 1;

      return bytes.subarray(start, end + 1);
    },
  };
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("readZipEntries", () => {
  test("names every entry of a streamed archive", async () => {
    const entries = await readZipEntries(
      source(
        await zip([
          { name: "assets/image_block-1.png", content: "png bytes" },
          { name: "markdown/Home 1234.md", content: "# Home" },
          { name: "data.json", content: "[]" },
          { name: "manifest.json", content: "{}" },
        ]),
      ),
    );

    expect(entries.map((entry) => entry.name)).toEqual([
      "assets/image_block-1.png",
      "markdown/Home 1234.md",
      "data.json",
      "manifest.json",
    ]);
  });

  test("states the real size of an entry archiver streamed", async () => {
    // The local header of a streamed entry says zero; only the central
    // directory knows. Reading the wrong one yields empty entries.
    const [entry] = await readZipEntries(
      source(await zip([{ name: "data.json", content: "x".repeat(5000) }])),
    );

    expect(entry?.uncompressedSize).toBe(5000);
    expect(entry?.compressedSize).toBeGreaterThan(0);
  });

  test("keeps a non-ASCII entry name intact", async () => {
    // Markdown entries are named after page titles, so this is every workspace
    // with an accent or an emoji in a page name.
    const entries = await readZipEntries(
      source(await zip([{ name: "markdown/Café ☕ 12.md", content: "hi" }])),
    );

    expect(entries[0]?.name).toBe("markdown/Café ☕ 12.md");
  });

  test("rejects something that is not a zip", async () => {
    await expect(
      readZipEntries(
        source(new TextEncoder().encode("not a zip at all, ".repeat(100))),
      ),
    ).rejects.toThrow("no end-of-directory record");
  });
});

describe("readZipEntry", () => {
  test("round-trips a deflated entry", async () => {
    const data = JSON.stringify([{ object: "page", id: "page-1" }]);
    const bytes = await zip([
      { name: "assets/pad.bin", content: "junk".repeat(1000) },
      { name: "data.json", content: data },
    ]);
    const from = source(bytes);
    const entries = await readZipEntries(from);

    expect(
      decode(await readZipEntry(from, findZipEntry(entries, ["data.json"])!)),
    ).toBe(data);
  });

  test("round-trips an entry stored without compression", async () => {
    const bytes = await zip([
      { name: "assets/image_block-1.png", content: "raw", store: true },
    ]);
    const from = source(bytes);
    const [entry] = await readZipEntries(from);

    expect(entry?.method).toBe(0);
    expect(decode(await readZipEntry(from, entry!))).toBe("raw");
  });

  test("round-trips content too large for one inflate chunk", async () => {
    const data = JSON.stringify(
      Array.from({ length: 20_000 }, (_, index) => ({
        object: "block",
        id: `block-${index}`,
        type: "paragraph",
      })),
    );
    const bytes = await zip([{ name: "data.json", content: data }]);
    const from = source(bytes);
    const entries = await readZipEntries(from);

    expect(decode(await readZipEntry(from, entries[0]!))).toBe(data);
  });

  test("handles an empty entry", async () => {
    const bytes = await zip([{ name: "data.json", content: "" }]);
    const from = source(bytes);
    const entries = await readZipEntries(from);

    expect(await readZipEntry(from, entries[0]!)).toHaveLength(0);
  });

  test("transfers the directory and the wanted entry, not the archive", async () => {
    // The reason this reader exists. `assets/` is the bulk of a real backup and
    // a restore never touches it, so reading `data.json` must not pay for it.
    const bytes = await zip([
      // Stored, not deflated: an archive full of JPEGs does not shrink either,
      // and a compressible filler would leave nothing to skip past.
      {
        name: "assets/image_block-1.png",
        content: new Uint8Array(2_000_000),
        store: true,
      },
      { name: "data.json", content: "[]" },
    ]);
    const from = source(bytes);
    const entries = await readZipEntries(from);

    await readZipEntry(from, findZipEntry(entries, ["data.json"])!);

    expect(from.bytesRead).toBeLessThan(70_000);
    expect(bytes.byteLength).toBeGreaterThan(1_000_000);
  });
});

describe("findZipEntry", () => {
  test("prefers the first name that is present", async () => {
    // `data_data.json` is what `data.json` was called before the manifest
    // existed, and archives in the bucket still use it.
    const entries = await readZipEntries(
      source(await zip([{ name: "data_data.json", content: "[]" }])),
    );

    expect(findZipEntry(entries, ["data.json", "data_data.json"])?.name).toBe(
      "data_data.json",
    );
    expect(findZipEntry(entries, ["manifest.json"])).toBeUndefined();
  });
});
