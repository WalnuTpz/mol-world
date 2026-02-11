import Link from "next/link";

import MemeGrid from "@/components/MemeGrid";
import { prisma } from "@/lib/db";
import { sortTags } from "@/lib/tags";
import baseStyles from "../page.module.css";

export const dynamic = "force-dynamic";

type SearchParams = {
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

export default async function AllPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = parseIntParam(getParam(searchParams?.page), 1);
  const limit = parseIntParam(getParam(searchParams?.limit), 40);
  const sortParam = getParam(searchParams?.sort);
  const sort =
    sortParam === "name" || sortParam === "earliest" || sortParam === "latest"
      ? sortParam
      : "latest";
  const skip = (page - 1) * limit;

  const where = { status: "PUBLISHED" as const };
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

  type MemeItem = Awaited<
    ReturnType<typeof prisma.meme.findMany>
  >[number];
  type MemeCardItem = Omit<MemeItem, "tags"> & { tags: string[] };
  const normalizeItems = (list: MemeItem[]): MemeCardItem[] =>
    list.map((item) => ({
      ...item,
      tags: sortTags(item.tags.map((t) => t.tag.name)),
    }));
  let items: MemeCardItem[] = [];
  let total = 0;
  if (sort === "name") {
    const list = await prisma.meme.findMany({ where, select });
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
    const normalized = normalizeItems(list);
    total = normalized.length;
    items = normalized.slice(skip, skip + limit);
  } else {
    const orderBy =
      sort === "earliest"
        ? [{ createdAt: "asc" as const }]
        : [{ createdAt: "desc" as const }];

    const [list, count] = await Promise.all([
      prisma.meme.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select,
      }),
      prisma.meme.count({ where }),
    ]);
    items = normalizeItems(list);
    total = count;
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const disableJump = totalPages <= 1;

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>全部表情包</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Link
          href={`/all?sort=name&page=1&limit=${limit}`}
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
          href={`/all?sort=latest&page=1&limit=${limit}`}
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
          href={`/all?sort=earliest&page=1&limit=${limit}`}
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
      {items.length === 0 ? (
        <div style={{ color: "#666", marginBottom: 12 }}>
          暂无公开表情包，请先在审核页通过内容。
        </div>
      ) : (
        <MemeGrid items={items} />
      )}
      <div className={baseStyles.pagination}>
        <div className={baseStyles.pageInfo}>
          当前第 {page} 页 / 共 {totalPages} 页
        </div>
        <div className={baseStyles.pageControls}>
          <div className={baseStyles.pageNav}>
            {hasPrev ? (
              <Link
                className={baseStyles.pageNavBtn}
                href={`/all?sort=${sort}&page=${page - 1}&limit=${limit}`}
              >
                上一页
              </Link>
            ) : (
              <span className={baseStyles.pageNavBtnDisabled}>上一页</span>
            )}
            {hasNext ? (
              <Link
                className={baseStyles.pageNavBtn}
                href={`/all?sort=${sort}&page=${page + 1}&limit=${limit}`}
              >
                下一页
              </Link>
            ) : (
              <span className={baseStyles.pageNavBtnDisabled}>下一页</span>
            )}
          </div>
          <form className={baseStyles.pageJump} action="/all" method="get">
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
    </main>
  );
}
