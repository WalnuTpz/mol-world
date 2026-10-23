import { test } from "node:test";
import {
  assert,
  prisma,
  meme,
  image,
  writeFile,
  readFile,
  readdir,
  root,
  fixture,
  path,
  spawnSync,
  cookie,
  setCookie,
} from "./helpers/fixture.mts";

function runScript(name: string) {
  return spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      path.join(root, "scripts", name),
    ],
    { cwd: fixture, env: process.env, encoding: "utf8" },
  );
}

test("numeric renaming preserves every reference to shared originals and previews", async () => {
  await meme("shared-first");
  await meme("shared-second");
  await prisma.meme.updateMany({
    data: {
      mediaUrl: "/memes/original/shared.png",
      thumbUrl: "/memes/original/shared.png",
    },
  });
  await prisma.meme.update({
    where: { id: "shared-first" },
    data: { numId: 1 },
  });
  await prisma.meme.update({
    where: { id: "shared-second" },
    data: { numId: 2 },
  });
  await writeFile("data/memes/original/shared.png", image);
  const result = runScript("rename-media-by-numid.ts");
  assert.equal(result.status, 0, result.stderr);
  for (const row of await prisma.meme.findMany()) {
    assert.deepEqual(await readFile(path.join("data", row.mediaUrl)), image);
    assert.deepEqual(await readFile(path.join("data", row.thumbUrl)), image);
  }
});

test("thumbnail backfill updates all records sharing an original", async () => {
  await meme("shared-first");
  await meme("shared-second");
  await prisma.meme.updateMany({
    data: {
      mediaUrl: "/memes/original/shared.png",
      thumbUrl: "/memes/original/shared.png",
    },
  });
  await writeFile("data/memes/original/shared.png", image);
  const result = runScript("backfill-thumbs.ts");
  assert.equal(result.status, 0, result.stderr);
  for (const row of await prisma.meme.findMany()) {
    assert.ok(row.thumbUrl.startsWith("/memes/thumb/"));
    assert.ok((await readFile(path.join("data", row.thumbUrl))).length > 0);
  }
});

test("thumbnail database failure removes the newly generated file", async () => {
  await meme("backfill");
  await writeFile("data/memes/original/backfill.png", image);
  await prisma.$executeRawUnsafe(
    "CREATE TRIGGER reject_update BEFORE UPDATE ON Meme BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  try {
    const result = runScript("backfill-thumbs.ts");
    assert.notEqual(result.status, 0);
    assert.deepEqual(await readdir("data/memes/thumb"), []);
    assert.deepEqual(await readFile("data/memes/original/backfill.png"), image);
  } finally {
    await prisma.$executeRawUnsafe("DROP TRIGGER reject_update");
  }
});

test("an installation without DATABASE_URL retains its original database default", async () => {
  const { resolveDatabaseUrl } = await import("../src/lib/databaseUrl");
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.equal(
      resolveDatabaseUrl(),
      `file:${path.join(fixture, "prisma/dev.db")}`,
    );
  } finally {
    process.env.DATABASE_URL = saved;
  }
});

test("a password request cannot change credentials after its session is revoked while reading the body", async () => {
  const password = await import("../src/app/api/admin/password/route");
  const sessions = await import("../src/lib/adminSession");
  let body!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      body = controller;
    },
  });
  const pending = password.POST(
    new Request("http://localhost/api/admin/password", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  await sessions.revokeAdminSession(cookie.split("=")[1]);
  body.enqueue(
    new TextEncoder().encode(
      JSON.stringify({
        newPass: "unexpected-password",
        confirmPass: "unexpected-password",
      }),
    ),
  );
  body.close();
  try {
    assert.equal((await pending).status, 401);
    assert.equal(await prisma.adminCredential.count(), 0);
  } finally {
    await prisma.adminCredential.deleteMany();
    setCookie(
      `admin_session=${await sessions.createAdminSession((await sessions.getAdminCredential())!, 60)}`,
    );
  }
});

