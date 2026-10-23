import { Prisma } from "@prisma/client";

const collator = new Intl.Collator("zh-Hans-CN", {
  sensitivity: "base",
  numeric: true,
});
const select = { id: true, title: true, createdAt: true, nameOrder: true };
type Row = {
  id: string;
  title: string | null;
  createdAt: Date;
  nameOrder: number;
};
function compare(a: Row, b: Row) {
  if (!a.title && b.title) return 1;
  if (a.title && !b.title) return -1;
  return (
    collator.compare(a.title ?? "", b.title ?? "") ||
    b.createdAt.getTime() - a.createdAt.getTime() ||
    b.id.localeCompare(a.id)
  );
}

// Assign ranks during migration/import, or when repeated insertions have used up
// floating-point space between neighbours. Page reads then use a SQLite index.
export async function rebuildNameOrder(tx: Prisma.TransactionClient) {
  const rows = await tx.meme.findMany({ select });
  rows.sort(compare);
  for (let start = 0; start < rows.length; start += 400) {
    const batch = rows.slice(start, start + 400);
    await tx.$executeRaw`UPDATE Meme SET nameOrder = CASE id ${Prisma.join(
      batch.map(
        (row, index) => Prisma.sql`WHEN ${row.id} THEN ${start + index}`,
      ),
      " ",
    )} END WHERE id IN (${Prisma.join(batch.map((row) => row.id))})`;
  }
}

export async function updateNameOrder(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const row = await tx.meme.findUniqueOrThrow({ where: { id }, select });
  const where = { id: { not: id } };
  const orderBy = [{ nameOrder: "asc" as const }, { id: "asc" as const }];
  let low = 0;
  let high = await tx.meme.count({ where });
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const [candidate] = await tx.meme.findMany({
      where,
      orderBy,
      skip: middle,
      take: 1,
      select,
    });
    if (compare(row, candidate) < 0) high = middle;
    else low = middle + 1;
  }
  const neighbours = await tx.meme.findMany({
    where,
    orderBy,
    skip: Math.max(0, low - 1),
    take: low ? 2 : 1,
    select,
  });
  const left = low ? neighbours[0] : undefined;
  const right = low ? neighbours[1] : neighbours[0];
  const nameOrder =
    left && right
      ? (left.nameOrder + right.nameOrder) / 2
      : left
        ? left.nameOrder + 1
        : right
          ? right.nameOrder - 1
          : 0;
  if (
    !Number.isFinite(nameOrder) ||
    (left && nameOrder <= left.nameOrder) ||
    (right && nameOrder >= right.nameOrder)
  ) {
    await rebuildNameOrder(tx);
  } else await tx.meme.update({ where: { id }, data: { nameOrder } });
}
