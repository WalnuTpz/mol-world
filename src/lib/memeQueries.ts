import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const memeSelect = {
  id: true,
  title: true,
  type: true,
  mediaUrl: true,
  thumbUrl: true,
  copies: true,
  downloads: true,
  isFeatured: true,
  createdAt: true,
  tags: {
    select: {
      tag: { select: { name: true } },
    },
  },
};

export type MemeRow = {
  id: string;
  title: string | null;
  type: "STATIC" | "ANIMATED";
  mediaUrl: string;
  thumbUrl: string;
  copies: number;
  downloads: number;
  isFeatured: boolean;
  createdAt: Date;
  tags: { tag: { name: string } }[];
};

export async function getMemeRows(ids: string[]): Promise<MemeRow[]> {
  if (!ids.length) return [];
  const rows = await prisma.meme.findMany({
    where: { status: "PUBLISHED", id: { in: ids } },
    select: memeSelect,
  });
  const byId = new Map(rows.map((item) => [item.id, item]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export async function getPopularMemes(limit: number) {
  return prisma.meme.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ heat: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: memeSelect,
  });
}

export async function getSortedMemePage(
  where: Prisma.MemeWhereInput,
  sort: "name" | "heat",
  skip: number,
  limit: number,
) {
  const orderBy: Prisma.MemeOrderByWithRelationInput[] =
    sort === "name"
      ? [{ nameOrder: "asc" }, { id: "asc" }]
      : [{ heat: "desc" }, { createdAt: "desc" }, { id: "desc" }];
  const [total, items] = await Promise.all([
    prisma.meme.count({ where }),
    prisma.meme.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: memeSelect,
    }),
  ]);
  return { total, items };
}

export async function getRandomMemes(limit: number, excluded: string[] = []) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM Meme WHERE status = 'PUBLISHED'
    ${excluded.length ? Prisma.sql`AND id NOT IN (${Prisma.join(excluded)})` : Prisma.empty}
    ORDER BY RANDOM() LIMIT ${limit}
  `;
  return getMemeRows(rows.map((row) => row.id));
}