test("startup refuses legacy public media that would bypass private file authorization", async () => {
  const { assertPrivateMediaStorage } = await import(
    "../src/lib/storageLayout"
  );
  const { mkdir, rm } = await import("node:fs/promises");
  await mkdir("public/uploads", { recursive: true });
  try {
    await assertPrivateMediaStorage();
    await writeFile("public/uploads/private.png", image);
    await assert.rejects(assertPrivateMediaStorage(), /Legacy media remains/);
  } finally {
    await rm("public", { recursive: true, force: true });
  }
});

test("special imported filenames survive API serialization and media authorization", async () => {
  const name = "猫#10?20%.png";
  await meme("special");
  const url = `/memes/original/${name}`;
  await prisma.meme.update({
    where: { id: "special" },
    data: { mediaUrl: url, thumbUrl: url },
  });
  await writeFile(path.join("data/memes/original", name), image);
  const expected = `/memes/original/${encodeURIComponent(name)}`;
  for (const endpoint of [
    await import("../src/app/api/memes/route"),
    await import("../src/app/api/memes/hot/route"),
    await import("../src/app/api/manage/route"),
    await import("../src/app/api/search/route"),
  ]) {
    const response = await endpoint.GET(
      new Request("http://localhost/api/test?q=Original", {
        headers: { cookie },
      }),
    );
    const json = await response.json();
    assert.equal(json.items[0].mediaUrl, expected);
    assert.equal(json.items[0].thumbUrl, expected);
  }
  const { mediaResponse } = await import("../src/lib/mediaResponse");
  const response = await mediaResponse(
    new Request(`http://localhost${expected}`),
    "original",
    decodeURIComponent(
      new URL(`http://localhost${expected}`).pathname.split("/").at(-1)!,
    ),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
});

test("a media mutation queued behind another worker rechecks a revoked session", async () => {
  const { withMediaWrite } = await import("../src/lib/mediaFiles");
  const { revokeAdminSession, createAdminSession, getAdminCredential } =
    await import("../src/lib/adminSession");
  const manage = await import("../src/app/api/manage/[id]/route");
  await meme("queued");
  let release!: () => void;
  let arrived!: () => void;
  const ready = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = withMediaWrite(async () => {
    arrived();
    await gate;
  });
  await ready;
  const pending = manage.PATCH(
    new Request("http://localhost/api/manage/queued", {
      method: "PATCH",
      headers: { cookie },
      body: JSON.stringify({ title: "unauthorized edit" }),
    }),
    { params: Promise.resolve({ id: "queued" }) },
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await revokeAdminSession(cookie.split("=")[1]);
    release();
    assert.equal((await pending).status, 401);
    assert.equal(
      (await prisma.meme.findUniqueOrThrow({ where: { id: "queued" } })).title,
      "Original title",
    );
  } finally {
    release();
    await held;
    await pending;
    setCookie(
      `admin_session=${await createAdminSession((await getAdminCredential())!, 60)}`,
    );
  }
});

test("deleting a legal long imported filename does not strand its recovery journal", async () => {
  const { manage, request } = await import("./helpers/fixture.mts");
  const filename = `${"x".repeat(245)}.png`;
  await meme("long-name");
  const url = `/memes/original/${filename}`;
  await writeFile(path.join("data/memes/original", filename), image);
  await prisma.meme.update({
    where: { id: "long-name" },
    data: { mediaUrl: url, thumbUrl: url },
  });
  const response = await manage.PATCH(request({ action: "delete" }), {
    params: Promise.resolve({ id: "long-name" }),
  });
  assert.equal(response.status, 200);
  assert.equal(await prisma.mediaOperation.count(), 0);
  assert.equal((await readdir("data/trash")).length, 1);
  assert.deepEqual(await readdir("data/memes/original"), []);
});
