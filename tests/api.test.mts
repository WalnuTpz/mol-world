import { test } from "node:test";
import {
  assert,
  prisma,
  login,
  review,
  manage,
  batch,
  ensureDailyPools,
  cookie,
  request,
  meme,
} from "./helpers/fixture.mts";

test("review rejects a non-string title as a client error", async () => {
  const res = await review.PATCH(request({ title: 123 }), {
    params: Promise.resolve({ id: "unknown" }),
  });
  assert.equal(res.status, 400);
});

test("review saves tags without erasing an omitted title", async () => {
  await prisma.meme.create({
    data: {
      id: "pending",
      type: "STATIC",
      status: "PENDING",
      title: "Keep me",
      mediaUrl: "/uploads/a.png",
      thumbUrl: "/uploads/a.png",
    },
  });
  const res = await review.PATCH(request({ tags: [] }), {
    params: Promise.resolve({ id: "pending" }),
  });
  assert.equal(res.status, 200);
  assert.equal(
    (await prisma.meme.findUniqueOrThrow({ where: { id: "pending" } })).title,
    "Keep me",
  );
});

test("a small daily pool is reused and concurrent calls leave one complete pool", async () => {
  const ids = ["a", "b", "c"];
  for (const id of ids) await meme(id);
  await ensureDailyPools("2030-01-01", ids, 2, 24);
  const original = await prisma.dailyPool.findMany({
    orderBy: { groupIndex: "asc" },
  });
  await ensureDailyPools("2030-01-01", ids, 2, 24);
  assert.deepEqual(
    (await prisma.dailyPool.findMany({ orderBy: { groupIndex: "asc" } })).map(
      (x) => x.id,
    ),
    original.map((x) => x.id),
  );
  await Promise.all([
    ensureDailyPools("2030-01-02", ids, 2, 24),
    ensureDailyPools("2030-01-02", ids, 2, 24),
  ]);
  assert.equal(
    await prisma.dailyPool.count({ where: { day: "2030-01-02" } }),
    2,
  );
});

test("batch heat reset clears matching daily totals and leaves other memes intact", async () => {
  for (const id of ["a", "b"]) {
    await meme(id);
    await prisma.meme.update({
      where: { id },
      data: { copies: 3, downloads: 2 },
    });
    await prisma.memeDailyStat.create({
      data: { day: "2030-01-01", memeId: id, copies: 3, downloads: 2 },
    });
  }
  const res = await batch.POST(
    request({ action: "reset", ids: ["a"] }, "POST"),
  );
  assert.equal(res.status, 200);
  const stats = await prisma.memeDailyStat.findMany({
    orderBy: { memeId: "asc" },
  });
  assert.deepEqual(
    stats.map((x) => x.copies + x.downloads),
    [0, 5],
  );
});

test("invalid external JSON types receive client errors across admin mutations", async () => {
  const params = await import("../app/api/admin/params/route");
  const password = await import("../app/api/admin/password/route");
  const tag = await import("../app/api/admin/tags/[id]/route");
  const merge = await import("../app/api/admin/tags/merge/route");
  const responses = [
    await login.POST(request({ user: 12, pass: [] }, "POST")),
    await review.PATCH(request(null), { params: Promise.resolve({ id: "x" }) }),
    await manage.PATCH(request({ tags: [12] }), {
      params: Promise.resolve({ id: "x" }),
    }),
    await batch.POST(request({ action: "delete", ids: [12] }, "POST")),
    await params.PATCH(request("bad")),
    await params.PATCH(request({ updates: { constructor: 10 } })),
    await password.POST(request({ newPass: 1234, confirmPass: 1234 }, "POST")),
    await tag.PATCH(request({ name: 12 }), {
      params: Promise.resolve({ id: "x" }),
    }),
    await merge.POST(request({ from: [], to: "x" }, "POST")),
  ];
  assert.deepEqual(
    responses.map((x) => x.status),
    Array(responses.length).fill(400),
  );
});

test("search preserves emoji and punctuation instead of returning every meme", async () => {
  const search = await import("../app/api/search/route");
  await meme("a");
  await meme("b");
  await prisma.meme.update({
    where: { id: "a" },
    data: { title: "hello! 😺" },
  });
  for (const q of ["😺", "hello!"]) {
    const res = await search.GET(
      new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`),
    );
    assert.deepEqual(
      (await res.json()).items.map((x: { id: string }) => x.id),
      ["a"],
    );
  }
});

test("all list endpoints accept malformed and overflowing pagination without database errors", async () => {
  const routes = await Promise.all([
    import("../app/api/memes/route"),
    import("../app/api/search/route"),
    import("../app/api/manage/route"),
    import("../app/api/review/route"),
    import("../app/api/admin/tags/route"),
    import("../app/api/admin/logs/route"),
  ]);
  for (const route of routes) {
    for (const page of ["999999999999999999999", "2147483647", "-3", "1abc"]) {
      const response = await route.GET(
        new Request(
          `http://localhost/?q=test&page=${page}&limit=9999999999999`,
          { headers: { cookie } },
        ),
      );
      assert.equal(response.status, 200, await response.clone().text());
      const result = await response.json();
      assert.ok(result.limit <= 60);
    }
  }
});

