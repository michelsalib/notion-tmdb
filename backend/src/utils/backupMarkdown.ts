import type { BackupAsset, BackupItem } from "./backupArchive.js";

/** Folder inside the archive holding the readable copy. */
export const MARKDOWN_DIR = "markdown";

export interface MarkdownFile {
  /** Entry name inside the zip. */
  path: string;
  content: string;
}

/** Blocks that describe the page's own chrome, with nothing to render. */
const CHROME = new Set(["breadcrumb", "table_of_contents", "divider"]);

/**
 * Render the workspace as browsable Markdown, one file per page.
 *
 * `data.json` is a faithful copy and an unreadable one: answering "what did
 * that page say" meant writing a script. This mirrors Notion's own export
 * layout — `Title <id>.md` beside a `Title <id>/` folder for its sub-pages —
 * so an archive can be read, grepped and diffed with no tooling at all.
 *
 * A generator rather than an array: each page is handed straight to the
 * archive and dropped, instead of the whole workspace existing twice over.
 */
export function* renderMarkdown(
  items: BackupItem[],
  assets: BackupAsset[],
): Generator<MarkdownFile> {
  const tree = new Tree(items, assets);

  for (const node of tree.nodes) {
    yield {
      path: node.path,
      content:
        node.item.object === "database"
          ? tree.renderDatabase(node)
          : tree.renderPage(node),
    };
  }
}

interface Node {
  item: any;
  /** Entry name of this page's own file. */
  path: string;
}

class Tree {
  readonly nodes: Node[] = [];
  private readonly byParent = new Map<string, any[]>();
  private readonly paths = new Map<string, string>();
  private readonly assetsByOwner = new Map<string, BackupAsset>();
  private readonly taken = new Set<string>();
  /** Sub-pages the page being rendered already links from its body. */
  private readonly linked = new Set<string>();

  constructor(items: BackupItem[], assets: BackupAsset[]) {
    const known = new Set(items.map((item) => item.id));

    for (const asset of assets) {
      // Only the first per owner: a page has one icon and one cover, and the
      // renderer wants the one that belongs in the body.
      if (!this.assetsByOwner.has(asset.ownerId)) {
        this.assetsByOwner.set(asset.ownerId, asset);
      }
    }

    for (const item of items) {
      const parent = parentOf(item);

      if (parent) {
        const siblings = this.byParent.get(parent) ?? [];

        siblings.push(item);
        this.byParent.set(parent, siblings);
      }
    }

    for (const item of items) {
      const parent = parentOf(item);

      // Top level is anything whose parent is the workspace, or whose parent
      // was never shared with the integration.
      if (item.object !== "block" && (!parent || !known.has(parent))) {
        this.place(item, MARKDOWN_DIR);
      }
    }
  }

  /** Give `item` a file, then place its sub-pages in the folder beside it. */
  private place(item: any, directory: string): void {
    const folder = `${directory}/${this.uniqueName(directory, item)}`;

    this.paths.set(item.id, `${folder}.md`);
    this.nodes.push({ item, path: `${folder}.md` });

    for (const child of this.childPages(item.id)) {
      this.place(child, folder);
    }
  }

  private uniqueName(directory: string, item: any): string {
    // The id keeps two pages of the same name apart, which Notion allows and a
    // filesystem does not.
    const base = `${slug(titleOf(item))} ${item.id.replaceAll("-", "").slice(0, 8)}`;
    let name = base;
    let attempt = 1;

    while (this.taken.has(`${directory}/${name}`)) {
      name = `${base}-${++attempt}`;
    }

    this.taken.add(`${directory}/${name}`);

    return name;
  }

  private childPages(id: string): any[] {
    return (this.byParent.get(id) ?? []).filter(
      (child) => child.object !== "block",
    );
  }

  private childBlocks(id: string): any[] {
    return (this.byParent.get(id) ?? []).filter(
      (child) => child.object === "block",
    );
  }

  renderPage(node: Node): string {
    this.linked.clear();

    const lines = [
      ...frontMatter(node.item),
      `# ${titleOf(node.item) || "Untitled"}`,
      "",
    ];

    const properties = this.propertyLines(node.item);

    if (properties.length) {
      lines.push(...properties, "");
    }

    lines.push(...this.renderBlocks(this.childBlocks(node.item.id), node));

    // Only the sub-pages the body did not already link. A sub-page normally
    // appears as a `child_page` block in its parent, so listing every one here
    // would print most of them twice; a page whose blocks could not be read
    // would otherwise leave its children unreachable.
    const orphans = this.childPages(node.item.id).filter(
      (child) => !this.linked.has(child.id),
    );

    if (orphans.length) {
      lines.push("", "## Sub-pages", "");

      for (const child of orphans) {
        lines.push(`- ${this.link(child, node)}`);
      }
    }

    return `${lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd()}\n`;
  }

