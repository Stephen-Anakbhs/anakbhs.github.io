export type BlogPost = {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: string[];
  status: "draft" | "published";
  body: string;
};

type Frontmatter = {
  title?: string;
  date?: string;
  summary?: string;
  tags?: string[];
  status?: "draft" | "published";
};

const modules = import.meta.glob("../content/blog/*.md", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

function parseScalar(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  return trimmed.replace(/^["']|["']$/g, "");
}

function parseFrontmatter(raw: string): { data: Frontmatter; body: string } {
  if (!raw.startsWith("---")) {
    return { data: {}, body: raw.trim() };
  }

  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { data: {}, body: raw.trim() };
  }

  const frontmatter = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const data: Frontmatter = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim() as keyof Frontmatter;
    const value = parseScalar(line.slice(separator + 1));

    if (key === "tags" && Array.isArray(value)) data.tags = value;
    if (key === "title" && typeof value === "string") data.title = value;
    if (key === "date" && typeof value === "string") data.date = value;
    if (key === "summary" && typeof value === "string") data.summary = value;
    if (key === "status" && (value === "draft" || value === "published")) data.status = value;
  }

  return { data, body };
}

function slugFromPath(path: string) {
  const file = path.split("/").pop() ?? "post.md";
  return file.replace(/\.md$/, "");
}

export const posts: BlogPost[] = Object.entries(modules)
  .map(([path, raw]) => {
    const { data, body } = parseFrontmatter(raw);
    const slug = slugFromPath(path);

    return {
      slug,
      title: data.title ?? slug,
      date: data.date ?? "Undated",
      summary: data.summary ?? "",
      tags: data.tags ?? [],
      status: data.status ?? "draft",
      body
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

export function getPost(slug: string) {
  return posts.find((post) => post.slug === slug);
}