test("tag rename, merge, unlink and numeric aliases keep associations consistent", async () => {
  const rename = await import("../app/api/admin/tags/[id]/route");
  const merge = await import("../app/api/admin/tags/merge/route");
  const remove = await import("../app/api/admin/tags/[id]/delete/route");
  await meme("tagged");
  await prisma.tag.createMany({
    data: [
      { id: "from", numId: 1, name: "source" },
      { id: "to", numId: 2, name: "target" },
    ],
  });
  await prisma.memeTag.createMany({
    data: [
      { memeId: "tagged", tagId: "from" },
      { memeId: "tagged", tagId: "to" },
    ],
  });
  assert.equal(
    (
      await rename.PATCH(request({ name: "target" }), {
        params: Promise.resolve({ id: "1" }),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await rename.PATCH(request({ name: "new" }), {
        params: Promise.resolve({ id: "999999999999999999999" }),
      })
    ).status,
    404,
  );
  const merged = await merge.POST(request({ from: "1", to: "target" }, "POST"));
  assert.equal(merged.status, 200, await merged.clone().text());
  assert.equal((await merged.json()).added, 0);
  assert.equal(await prisma.memeTag.count(), 1);
  assert.equal(await prisma.tag.count(), 1);
  const deleted = await remove.DELETE(
    new Request("http://localhost?mode=unlink", {
      method: "DELETE",
      headers: { cookie },
    }),
    { params: Promise.resolve({ id: "2" }) },
  );
  assert.equal(deleted.status, 200);
  assert.equal(await prisma.memeTag.count(), 0);
  assert.equal(await prisma.tag.count(), 1);
});

test("configuration changes validate atomically and refresh the cache", async () => {
  const { getAppConfig, updateAppConfig } = await import(
    "../lib/appConfig"
  );
  const original = await getAppConfig();
  try {
    assert.equal(
      (await updateAppConfig({ listLimit: 6, maxTags: 999 })).ok,
      false,
    );
    assert.equal((await getAppConfig()).listLimit, original.listLimit);
    assert.equal((await updateAppConfig({ listLimit: 6 })).ok, true);
    assert.equal((await getAppConfig()).listLimit, 6);
  } finally {
    await updateAppConfig(original);
  }
});

test("heat queries exclude hidden rows, retain ordering, and use the heat index", async () => {
  const { getPopularMemes, getSortedMemePage } = await import(
    "../lib/memeQueries"
  );
  await meme("low");
  await meme("high");
  await meme("hidden");
  await prisma.meme.update({ where: { id: "high" }, data: { copies: 10 } });
  await prisma.meme.update({
    where: { id: "hidden" },
    data: { copies: 100, status: "HIDDEN" },
  });
  assert.deepEqual(
    (await getPopularMemes(1)).map((item) => item.id),
    ["high"],
  );
  const result = await getSortedMemePage({ status: "PUBLISHED" }, "heat", 1, 1);
  assert.equal(result.total, 2);
  assert.equal(result.items[0].id, "low");
  const plan = await prisma.$queryRawUnsafe<{ detail: string }[]>(
    "EXPLAIN QUERY PLAN SELECT id FROM Meme WHERE status='PUBLISHED' ORDER BY heat DESC, createdAt DESC, id DESC LIMIT 24",
  );
  assert.ok(
    plan.some((row) =>
      row.detail.includes("Meme_status_heat_createdAt_id_idx"),
    ),
    plan.map((row) => row.detail).join("; "),
  );
});

test("log ranges filter listing and export escapes spreadsheet formulas", async () => {
  const logs = await import("../app/api/admin/logs/route");
  const csv = await import("../app/api/admin/logs/export/route");
  await prisma.auditLog.deleteMany();
  await prisma.auditLog.createMany({
    data: [
      { action: "formula-test", status: "success", message: "=1+1" },
      {
        action: "formula-test",
        status: "success",
        message: "old",
        createdAt: new Date(Date.now() - 10 * 86400000),
      },
    ],
  });
  const response = await logs.GET(
    new Request("http://localhost?range=3d&q=formula-test", {
      headers: { cookie },
    }),
  );
  assert.equal((await response.json()).total, 1);
  const exported = await csv.GET(
    new Request("http://localhost?range=3d&q=formula-test", {
      headers: { cookie },
    }),
  );
  assert.match(await exported.text(), /'=1\+1/);
  assert.equal(exported.headers.get("cache-control"), "no-store");
});

test("CSV export streams more than one page without duplicates", async () => {
  const csv = await import("../app/api/admin/logs/export/route");
  await prisma.auditLog.deleteMany();
  await prisma.auditLog.createMany({
    data: Array.from({ length: 1007 }, (_, i) => ({
      id: `export-${String(i).padStart(4, "0")}`,
      action: "bulk-export",
      status: "success",
      message: `row-${i}`,
      createdAt: new Date("2026-01-01"),
    })),
  });
  const response = await csv.GET(
    new Request("http://localhost/api/admin/logs/export?range=all", {
      headers: { cookie },
    }),
  );
  const lines = (await response.text()).split("\n");
  assert.equal(lines.length, 1008);
  assert.equal(new Set(lines.slice(1)).size, 1007);
  const canceled = await csv.GET(
    new Request("http://localhost/api/admin/logs/export?range=all", {
      headers: { cookie },
    }),
  );
  const reader = canceled.body!.getReader();
  await reader.read();
  await reader.cancel();
});
