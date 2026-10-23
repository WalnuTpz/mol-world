import type { Prisma } from "@prisma/client";

export function findTagById(client: Prisma.TransactionClient, value: string) {
  if (/^\d+$/.test(value)) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number > 2_147_483_647)
      return Promise.resolve(null);
    return client.tag.findUnique({
      where: { numId: number },
      select: { id: true, name: true, numId: true },
    });
  }
  return client.tag.findUnique({
    where: { id: value },
    select: { id: true, name: true, numId: true },
  });
}
