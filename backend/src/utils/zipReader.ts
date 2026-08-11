import { inflateRawSync } from "node:zlib";

/**
 * Random access to a stored archive.
 *
 * A restore needs two entries — `data.json` and `manifest.json` — out of a zip
 * whose other entries are every image and attachment in the workspace. Reading
 * it as a stream means transferring all of that to reach the tail, which is
 * where those two happen to sit (the backup appends them last). A zip's central
 * directory is at the end and names every entry's offset, so with ranged reads
 * a restore transfers the directory plus the two entries it wants, and nothing
 * else. That matters here in bytes and in money: backups are stored COLDLINE,
 * where every retrieved byte is billed.
 *
 * `read` is inclusive of `end`, which is what both `Bucket.file().createReadStream`
 * and an HTTP `Range` header mean by it.
 */
export interface RangeSource {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

/** One entry of a zip's central directory. */
export interface ZipEntry {
  name: string;
  /** Where this entry's *local* header starts. */
  offset: number;
  compressedSize: number;
  uncompressedSize: number;
  /** 0 = stored, 8 = deflate. Anything else we cannot read. */
  method: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;

const EOCD_SIZE = 22;
const ZIP64_LOCATOR_SIZE = 20;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;

/** A zip comment is a 16-bit length, so the EOCD is never further back. */
const MAX_COMMENT = 0xffff;

/** Stand-in written when a value does not fit 32 bits; the real one is in zip64. */
const OVERFLOW_32 = 0xffffffff;
const OVERFLOW_16 = 0xffff;

const STORED = 0;
const DEFLATED = 8;

/**
 * Every entry in `source`, read from its central directory.
 *
 * Deliberately reads the *central* directory rather than the local headers a
 * stream would hand it: an archive written by a streaming writer (which is what
 * `archiver` is, and what the backup connector needs it to be) leaves the sizes
 * in each local header set to zero and states them afterwards, in a data
 * descriptor and in the central directory. Local headers alone cannot say how
 * long an entry is.
 */
export async function readZipEntries(source: RangeSource): Promise<ZipEntry[]> {
  const { offset, size, count } = await readEndRecord(source);
  const directory = await read(source, offset, offset + size - 1);
  const entries: ZipEntry[] = [];

  let cursor = 0;

  for (let index = 0; index < count; index++) {
    if (
      cursor + CENTRAL_HEADER_SIZE > directory.byteLength ||
      directory.getUint32(cursor, true) !== CENTRAL_SIGNATURE
    ) {
      throw new Error(
        `Corrupt zip: entry ${index + 1} of ${count} is not one.`,
      );
    }

    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true);
    const commentLength = directory.getUint16(cursor + 32, true);
    const nameAt = cursor + CENTRAL_HEADER_SIZE;
    const extraAt = nameAt + nameLength;

    const entry: ZipEntry = {
      name: text(directory, nameAt, nameLength),
      method: directory.getUint16(cursor + 10, true),
      compressedSize: directory.getUint32(cursor + 20, true),
      uncompressedSize: directory.getUint32(cursor + 24, true),
      offset: directory.getUint32(cursor + 42, true),
    };

    applyZip64Extra(entry, directory, extraAt, extraLength);
    entries.push(entry);

    cursor = extraAt + extraLength + commentLength;
  }

