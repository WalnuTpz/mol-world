import Link from "next/link";

import MemeGrid from "@/components/MemeGrid";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type SearchParams = {
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

export default async function AllPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = parseIntParam(getParam(searchParams?.page), 1);
  const limit = parseIntParam(getParam(searchParams?.limit), 40);
  const skip = (page - 1) * limit;

  const where = { status: "PUBLISHED" as const };
  const select = {
    id: true,
    title: true,
    type: true,
    mediaUrl: true,
    thumbUrl: true,
    downloads: true,
    isFeatured: true,
    createdAt: true,
  };

  const [items, total] = await Promise.all([
    prisma.meme.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select,
    }),
    prisma.meme.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>全部表情包</h1>
      <div style={{ marginBottom: 16, fontSize: 14 }}>
        第 {page} 页 / 共 {totalPages} 页
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {hasPrev ? (
          <Link
            href={`/all?page=${page - 1}&limit=${limit}`}
            style={{ textDecoration: "none" }}
          >
            上一页
          </Link>
        ) : (
          <span style={{ color: "#999" }}>上一页</span>
        )}
        {hasNext ? (
          <Link
            href={`/all?page=${page + 1}&limit=${limit}`}
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
