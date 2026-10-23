import type { Prisma } from "@prisma/client";

type TagRow = { id: string; name: string; numId: number | null };

const toUniqueList = (values: string[]) => Array.from(new Set(values));

export const getNextMemeNumId = async (client: Prisma.TransactionClient) => {
  const max = await client.meme.aggregate({ _max: { numId: true } });
  return (max._max.numId ?? 0) + 1;
};

export const ensureTagsWithNumId = async (
  client: Prisma.TransactionClient,
  names: string[],
): Promise<TagRow[]> => {
  const uniqueNames = toUniqueList(names);
  if (uniqueNames.length === 0) return [];

  const existing = await client.tag.findMany({
    where: { name: { in: uniqueNames } },
    select: { id: true, name: true, numId: true },
  });
  const map = new Map(existing.map((item) => [item.name, item]));
  const missing = uniqueNames.filter((name) => !map.has(name));

  if (missing.length > 0) {
    const max = await client.tag.aggregate({ _max: { numId: true } });
    let next = (max._max.numId ?? 0) + 1;
    for (const name of missing) {
      const created = await client.tag.create({
        data: { name, numId: next },
        select: { id: true, name: true, numId: true },
      });
      map.set(name, created);
      next += 1;
    }
  }

  return uniqueNames.map((name) => map.get(name)!);
};
