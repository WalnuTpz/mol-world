import Link from "next/link";

import RandomLink from "@/components/RandomLink";

import MemeGrid from "@/components/MemeGrid";
import { prisma } from "@/lib/db";
import { sortTags } from "@/lib/tags";

export const dynamic = "force-dynamic";

type SearchParams = {
  mode?: string | string[];
  limit?: string | string[];
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseIntParam(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shuffle<T>(items: T[]) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const modes = [
  { key: "latest", label: "最新" },
  { key: "hot", label: "最热" },
  { key: "random", label: "随机" },
] as const;

export default async function FeaturedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const modeParam = getParam(searchParams?.mode);
  const mode =
    modeParam === "hot" || modeParam === "random" || modeParam === "latest"
      ? modeParam
      : "latest";
  const limit = parseIntParam(getParam(searchParams?.limit), 30);

  const baseWhere = {
    isFeatured: true,
    status: "PUBLISHED" as const,
  };

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
  const normalizeItems = (list: MemeItem[]) =>
    list.map((item) => ({
      ...item,
      tags: sortTags(item.tags.map((t) => t.tag.name)),
    }));

  let items;
  if (mode === "random") {
    const all = await prisma.meme.findMany({
      where: baseWhere,
      select,
    });
    items = normalizeItems(shuffle(all).slice(0, limit));
  } else {
    const orderBy =
      mode === "hot"
        ? { copies: "desc" as const }
        : { createdAt: "desc" as const };
    const list = await prisma.meme.findMany({
      where: baseWhere,
      orderBy,
      take: limit,
      select,
    });
    items = normalizeItems(list);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>精选表情包</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {modes.map((m) => {
          const active = m.key === mode;
          const style = {
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid #ddd",
            background: active ? "#111" : "#fff",
            color: active ? "#fff" : "#111",
            textDecoration: "none",
            fontSize: 14,
          } as const;
          if (m.key === "random") {
            return (
              <RandomLink
                key={m.key}
                href={`/hot?mode=${m.key}&limit=${limit}`}
                style={style}
                disabledStyle={{ opacity: 0.5, cursor: "not-allowed" }}
              >
                {m.label}
              </RandomLink>
            );
          }
          return (
            <Link key={m.key} href={`/hot?mode=${m.key}&limit=${limit}`} style={style}>
              {m.label}
            </Link>
          );
        })}
      </div>
      {items.length === 0 ? (
        <div style={{ color: "#666" }}>
          暂无热门表情包，请先在管理页设置精选内容。
        </div>
      ) : (
        <MemeGrid items={items} />
      )}
    </main>
  );
}
