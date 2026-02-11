import Link from "next/link";

import MemeGrid from "@/components/MemeGrid";
import { prisma } from "@/lib/db";
import { normalizeSearchTokens, sortTags } from "@/lib/tags";
import baseStyles from "../page.module.css";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string | string[];
  page?: string | string[];
  limit?: string | string[];
  sort?: string | string[];
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
  const sortParam = getParam(searchParams?.sort);
  const sort =
    sortParam === "name" || sortParam === "earliest" || sortParam === "latest"
      ? sortParam
      : "latest";
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
    tags: {
      select: {
        tag: { select: { name: true } },
      },
    },
  };

  type MemeRow = {
    id: string;
    title: string | null;
    type: "STATIC" | "ANIMATED";
    mediaUrl: string;
    thumbUrl: string;
    copies: number;
    isFeatured: boolean;
    createdAt: Date;
    tags: { tag: { name: string } }[];
  };

  const normalizeItems = (list: MemeRow[]) =>
    list.map((item) => ({
      ...item,
      tags: sortTags(item.tags.map((t) => t.tag.name)),
    }));

  let items: MemeRow[] = [];
  let total = 0;
  if (tokens.length > 0) {
    if (sort === "name") {
      const list = await prisma.meme.findMany({
        where: where ?? undefined,
        select,
      });
      const collator = new Intl.Collator("zh-Hans-CN", {
        sensitivity: "base",
        numeric: true,
      });
      list.sort((a, b) => {
        if (!a.title && !b.title) return 0;
        if (!a.title) return 1;
        if (!b.title) return -1;
        const diff = collator.compare(a.title, b.title);
        if (diff !== 0) return diff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      total = list.length;
      items = list.slice(skip, skip + limit);
    } else {
      const orderBy =
        sort === "earliest"
          ? { createdAt: "asc" as const }
          : { createdAt: "desc" as const };
      const [list, count] = await Promise.all([
        prisma.meme.findMany({
          where: where ?? undefined,
          orderBy,
          skip,
          take: limit,
          select,
        }),
        prisma.meme.count({ where: where ?? undefined }),
      ]);
      items = list;
      total = count;
    }
  }

  const normalizedItems = normalizeItems(items);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const disableJump = totalPages <= 1;
  const encodedQ = encodeURIComponent(q);

  const pager = (
    <div className={baseStyles.pagination}>
      <div className={baseStyles.pageInfo}>
        当前第 {page} 页 / 共 {totalPages} 页
      </div>
      <div className={baseStyles.pageControls}>
        <div className={baseStyles.pageNav}>
          {hasPrev ? (
            <Link
              className={baseStyles.pageNavBtn}
              href={`/search?q=${encodedQ}&sort=${sort}&page=${page - 1}&limit=${limit}`}
            >
              上一页
            </Link>
          ) : (
            <span className={baseStyles.pageNavBtnDisabled}>上一页</span>
          )}
          {hasNext ? (
            <Link
              className={baseStyles.pageNavBtn}
              href={`/search?q=${encodedQ}&sort=${sort}&page=${page + 1}&limit=${limit}`}
            >
              下一页
            </Link>
          ) : (
            <span className={baseStyles.pageNavBtnDisabled}>下一页</span>
          )}
        </div>
        <form className={baseStyles.pageJump} action="/search" method="get">
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="limit" value={limit} />
          <label className={baseStyles.pageJumpLabel}>
            跳转到
            <input
              className={baseStyles.pageJumpInput}
              type="number"
              name="page"
              min={1}
              max={totalPages}
              defaultValue={page}
              disabled={disableJump}
            />
            页
          </label>
          <button
            className={baseStyles.pageJumpButton}
            type="submit"
            disabled={disableJump}
          >
            跳转
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>搜索表情包</h1>
      <form
        action="/search"
        method="get"
        autoComplete="off"
        style={{ display: "flex", gap: 8, marginBottom: 16 }}
      >
        <input
          name="q"
          placeholder="输入关键词后回车"
          defaultValue={q}
          autoComplete="off"
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
        <>
          <div style={{ color: "#666" }}>
            请输入关键词开始搜索，可用空格分隔多个关键词。
          </div>
          {pager}
        </>
      ) : normalizedItems.length === 0 ? (
        <>
          <div style={{ color: "#666" }}>
            没有找到匹配的表情包，请尝试更换关键词或减少关键词数量。
          </div>
          {pager}
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Link
              href={`/search?q=${encodedQ}&sort=name&page=1&limit=${limit}`}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: sort === "name" ? "#111" : "#fff",
                color: sort === "name" ? "#fff" : "#111",
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              按名称
            </Link>
            <Link
              href={`/search?q=${encodedQ}&sort=latest&page=1&limit=${limit}`}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: sort === "latest" ? "#111" : "#fff",
                color: sort === "latest" ? "#fff" : "#111",
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              最新
            </Link>
            <Link
              href={`/search?q=${encodedQ}&sort=earliest&page=1&limit=${limit}`}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid #ddd",
                background: sort === "earliest" ? "#111" : "#fff",
                color: sort === "earliest" ? "#fff" : "#111",
                textDecoration: "none",
                fontSize: 14,
              }}
            >
              最早
            </Link>
          </div>
          {pager}
          <MemeGrid items={normalizedItems} />
          {pager}
        </>
      )}
    </main>
  );
}
