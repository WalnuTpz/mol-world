import Link from "next/link";

import MemeGrid from "@/components/MemeGrid";
import { prisma } from "@/lib/db";
import { sortTags } from "@/lib/tags";

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
      <div style={{ marginBottom: 16, fontSize: 14 }}>
        第 {page} 页 / 共 {totalPages} 页
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {hasPrev ? (
          <Link
            href={`/all?sort=${sort}&page=${page - 1}&limit=${limit}`}
            style={{ textDecoration: "none" }}
          >
            上一页
          </Link>
        ) : (
          <span style={{ color: "#999" }}>上一页</span>
        )}
        {hasNext ? (
          <Link
            href={`/all?sort=${sort}&page=${page + 1}&limit=${limit}`}
            style={{ textDecoration: "none" }}
          >
            下一页
          </Link>
        ) : (
          <span style={{ color: "#999" }}>下一页</span>
        )}
      </div>
      <MemeGrid items={items} />
    </main>
  );
}
