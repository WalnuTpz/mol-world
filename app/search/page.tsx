import Link from "next/link";

import MemeGrid from "@/components/MemeGrid";
import { prisma } from "@/lib/db";
import { normalizeSearchTokens } from "@/lib/tags";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string | string[];
  page?: string | string[];
  limit?: string | string[];
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseIntParam(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const q = (getParam(searchParams?.q) ?? "").trim();
  const page = parseIntParam(getParam(searchParams?.page), 1);
  const limit = parseIntParam(getParam(searchParams?.limit), 40);
  const skip = (page - 1) * limit;

  const tokens = q ? normalizeSearchTokens(q) : [];
  const where = tokens.length
    ? {
        status: "PUBLISHED" as const,
        AND: tokens.map((token) => ({
          OR: [
            { title: { contains: token } },
            { tags: { some: { tag: { name: { contains: token } } } } },
          ],
        })),
      }
    : null;

  const select = {
    id: true,
    title: true,
    type: true,
    mediaUrl: true,
    thumbUrl: true,
    copies: true,
    isFeatured: true,
    createdAt: true,
  };

  const [items, total] = tokens.length > 0
    ? await Promise.all([
        prisma.meme.findMany({
          where: where ?? undefined,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select,
        }),
        prisma.meme.count({ where: where ?? undefined }),
      ])
    : [[], 0];

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const encodedQ = encodeURIComponent(q);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>搜索表情包</h1>
      <form
        action="/search"
        method="get"
        style={{ display: "flex", gap: 8, marginBottom: 16 }}
      >
        <input
          name="q"
          placeholder="输入关键词后回车"
          defaultValue={q}
          style={{
            flex: 1,
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #ddd",
          }}
        />
        <button type="submit">搜索</button>
      </form>

      {!q ? (
        <div style={{ color: "#666" }}>请输入关键词开始搜索。</div>
      ) : items.length === 0 ? (
        <div style={{ color: "#666" }}>没有找到相关结果。</div>
      ) : (
        <>
          <div style={{ marginBottom: 12, fontSize: 14 }}>
            第 {page} 页 / 共 {totalPages} 页
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {hasPrev ? (
              <Link
                href={`/search?q=${encodedQ}&page=${page - 1}&limit=${limit}`}
                style={{ textDecoration: "none" }}
              >
                上一页
              </Link>
            ) : (
              <span style={{ color: "#999" }}>上一页</span>
            )}
            {hasNext ? (
              <Link
                href={`/search?q=${encodedQ}&page=${page + 1}&limit=${limit}`}
                style={{ textDecoration: "none" }}
              >
                下一页
              </Link>
            ) : (
              <span style={{ color: "#999" }}>下一页</span>
            )}
          </div>
          <MemeGrid items={items} />
        </>
      )}
    </main>
  );
}
