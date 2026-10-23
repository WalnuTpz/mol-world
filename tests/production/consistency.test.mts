import { test } from "node:test";
import type { Sharp } from "sharp";
import { createRequire } from "node:module";
import {
  assert,
  prisma,
  upload,
  uploadRequest,
  request,
  root,
  path,
  sharp,
  readFile,
  image,
} from "../helpers/fixture.mts";
const require = createRequire(import.meta.url);

test("production route bundles serialize publication with resource cleanup", async () => {
  const reviewModule = require(
    path.join(root, ".next/server/app/api/review/[id]/route.js"),
  ).routeModule;
  const resourceModule = require(
    path.join(root, ".next/server/app/api/admin/resources/route.js"),
  ).routeModule;
  await reviewModule.ensureUserland();
  await resourceModule.ensureUserland();
  await upload.POST(uploadRequest());
  const item = await prisma.meme.findFirstOrThrow();
  const original = sharp.prototype.toFile;
  let arrived!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  sharp.prototype.toFile = async function (
    this: Sharp,
    ...args: Parameters<typeof original>
  ) {
    arrived();
    await gate;
    return original.apply(this, args);
  } as typeof original;
  let cleanedWhilePublishing = false;
  const publish = reviewModule.userland.PATCH(
    request({ status: "PUBLISHED" }),
    { params: Promise.resolve({ id: item.id }) },
  );
  try {
    await ready;
    const cleanup = resourceModule.userland
      .POST(request({ action: "cleanup" }, "POST"))
      .then((res: Response) => {
        cleanedWhilePublishing = true;
        return res;
      });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const raced = cleanedWhilePublishing;
    release();
    const results = await Promise.all([publish, cleanup]);
    assert.equal(
      raced,
      false,
      "cleanup ran while publication had uncommitted files",
    );
    assert.deepEqual(
      results.map((r) => r.status),
      [200, 200],
    );
    const saved = await prisma.meme.findUniqueOrThrow({
      where: { id: item.id },
    });
    assert.deepEqual(await readFile(path.join("data", saved.mediaUrl)), image);
  } finally {
    release();
    await publish;
    sharp.prototype.toFile = original;
  }
});