  /**
   * A database as the table it is, with each row linking to its own file.
   *
   * The row's page content lives in that file; the table is the view, so a
   * database of 200 films reads as 200 lines rather than 200 headings.
   */
  renderDatabase(node: Node): string {
    const columns = Object.keys(node.item.properties ?? {});
    const rows = this.childPages(node.item.id);
    const lines = [
      ...frontMatter(node.item),
      `# ${titleOf(node.item) || "Untitled"}`,
      "",
      `${rows.length} ${rows.length === 1 ? "row" : "rows"}.`,
      "",
    ];

    if (columns.length) {
      lines.push(
        `| ${columns.join(" | ")} |`,
        `| ${columns.map(() => "---").join(" | ")} |`,
      );

      for (const row of rows) {
        const cells = columns.map((column, index) => {
          const value = propertyText(row.properties?.[column]);

          // The first column carries the link, so the table is navigable even
          // when the title column is not called "Name".
          return index === 0 ? this.link(row, node, value) : value;
        });

        lines.push(`| ${cells.map(cell).join(" | ")} |`);
      }
    }

    return `${lines.join("\n").trimEnd()}\n`;
  }

  /** Row values, for a page that lives in a database. */
  private propertyLines(page: any): string[] {
    if (page.parent?.type !== "database_id") {
      return [];
    }

    const lines: string[] = [];

    for (const [name, value] of Object.entries(page.properties ?? {})) {
      if ((value as any)?.type === "title") {
        continue;
      }

      const text = propertyText(value);

      // A list, not bare lines: consecutive lines with no blank between them
      // are one paragraph in Markdown, so the values ran together into a
      // single sentence.
      if (text) {
        lines.push(`- **${name}:** ${cell(text)}`);
      }
    }

    return lines;
  }

  private renderBlocks(blocks: any[], node: Node): string[] {
    const lines: string[] = [];
    let number = 0;

    for (const block of blocks) {
      number = block.type === "numbered_list_item" ? number + 1 : 0;

      lines.push(...this.renderBlock(block, node, number));
    }

    return lines;
  }

  private renderBlock(block: any, node: Node, number: number): string[] {
    const type: string = block.type ?? "";
    const body = block[type] ?? {};
    const text = rich(body.rich_text, node, this);

    switch (type) {
      case "paragraph":
        return [text, ""];

      case "heading_1":
      case "heading_2":
      case "heading_3": {
        const hashes = "#".repeat(Number(type.slice(-1)) + 1);

        return [`${hashes} ${text}`, "", ...this.nested(block, node, "")];
      }

      case "bulleted_list_item":
        return this.listItem(`- ${text}`, block, node);

      case "numbered_list_item":
        return this.listItem(`${number}. ${text}`, block, node);

      case "to_do":
        return this.listItem(
          `- [${body.checked ? "x" : " "}] ${text}`,
          block,
          node,
        );

      case "toggle":
        // A details element keeps the collapsed shape, and renders as a real
        // toggle everywhere GitHub-flavoured Markdown is understood.
        // The blank lines are load-bearing: without one on each side of the
        // body, a Markdown renderer treats the whole thing as raw HTML and the
        // contents come out as literal `- item` text.
        return [
          "<details>",
          `<summary>${text}</summary>`,
          "",
          ...this.nested(block, node, ""),
          "",
          "</details>",
          "",
        ];

      case "quote":
        return [
          ...`${text}`.split("\n").map((line) => `> ${line}`),
          "",
          ...this.nested(block, node, "> "),
        ];

      case "callout": {
        const icon = body.icon?.emoji ? `${body.icon.emoji} ` : "";

        return [`> ${icon}${text}`, "", ...this.nested(block, node, "> ")];
      }

      case "code":
        return [
          `\`\`\`${body.language === "plain text" ? "" : (body.language ?? "")}`,
          plain(body.rich_text),
          "```",
          "",
        ];

      case "equation":
        return ["$$", body.expression ?? "", "$$", ""];

      case "divider":
        return ["---", ""];

      case "image":
        return this.media(block, node, true);

      case "video":
      case "audio":
      case "pdf":
      case "file":
        return this.media(block, node, false);

      case "bookmark":
      case "embed":
      case "link_preview": {
        const url = body.url ?? "";
        const caption = plain(body.caption);

        return [`[${caption || url}](${url})`, ""];
      }

      case "child_page":
      case "child_database": {
        // A child page's block id *is* the page id, so the sub-page's own file
        // is already known. Falling back to the bare title keeps the line when
        // the page itself was never shared with the integration.
        const target = this.pathOf(block.id);
        const title = body.title || "Untitled";

        this.linked.add(block.id);

        return [
          target
            ? `- [${title}](${encodeURI(relative(node.path, target))})`
            : `- ${title}`,
          "",
        ];
      }

      case "table":
        return this.table(block, node);

      case "column_list":
      case "column":
      case "synced_block":
        // No Markdown equivalent, and nothing of its own to say — the content
        // is entirely in its children.
        return this.nested(block, node, "");

      case "table_row":
        // Consumed by `table`; reaching here means an orphan.
        return [];

      default:
        if (CHROME.has(type)) {
          return [];
        }

        return [`<!-- ${type}${text ? `: ${text}` : ""} -->`, ""];
    }
  }

