import { mkdtemp } from "node:fs/promises";
import { test } from "node:test";
import {
  assert,
  prisma,
  upload,
  review,
  manage,
  cookie,
  image,
  request,
  uploadRequest,
  meme,
  root,
  fixture,
  sharp,
  path,
  spawnSync,
  readFile,
  readdir,
  writeFile,
} from "./helpers/fixture.mts";

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
  await writeFile("data/memes/original/same.gif", "ORIGINAL");
  await writeFile("data/memes/thumb/same.gif", "THUMB");
  await prisma.$executeRawUnsafe(
    "CREATE TRIGGER reject_delete BEFORE DELETE ON Meme BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  const res = await manage.PATCH(request({ action: "delete" }), {
    params: Promise.resolve({ id: "same" }),
  });
  assert.equal(res.status, 500);
  assert.equal(
    await readFile("data/memes/original/same.gif", "utf8"),
    "ORIGINAL",
  );
  assert.equal(await readFile("data/memes/thumb/same.gif", "utf8"), "THUMB");
  assert.equal(await prisma.meme.count(), 1);
});

test("upload rolls back its file when the database rejects the record", async () => {
  await prisma.$executeRawUnsafe(
    "CREATE TRIGGER reject_insert BEFORE INSERT ON Meme BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  const res = await upload.POST(uploadRequest());
  assert.equal(res.status, 500);
  assert.deepEqual(await readdir("data/uploads"), []);
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
    review.PATCH(request({ status: "PUBLISHED" }), {
      params: Promise.resolve({ id: item.id }),
    }),
    review.PATCH(request({ status: "PUBLISHED" }), {
      params: Promise.resolve({ id: item.id }),
    }),
    resources.POST(request({ action: "cleanup" }, "POST")),
  ]);
  assert.deepEqual(
    responses
      .slice(0, 2)
      .map((response) => response.status)
      .sort(),
    [200, 400],
  );
  assert.equal(responses[2].status, 200);
  const saved = await prisma.meme.findUniqueOrThrow({ where: { id: item.id } });
  assert.equal(saved.status, "PUBLISHED");
  assert.deepEqual(await readFile(path.join("data", saved.mediaUrl)), image);
  assert.equal(
    (await sharp(path.join("data", saved.thumbUrl)).metadata()).format,
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
    assert.deepEqual(await readFile(path.join("data", item.mediaUrl)), image);
    assert.deepEqual(await readdir("data/memes/original"), []);
    assert.deepEqual(await readdir("data/memes/thumb"), []);
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
  assert.deepEqual(await readdir("data/uploads"), []);
});

