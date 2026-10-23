import { test } from "node:test";
import { assert, prisma, meme } from "./helpers/fixture.mts";
const { rebuildNameOrder, updateNameOrder } = await import(
  "../lib/nameOrder"
);
const { getSortedMemePage, getRandomMemes } = await import(
  "../lib/memeQueries"
);

test("indexed name pages preserve Chinese and numeric collation after insert and rename", async () => {
  const titles = ["香蕉10", "苹果", "香蕉2", "阿狸", "zebra", "Alpha", null];
  for (let i = 0; i < titles.length; i++)
    await prisma.meme.create({
      data: {
        id: `order-${i}`,
        type: "STATIC",
        title: titles[i],
        mediaUrl: `/memes/original/${i}.png`,
        thumbUrl: `/memes/thumb/${i}.jpg`,
        createdAt: new Date(1000 + i),
      },
    });
  await prisma.$transaction((tx) => rebuildNameOrder(tx));
  await prisma.$transaction(async (tx) => {
    await tx.meme.update({ where: { id: "order-0" }, data: { title: "菠萝" } });
    await updateNameOrder(tx, "order-0");
  });
  await prisma.$transaction(async (tx) => {
    await tx.meme.create({
      data: {
        id: "new",
        type: "STATIC",
        title: "香蕉1",
        mediaUrl: "/memes/original/new.png",
        thumbUrl: "/memes/thumb/new.jpg",
      },
    });
    await updateNameOrder(tx, "new");
  });
  const collator = new Intl.Collator("zh-Hans-CN", {
    sensitivity: "base",
    numeric: true,
  });
  const expected = (await prisma.meme.findMany())
    .sort((a, b) => {
      if (!a.title && b.title) return 1;
      if (a.title && !b.title) return -1;
      return (
        collator.compare(a.title ?? "", b.title ?? "") ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id)
      );
    })
    .map((row) => row.id);
  const ids: string[] = [];
  for (let skip = 0; skip < expected.length; skip += 3)
    ids.push(
      ...(
        await getSortedMemePage({ status: "PUBLISHED" }, "name", skip, 3)
      ).items.map((row) => row.id),
    );
  assert.deepEqual(ids, expected);
  const plan = await prisma.$queryRawUnsafe<{ detail: string }[]>(
    "EXPLAIN QUERY PLAN SELECT id FROM Meme WHERE status='PUBLISHED' ORDER BY nameOrder, id LIMIT 3",
  );
  assert.match(
    plan.map((row) => row.detail).join("\n"),
    /Meme_status_nameOrder_id_idx/,
  );
});

test("name ranks rebalance when adjacent floating point values have no midpoint", async () => {
  await meme("a");
  await meme("b");
  await meme("middle");
  await prisma.meme.update({
    where: { id: "a" },
    data: { title: "a", nameOrder: 1 },
  });
  await prisma.meme.update({
    where: { id: "b" },
    data: { title: "b", nameOrder: 1 + Number.EPSILON },
  });
  await prisma.meme.update({ where: { id: "middle" }, data: { title: "ab" } });
  await prisma.$transaction((tx) => updateNameOrder(tx, "middle"));
  assert.deepEqual(
    (await getSortedMemePage({ status: "PUBLISHED" }, "name", 0, 10)).items.map(
      (row) => row.id,
    ),
    ["a", "middle", "b"],
  );
});

test("stored heat follows counter updates and random selections respect visibility and exclusions", async () => {
  for (let i = 0; i < 12; i++) await meme(`sample-${i}`);
  await prisma.meme.update({
    where: { id: "sample-0" },
    data: { copies: 30, downloads: 4, status: "HIDDEN" },
  });
  await prisma.meme.update({
    where: { id: "sample-1" },
    data: { copies: 4, downloads: 7 },
  });
  const sorted = await getSortedMemePage({ status: "PUBLISHED" }, "heat", 0, 3);
  assert.equal(sorted.items[0].id, "sample-1");
  assert.equal(
    (await prisma.meme.findUniqueOrThrow({ where: { id: "sample-1" } })).heat,
    11,
  );
  const random = await getRandomMemes(30, ["sample-1"]);
  assert.equal(random.length, 10);
  assert.equal(new Set(random.map((row) => row.id)).size, 10);
  assert.ok(
    random.every((row) => row.id !== "sample-0" && row.id !== "sample-1"),
  );
});
