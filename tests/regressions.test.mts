import assert from "node:assert/strict";
import { before, beforeEach, after, afterEach, test } from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = await mkdtemp(path.join(tmpdir(), "mol-world-test-"));
process.env.DATABASE_URL = `file:${path.join(fixture, "test.db")}`;
process.env.REVIEW_USER = "test-admin";
process.env.REVIEW_PASS = "test-password-only";
await writeFile(path.join(fixture, "test.db"), "");
const migration = spawnSync(
  process.execPath,
  [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
  { cwd: root, env: process.env, encoding: "utf8" },
);
assert.equal(migration.status, 0, migration.stderr);
process.chdir(fixture);

const { prisma } = await import("../lib/db");
const login = await import("../app/api/admin/login/route");
const upload = await import("../app/api/upload/route");
const review = await import("../app/api/review/[id]/route");
const manage = await import("../app/api/manage/[id]/route");
const batch = await import("../app/api/manage/batch/route");
const { ensureDailyPools } = await import("../lib/dailyPool");
let cookie: string;
const image = await sharp({
  create: { width: 4, height: 4, channels: 3, background: "red" },
})
  .png()
  .toBuffer();

const request = (body: unknown, method = "PATCH") =>
  new Request("http://localhost/api/test", {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const uploadRequest = () => {
  const body = new FormData();
  body.append(
    "file",
    new File([new Uint8Array(image)], "test.png", { type: "image/png" }),
  );
  return new Request("http://localhost/api/upload", {
    method: "POST",
    headers: { cookie },
    body,
  });
};
const meme = (id: string, status: "PENDING" | "PUBLISHED" = "PUBLISHED") =>
  prisma.meme.create({
    data: {
      id,
      title: "Original title",
      status,
      type: "STATIC",
      mediaUrl: `/memes/original/${id}.png`,
      thumbUrl: `/memes/thumb/${id}.jpg`,
    },
  });

before(async () => {
  const res = await login.POST(
    new Request("http://localhost/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: process.env.REVIEW_USER,
        pass: process.env.REVIEW_PASS,
      }),
    }),
  );
  assert.equal(res.status, 200);
  cookie = res.headers.get("set-cookie")!.split(";")[0];
});
beforeEach(async () => {
  await prisma.memeTag.deleteMany();
  await prisma.meme.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.dailyPool.deleteMany();
  await rm(path.join(fixture, "public"), { recursive: true, force: true });
  for (const dir of ["uploads", "memes/original", "memes/thumb"])
    await mkdir(path.join(fixture, "public", dir), { recursive: true });
});
afterEach(async () => {
  await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS reject_delete");
  await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS reject_insert");
});
after(async () => {
  await prisma.$disconnect();
  process.chdir(root);
  await rm(fixture, { recursive: true, force: true });
});

test("uploaded pending image can be deleted even though preview and original share a file", async () => {
  assert.equal((await upload.POST(uploadRequest())).status, 200);
  const item = await prisma.meme.findFirstOrThrow();
  const res = await review.PATCH(request({ action: "delete" }), {
    params: Promise.resolve({ id: item.id }),
  });
  assert.equal(res.status, 200, await res.text());
  assert.equal(await prisma.meme.count(), 0);
});

test("failed deletion restores distinct original and thumbnail with the same basename", async () => {
  await prisma.meme.create({
    data: {
      id: "same",
      type: "ANIMATED",
      mediaUrl: "/memes/original/same.gif",
      thumbUrl: "/memes/thumb/same.gif",
    },
  });
  await writeFile("public/memes/original/same.gif", "ORIGINAL");
  await writeFile("public/memes/thumb/same.gif", "THUMB");
  await prisma.$executeRawUnsafe(
    "CREATE TRIGGER reject_delete BEFORE DELETE ON Meme BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  const res = await manage.PATCH(request({ action: "delete" }), {
    params: Promise.resolve({ id: "same" }),
  });
  assert.equal(res.status, 500);
  assert.equal(
    await readFile("public/memes/original/same.gif", "utf8"),
    "ORIGINAL",
  );
  assert.equal(await readFile("public/memes/thumb/same.gif", "utf8"), "THUMB");
  assert.equal(await prisma.meme.count(), 1);
});

test("upload rolls back its file when the database rejects the record", async () => {
  await prisma.$executeRawUnsafe(
    "CREATE TRIGGER reject_insert BEFORE INSERT ON Meme BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  const res = await upload.POST(uploadRequest());
  assert.equal(res.status, 500);
  assert.deepEqual(await readdir("public/uploads"), []);
});

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

test("seed with no source directory preserves existing records", async () => {
  await meme("keep");
  const dir = await mkdtemp(path.join(fixture, "seed-"));
  spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      path.join(root, "prisma/seed.ts"),
    ],
    { cwd: dir, env: process.env, encoding: "utf8" },
  );
  assert.equal(await prisma.meme.count(), 1);
});

test("concurrent review and cleanup preserve the one published original and preview", async () => {
  await upload.POST(uploadRequest());
  const item = await prisma.meme.findFirstOrThrow();
  const resources = await import("../app/api/admin/resources/route");
  const responses = await Promise.all([
    review.PATCH(request({ status: "PUBLISHED" }), { params: Promise.resolve({ id: item.id }) }),
    review.PATCH(request({ status: "PUBLISHED" }), { params: Promise.resolve({ id: item.id }) }),
    resources.POST(request({ action: "cleanup" }, "POST")),
  ]);
  assert.deepEqual(
    responses.map((x) => x.status),
    [200, 400, 200],
  );
  const saved = await prisma.meme.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(saved.status, "PUBLISHED");
  assert.deepEqual(await readFile(path.join("public", saved.mediaUrl)), image);
  assert.equal(
    (await sharp(path.join("public", saved.thumbUrl)).metadata()).format,
    "jpeg",
  );
});