  /** A list line, with any nested blocks indented under it. */
  private listItem(line: string, block: any, node: Node): string[] {
    const indent = " ".repeat(line.indexOf(" ") + 1);

    return [line, ...this.nested(block, node, indent)];
  }

  private nested(block: any, node: Node, prefix: string): string[] {
    if (!block.has_children) {
      return [];
    }

    const lines = this.renderBlocks(this.childBlocks(block.id), node);

    if (!prefix) {
      return lines;
    }

    return lines.map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()));
  }

  private table(block: any, node: Node): string[] {
    const rows = this.childBlocks(block.id).filter(
      (row) => row.type === "table_row",
    );

    if (!rows.length) {
      return [];
    }

    const width = Math.max(
      ...rows.map((row) => (row.table_row?.cells ?? []).length),
    );
    const lines: string[] = [];

    for (const [index, row] of rows.entries()) {
      const cells: string[] = (row.table_row?.cells ?? []).map((parts: any) =>
        cell(rich(parts, node, this)),
      );

      while (cells.length < width) {
        cells.push("");
      }

      lines.push(`| ${cells.join(" | ")} |`);

      // Markdown needs a header rule, so the first row becomes the header
      // whether Notion marked one or not — without it the table renders as
      // one long paragraph.
      if (index === 0) {
        lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
      }
    }

    lines.push("");

    return lines;
  }

  /** An image or attachment, pointing at the copy inside the archive. */
  private media(block: any, node: Node, inline: boolean): string[] {
    const body = block[block.type] ?? {};
    const caption = plain(body.caption);
    const asset = this.assetsByOwner.get(block.id);
    const target = asset
      ? relative(node.path, asset.file)
      : (body.external?.url ?? body.file?.url ?? "");
    const label = caption || asset?.name || block.type;

    if (!target) {
      return [`<!-- ${block.type} with no source -->`, ""];
    }

    return [
      `${inline ? "!" : ""}[${label}](${encodeURI(target)})`,
      ...(caption && inline ? ["", `*${caption}*`] : []),
      "",
    ];
  }

  /** Markdown link to another archived page, relative to `from`. */
  link(item: any, from: Node, label?: string): string {
    const target = this.paths.get(item.id);
    const text = label || titleOf(item) || "Untitled";

    return target
      ? `[${text}](${encodeURI(relative(from.path, target))})`
      : text;
  }

  /** Where a mentioned page ended up, if it is in the archive at all. */
  pathOf(id: string): string | undefined {
    return this.paths.get(id);
  }
}

function frontMatter(item: any): string[] {
  const lines = ["---", `notion_id: ${item.id}`, `object: ${item.object}`];

  if (item.created_time) {
    lines.push(`created: ${item.created_time}`);
  }

  if (item.last_edited_time) {
    lines.push(`edited: ${item.last_edited_time}`);
  }

  if (item.url) {
    lines.push(`notion_url: ${item.url}`);
  }

  lines.push("---", "");

  return lines;
}

/** Rich text, with Notion's annotations as their Markdown equivalents. */
function rich(parts: any, node: Node, tree: Tree): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts.map((part) => richPart(part, node, tree)).join("");
}

function richPart(part: any, node: Node, tree: Tree): string {
  if (part?.type === "equation") {
    return `$${part.equation?.expression ?? ""}$`;
  }

  const body =
    part?.type === "mention"
      ? mention(part, node, tree)
      : (part?.text?.content ?? part?.plain_text ?? "");

  return decorate(body, part?.annotations, part?.href ?? part?.text?.link?.url);
}

/**
 * Wrap `text` in its annotations, keeping surrounding spaces outside them.
 *
 * `** bold **` is not bold in any renderer — the delimiters have to touch the
 * word, so the whitespace Notion keeps inside the span moves out of it.
 */