  return entries;
}

/** The bytes of one entry, decompressed. */
export async function readZipEntry(
  source: RangeSource,
  entry: ZipEntry,
): Promise<Uint8Array> {
  if (entry.method !== STORED && entry.method !== DEFLATED) {
    throw new Error(
      `Cannot read ${entry.name}: compression method ${entry.method}.`,
    );
  }

  // The local header is read for its own name and extra lengths only. They are
  // allowed to differ from the central directory's — an archive can carry extra
  // fields in one and not the other — so the start of the data cannot be
  // computed from the central entry alone.
  const header = await read(
    source,
    entry.offset,
    entry.offset + LOCAL_HEADER_SIZE - 1,
  );
  const start =
    entry.offset +
    LOCAL_HEADER_SIZE +
    header.getUint16(26, true) +
    header.getUint16(28, true);

  if (entry.compressedSize === 0) {
    return new Uint8Array(0);
  }

  const compressed = await source.read(start, start + entry.compressedSize - 1);

  return entry.method === STORED ? compressed : inflateRawSync(compressed);
}

/** The first of `names` present in `entries`, in the order given. */
export function findZipEntry(
  entries: ZipEntry[],
  names: string[],
): ZipEntry | undefined {
  for (const name of names) {
    const match = entries.find((entry) => entry.name === name);

    if (match) {
      return match;
    }
  }

  return undefined;
}

/** Where the central directory is, how long it is, and how many entries it holds. */
async function readEndRecord(
  source: RangeSource,
): Promise<{ offset: number; size: number; count: number }> {
  const tailLength = Math.min(source.size, EOCD_SIZE + MAX_COMMENT);

  if (tailLength < EOCD_SIZE) {
    throw new Error("Not a zip file: too short to hold a directory.");
  }

  const tailStart = source.size - tailLength;
  const tail = await read(source, tailStart, source.size - 1);
  const eocd = findBackwards(tail, EOCD_SIGNATURE, tailLength - EOCD_SIZE);

  if (eocd === undefined) {
    throw new Error("Not a zip file: no end-of-directory record.");
  }

  const count = tail.getUint16(eocd + 10, true);
  const size = tail.getUint32(eocd + 12, true);
  const offset = tail.getUint32(eocd + 16, true);

  if (count !== OVERFLOW_16 && size !== OVERFLOW_32 && offset !== OVERFLOW_32) {
    return { offset, size, count };
  }

  // Any of those maxed out means the real value is in the zip64 records. A
  // workspace big enough to need them is exactly the one whose backup must
  // still be restorable, so they are read rather than refused.
  return readZip64EndRecord(source, tail, eocd);
}

async function readZip64EndRecord(
  source: RangeSource,
  tail: DataView,
  eocd: number,
): Promise<{ offset: number; size: number; count: number }> {
  const locator = eocd - ZIP64_LOCATOR_SIZE;

  if (
    locator < 0 ||
    tail.getUint32(locator, true) !== ZIP64_LOCATOR_SIGNATURE
  ) {
    throw new Error("Corrupt zip: a zip64 archive with no zip64 locator.");
  }

  const recordAt = Number(tail.getBigUint64(locator + 8, true));
  const record = await read(
    source,
    recordAt,
    Math.min(recordAt + 55, source.size - 1),
  );

  if (record.getUint32(0, true) !== ZIP64_EOCD_SIGNATURE) {
    throw new Error("Corrupt zip: the zip64 directory record is not one.");
  }

  return {
    count: Number(record.getBigUint64(32, true)),
    size: Number(record.getBigUint64(40, true)),
    offset: Number(record.getBigUint64(48, true)),
  };
}

/**
 * Replace whichever of an entry's 32-bit fields overflowed with the zip64 value.
 *
 * The zip64 extra field is a bare run of 64-bit numbers whose meaning is
 * positional: the sizes and the offset appear only if the field they replace
 * held the overflow marker, always in this order.
 */
function applyZip64Extra(
  entry: ZipEntry,
  directory: DataView,
  extraAt: number,
  extraLength: number,
): void {
  let cursor = extraAt;
  const end = extraAt + extraLength;

  while (cursor + 4 <= end) {
    const id = directory.getUint16(cursor, true);
    const length = directory.getUint16(cursor + 2, true);
    let field = cursor + 4;

    if (id !== 0x0001) {
      cursor = field + length;
      continue;
    }

    const take = (): number => {
      const value = Number(directory.getBigUint64(field, true));
      field += 8;

      return value;
    };

    if (entry.uncompressedSize === OVERFLOW_32 && field + 8 <= end) {
      entry.uncompressedSize = take();
    }

    if (entry.compressedSize === OVERFLOW_32 && field + 8 <= end) {
      entry.compressedSize = take();
    }

    if (entry.offset === OVERFLOW_32 && field + 8 <= end) {
      entry.offset = take();
    }

    return;
  }
}

/** Last position at or before `from` where `signature` starts, if any. */
function findBackwards(
  view: DataView,
  signature: number,
  from: number,
): number | undefined {
  for (let at = from; at >= 0; at--) {
    if (view.getUint32(at, true) === signature) {
      return at;
    }
  }

  return undefined;
}

async function read(
  source: RangeSource,
  start: number,
  end: number,
): Promise<DataView> {
  const bytes = await source.read(start, end);
  const wanted = end - start + 1;

  // A short read would otherwise surface as a nonsense signature much further
  // in, blamed on the archive rather than on the transfer.
  if (bytes.byteLength < wanted) {
    throw new Error(
      `Short read at ${start}: wanted ${wanted} bytes, got ${bytes.byteLength}.`,
    );
  }

  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Entry names are UTF-8 in anything written this century. */
function text(view: DataView, at: number, length: number): string {
  return new TextDecoder().decode(
    new Uint8Array(view.buffer, view.byteOffset + at, length),
  );
}

/** A `RangeSource` over a local file, for the filesystem storage used in dev. */
export async function fileRangeSource(path: string): Promise<RangeSource> {
  const file = Bun.file(path);

  // A missing file has a size of 0, which would otherwise be reported as an
  // archive too short to hold a directory — blaming the zip for a typo.
  if (!(await file.exists())) {
    throw new Error(`No such file: ${path}`);
  }

  return {
    size: file.size,
    async read(start, end) {
      // `slice` is end-exclusive, a `Range` is not.
      return new Uint8Array(await file.slice(start, end + 1).arrayBuffer());
    },
  };
}