test("rejected publication restores its pending upload and removes the generated preview", async () => {
  await upload.POST(uploadRequest());
  const item = await prisma.meme.findFirstOrThrow();
  await prisma.$executeRawUnsafe(
    "CREATE TRIGGER reject_update BEFORE UPDATE ON Meme BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  try {
    assert.equal(
      (
        await review.PATCH(request({ status: "PUBLISHED" }), {
          params: Promise.resolve({ id: item.id }),
        })
      ).status,
      500,
    );
    assert.deepEqual(await readFile(path.join("public", item.mediaUrl)), image);
    assert.deepEqual(await readdir("public/memes/original"), []);
    assert.deepEqual(await readdir("public/memes/thumb"), []);
    assert.equal(
      (await prisma.meme.findUniqueOrThrow({ where: { id: item.id } })).status,
      "PENDING",
    );
  } finally {
    await prisma.$executeRawUnsafe("DROP TRIGGER reject_update");
  }
});

test("a disguised non-image upload is rejected before writing anything", async () => {
  const body = new FormData();
  body.set(
    "file",
    new File(["this is not a png"], "fake.png", { type: "image/png" }),
  );
  const res = await upload.POST(
    new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { cookie },
      body,
    }),
  );
  assert.equal(res.status, 400);
  assert.equal(await prisma.meme.count(), 0);
  assert.deepEqual(await readdir("public/uploads"), []);
});

test("invalid external JSON types receive client errors across admin mutations", async () => {
  const params = await import("../app/api/admin/params/route");
  const password = await import("../app/api/admin/password/route");
  const tag = await import("../app/api/admin/tags/[id]/route");
  const merge = await import("../app/api/admin/tags/merge/route");
  const responses = [
    await login.POST(request({ user: 12, pass: [] }, "POST")),
    await review.PATCH(request(null), { params: Promise.resolve({ id: "x" }) }),
    await manage.PATCH(request({ tags: [12] }), { params: Promise.resolve({ id: "x" }) }),
    await batch.POST(request({ action: "delete", ids: [12] }, "POST")),
    await params.PATCH(request("bad")),
    await params.PATCH(request({ updates: { constructor: 10 } })),
    await password.POST(request({ newPass: 1234, confirmPass: 1234 }, "POST")),
    await tag.PATCH(request({ name: 12 }), { params: Promise.resolve({ id: "x" }) }),
    await merge.POST(request({ from: [], to: "x" }, "POST")),
  ];
  assert.deepEqual(
    responses.map((x) => x.status),
    Array(responses.length).fill(400),
  );
});

test("public counts reject hidden or missing memes and update both published totals", async () => {
  const copy = await import("../app/api/memes/[id]/copy/route");
  const download = await import("../app/api/memes/[id]/download/route");
  await meme("public");
  await meme("private");
  await prisma.meme.update({
    where: { id: "private" },
    data: { status: "HIDDEN" },
  });
  for (const route of [copy, download]) {
    for (const id of ["private", "missing"])
      assert.equal(
        (await route.POST(request({}, "POST"), { params: Promise.resolve({ id }) })).status,
        404,
      );
    assert.equal(
      (await route.POST(request({}, "POST"), { params: Promise.resolve({ id: "public" }) }))
        .status,
      200,
    );
  }
  const saved = await prisma.meme.findUniqueOrThrow({
    where: { id: "public" },
  });
  assert.deepEqual([saved.copies, saved.downloads], [1, 1]);
  const daily = await prisma.memeDailyStat.findFirstOrThrow({
    where: { memeId: "public" },
  });
  assert.deepEqual([daily.copies, daily.downloads], [1, 1]);
  assert.equal(
    await prisma.memeDailyStat.count({ where: { memeId: "private" } }),
    0,
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

test("renaming by numeric ID updates a preview that shares the original", async () => {
  await prisma.meme.create({
    data: {
      id: "rename",
      numId: 7,
      type: "STATIC",
      mediaUrl: "/memes/original/old.png",
      thumbUrl: "/memes/original/old.png",
    },
  });
  await writeFile("public/memes/original/old.png", image);
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      path.join(root, "prisma/rename-media-by-numid.ts"),
    ],
    { cwd: fixture, env: process.env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const saved = await prisma.meme.findUniqueOrThrow({
    where: { id: "rename" },
  });
  assert.equal(saved.mediaUrl, "/memes/original/7.png");
  assert.equal(saved.thumbUrl, saved.mediaUrl);
  assert.deepEqual(await readFile(path.join("public", saved.mediaUrl)), image);
});

test("animated previews preserve unequal frame delays and finite loop count", async () => {
  const { generateAnimatedThumb } = await import("../lib/thumbs");
  const source = path.join(fixture, "animation.gif");
  const output = path.join(fixture, "preview.gif");
  await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
    raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
  })
    .gif({ delay: [120, 340], loop: 3 })
    .toFile(source);
  await generateAnimatedThumb(source, output);
  const metadata = await sharp(output, { animated: true }).metadata();
  assert.deepEqual(metadata.delay, [120, 340]);
  assert.equal(metadata.loop, 3);
});