function decorate(text: string, annotations: any, href?: string): string {
  const [, before = "", core = "", after = ""] =
    /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];

  if (!core) {
    return text;
  }

  let marked = core;
  const flags = annotations ?? {};

  if (flags.code) {
    marked = `\`${marked}\``;
  }

  if (flags.bold) {
    marked = `**${marked}**`;
  }

  if (flags.italic) {
    marked = `*${marked}*`;
  }

  if (flags.strikethrough) {
    marked = `~~${marked}~~`;
  }

  if (flags.underline) {
    marked = `<u>${marked}</u>`;
  }

  if (href) {
    marked = `[${marked}](${encodeURI(href)})`;
  }

  return `${before}${marked}${after}`;
}

function mention(part: any, node: Node, tree: Tree): string {
  const body = part.mention ?? {};
  const fallback = part.plain_text ?? "";

  switch (body.type) {
    case "page":
    case "database": {
      const target = tree.pathOf(body[body.type]?.id);

      // A mention of a page that is also in the archive becomes a link to it,
      // which is what makes the folder browsable rather than just readable.
      return target
        ? `[${fallback || "Untitled"}](${encodeURI(relative(node.path, target))})`
        : fallback;
    }

    case "date":
      return dateText(body.date);

    case "user":
      return `@${fallback.replace(/^@/, "") || "someone"}`;

    default:
      return fallback;
  }
}

/** A property value as a single line of text. */
export function propertyText(value: any): string {
  const type = value?.type;
  const body = value?.[type];

  switch (type) {
    case "title":
    case "rich_text":
      return plain(body);

    case "number":
      return body === null || body === undefined ? "" : String(body);

    case "select":
    case "status":
      return body?.name ?? "";

    case "multi_select":
      return (body ?? []).map((option: any) => option.name).join(", ");

    case "date":
      return dateText(body);

    case "checkbox":
      return body ? "☑" : "☐";

    case "url":
    case "email":
    case "phone_number":
      return body ?? "";

    case "people":
      return (body ?? []).map((user: any) => user.name ?? user.id).join(", ");

    case "files":
      return (body ?? []).map((file: any) => file.name ?? "file").join(", ");

    case "relation":
      return `${(body ?? []).length} linked`;

    case "formula":
      return propertyText({
        type: body?.type,
        [body?.type]: body?.[body?.type],
      });

    case "rollup":
      return body?.type === "array"
        ? (body.array ?? []).map(propertyText).join(", ")
        : propertyText({ type: body?.type, [body?.type]: body?.[body?.type] });

    case "created_time":
    case "last_edited_time":
      return body ?? "";

    case "created_by":
    case "last_edited_by":
      return body?.name ?? "";

    case "unique_id":
      return [body?.prefix, body?.number].filter(Boolean).join("-");

    default:
      return "";
  }
}

function dateText(date: any): string {
  if (!date?.start) {
    return "";
  }

  return date.end ? `${date.start} → ${date.end}` : date.start;
}

function plain(parts: any): string {
  return Array.isArray(parts)
    ? parts
        .map((part) => part?.plain_text ?? part?.text?.content ?? "")
        .join("")
    : "";
}

function titleOf(item: any): string {
  const property = Object.values(item?.properties ?? {}).find(
    (value: any) => value?.type === "title",
  );

  return (plain((property as any)?.title) || plain(item?.title)).trim();
}

/** A filename that survives every filesystem the archive might be opened on. */
function slug(title: string): string {
  const cleaned = title
    // Windows forbids the reserved set outright; a leading dot hides the file.
    .replace(/[\\/:*?"<>|#]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim();

  // 60 leaves room for the id, the extension and a deep folder path inside the
  // 255-byte limit most filesystems impose on a single name.
  return cleaned.slice(0, 60).trim() || "Untitled";
}

/** Escape what a table cell cannot hold literally. */
function cell(text: string): string {
  return text.replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

/** Path from one archive entry to another, e.g. `../../assets/image_1.png`. */
export function relative(from: string, to: string): string {
  const fromParts = from.split("/").slice(0, -1);
  const toParts = to.split("/");

  let shared = 0;

  while (
    shared < fromParts.length &&
    shared < toParts.length - 1 &&
    fromParts[shared] === toParts[shared]
  ) {
    shared++;
  }

  const up = fromParts.length - shared;
  const down = toParts.slice(shared);

  return [...Array(up).fill(".."), ...down].join("/") || ".";
}

function parentOf(item: any): string | undefined {
  const parent = item?.parent;

  return parent?.page_id ?? parent?.database_id ?? parent?.block_id;
}
