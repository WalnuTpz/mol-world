import assert from "node:assert/strict";
import { before, beforeEach, after, afterEach } from "node:test";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const root = fileURLToPath(new URL("../..", import.meta.url));
const fixture = mkdtempSync(path.join(tmpdir(), "mol-world-test-"));
process.env.DATABASE_URL = `file:${path.join(fixture, "test.db")}`;
process.env.REVIEW_USER = "test-admin";
process.env.REVIEW_PASS = "test-password-only";
process.env.TSX_TSCONFIG_PATH = path.join(root, "tsconfig.json");
process.chdir(fixture);
await writeFile(path.join(fixture, "test.db"), "");
const migration = spawnSync(
  process.execPath,
  [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
  { cwd: root, env: process.env, encoding: "utf8" },
);
assert.equal(migration.status, 0, migration.stderr);

const { prisma } = await import("../../src/lib/db");
const login = await import("../../src/app/api/admin/login/route");
const upload = await import("../../src/app/api/upload/route");
const review = await import("../../src/app/api/review/[id]/route");
const manage = await import("../../src/app/api/manage/[id]/route");
const batch = await import("../../src/app/api/manage/batch/route");
const { ensureDailyPools } = await import("../../src/lib/dailyPool");
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
  await prisma.memeDailyStat.deleteMany();
  await prisma.siteDailyStat.deleteMany();
  await prisma.siteDailyVisitor.deleteMany();
  await prisma.interactionGrant.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.memeTag.deleteMany();
  await prisma.meme.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.dailyPool.deleteMany();
  await rm(path.join(fixture, "data"), { recursive: true, force: true });
  for (const dir of ["uploads", "memes/original", "memes/thumb"])
    await mkdir(path.join(fixture, "data", dir), { recursive: true });
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

export {
  assert,
  prisma,
  login,
  upload,
  review,
  manage,
  batch,
  ensureDailyPools,
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
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
};
export function setCookie(value: string) {
  cookie = value;
}