test("public counts reject hidden or missing memes and update both published totals", async () => {
  const copy = await import("../app/api/memes/[id]/copy/route");
  const download = await import("../app/api/memes/[id]/download/route");
  const { createVisitor, VISITOR_COOKIE } = await import("../lib/visitors");
  const visitor = await createVisitor();
  const headers = {
    cookie: `${cookie}; ${VISITOR_COOKIE}=${visitor}`,
    "Content-Type": "application/json",
  };
  const send = (body: unknown) =>
    new Request("http://localhost/api/test", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  await meme("data");
  await writeFile("data/memes/original/data.png", image);
  await meme("private");
  await prisma.meme.update({
    where: { id: "private" },
    data: { status: "HIDDEN" },
  });
  for (const route of [copy, download]) {
    for (const id of ["private", "missing"])
      assert.equal(
        (
          await route.POST(send({ action: "prepare" }), {
            params: Promise.resolve({ id }),
          })
        ).status,
        404,
      );
    const context = { params: Promise.resolve({ id: "data" }) };
    const prepared = await route.POST(send({ action: "prepare" }), context);
    assert.equal(prepared.status, 200);
    const data = await prepared.json();
    if (route === copy)
      assert.equal(
        (await copy.POST(send({ token: data.token }), context)).status,
        200,
      );
    else {
      const response = await download.GET(
        new Request(`http://localhost${data.url}`, { headers }),
        context,
      );
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
  }
  const row = await prisma.meme.findUniqueOrThrow({ where: { id: "data" } });
  assert.equal(row.copies, 1);
  assert.equal(row.downloads, 1);
  const stats = await prisma.memeDailyStat.findFirstOrThrow();
  assert.equal(stats.copies, 1);
  assert.equal(stats.downloads, 1);
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
  await writeFile("data/memes/original/old.png", image);
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
  assert.deepEqual(await readFile(path.join("data", saved.mediaUrl)), image);
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

test("deleting one record preserves files referenced by another record", async () => {
  await meme("shared-a");
  await meme("shared-b");
  await prisma.meme.updateMany({
    data: { thumbUrl: "/memes/thumb/shared.jpg" },
  });
  await writeFile("data/memes/thumb/shared.jpg", image);
  assert.equal(
    (
      await manage.PATCH(request({ action: "delete" }), {
        params: Promise.resolve({ id: "shared-a" }),
      })
    ).status,
    200,
  );
  assert.deepEqual(await readFile("data/memes/thumb/shared.jpg"), image);
  assert.equal(
    (
      await manage.PATCH(request({ action: "delete" }), {
        params: Promise.resolve({ id: "shared-b" }),
      })
    ).status,
    200,
  );
  await assert.rejects(readFile("data/memes/thumb/shared.jpg"), {
    code: "ENOENT",
  });
});

test("media enforces visibility before conditional requests and HEAD streams no body", async () => {
  const { mediaResponse } = await import("../lib/mediaResponse");
  await meme("visible");
  await writeFile("data/memes/original/visible.png", image);
  const url = "http://localhost/memes/original/visible.png";
  const first = await mediaResponse(
    new Request(url),
    "original",
    "visible.png",
  );
  assert.equal(first.status, 200);
  assert.deepEqual(Buffer.from(await first.arrayBuffer()), image);
  const head = await mediaResponse(
    new Request(url, { method: "HEAD" }),
    "original",
    "visible.png",
  );
  assert.equal(head.headers.get("content-length"), String(image.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const cached = new Request(url, {
    headers: { "if-none-match": first.headers.get("etag")! },
  });
  assert.equal(
    (await mediaResponse(cached, "original", "visible.png")).status,
    304,
  );
  await prisma.meme.update({
    where: { id: "visible" },
    data: { status: "HIDDEN" },
  });
  assert.equal(
    (await mediaResponse(cached, "original", "visible.png")).status,
    404,
  );
  const privateImage = await mediaResponse(
    new Request(url, { headers: { cookie } }),
    "original",
    "visible.png",
  );
  assert.equal(privateImage.status, 200);
  assert.equal(privateImage.headers.get("cache-control"), "private, no-store");
  await privateImage.arrayBuffer();
  assert.equal(
    (
      await mediaResponse(
        new Request(url, { headers: { cookie } }),
        "original",
        "../test.png",
      )
    ).status,
    404,
  );
  await writeFile("data/uploads/runtime.png", image);
  assert.equal(
    (await mediaResponse(new Request(url), "uploads", "runtime.png")).status,
    404,
  );
  const preview = await mediaResponse(
    new Request(url, { headers: { cookie } }),
    "uploads",
    "runtime.png",
  );
  assert.equal(preview.status, 200);
  await preview.arrayBuffer();
});

test("thumbnail backfill handles same-base files and animated WebP", async () => {
  await writeFile("data/memes/original/collision.png", image);
  await sharp(image).jpeg().toFile("data/memes/original/collision.jpg");
  await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
    raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
  })
    .webp({ delay: [120, 340], loop: 2 })
    .toFile("data/memes/original/animation.webp");
  for (const name of ["collision.png", "collision.jpg", "animation.webp"]) {
    await prisma.meme.create({
      data: {
        id: name,
        type: "STATIC",
        mediaUrl: `/memes/original/${name}`,
        thumbUrl: `/memes/original/${name}`,
      },
    });
  }
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      path.join(root, "prisma/backfill-thumbs.ts"),
    ],
    { cwd: fixture, env: process.env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const rows = await prisma.meme.findMany();
  assert.equal(new Set(rows.map((row) => row.thumbUrl)).size, 3);
  const animated = rows.find((row) => row.id === "animation.webp")!;
  assert.equal(animated.type, "ANIMATED");
  assert.equal(
    (
      await sharp(path.join("data", animated.thumbUrl), {
        animated: true,
      }).metadata()
    ).pages,
    2,
  );
});

test("title tag backfill obeys the configured maximum", async () => {
  const { updateAppConfig, getAppConfig } = await import(
    "../lib/appConfig"
  );
  const original = await getAppConfig();
  await meme("title-tags");
  await prisma.meme.update({
    where: { id: "title-tags" },
    data: { title: "对称快速慢速跳动" },
  });
  try {
    await updateAppConfig({ maxTags: 2 });
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "node_modules/tsx/dist/cli.mjs"),
        path.join(root, "prisma/backfill-title-tags.ts"),
      ],
      { cwd: fixture, env: process.env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await prisma.memeTag.count(), 2);
  } finally {
    await updateAppConfig(original);
  }
});

test("imported filenames with consecutive dots remain readable and deletable", async () => {
  const { mediaResponse } = await import("../lib/mediaResponse");
  await meme("dots");
  const url = "/memes/original/hello..world.png";
  await prisma.meme.update({
    where: { id: "dots" },
    data: { mediaUrl: url, thumbUrl: url },
  });
  await writeFile("data/memes/original/hello..world.png", image);
  const response = await mediaResponse(
    new Request(`http://localhost${url}`),
    "original",
    "hello..world.png",
  );
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  assert.equal(
    (
      await manage.PATCH(request({ action: "delete" }), {
        params: Promise.resolve({ id: "dots" }),
      })
    ).status,
    200,
  );
  await assert.rejects(readFile("data/memes/original/hello..world.png"), {
    code: "ENOENT",
  });
  const absent = await mediaResponse(
    new Request(`http://localhost${url}`),
    "original",
    "hello..world.png",
  );
  assert.equal(absent.status, 404);
  assert.equal(absent.headers.get("cache-control"), "no-store");
});

test("import rejects corrupt image pixels before replacing existing records", async () => {
  await meme("keep-on-bad-import");
  const broken = Buffer.from(image);
  broken[broken.indexOf(Buffer.from("IDAT")) + 4] = 0;
  await writeFile("data/memes/original/broken.png", broken);
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      path.join(root, "prisma/seed.ts"),
    ],
    { cwd: fixture, env: process.env, encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.equal((await prisma.meme.findMany())[0].id, "keep-on-bad-import");
});
