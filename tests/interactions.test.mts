import { before, test } from "node:test";
import {
  assert,
  prisma,
  meme,
  image,
  writeFile,
  cookie,
  manage,
  request,
} from "./helpers/fixture.mts";
const { createVisitor, VISITOR_COOKIE, tokenDigest, recordVisit } =
  await import("../lib/visitors");
const copy = await import("../app/api/memes/[id]/copy/route");
const download = await import("../app/api/memes/[id]/download/route");
let visitor: string;
before(async () => {
  visitor = await createVisitor();
});
const context = { params: Promise.resolve({ id: "interaction" }) };
function req(
  body: unknown,
  token = visitor,
  method = "POST",
  url = "http://localhost/api/test",
) {
  return new Request(url, {
    method,
    headers: {
      cookie: `${cookie}; ${VISITOR_COOKIE}=${token}`,
      "Content-Type": "application/json",
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}
async function picture() {
  await meme("interaction");
  await writeFile("data/memes/original/interaction.png", image);
}

test("visits count requests but unique visitors are deduplicated per day", async () => {
  const first = tokenDigest(visitor);
  const second = tokenDigest(await createVisitor());
  const day = new Date("2026-10-23T12:00:00Z");
  await Promise.all([
    recordVisit(first, day),
    recordVisit(first, day),
    recordVisit(second, day),
  ]);
  const stats = await prisma.siteDailyStat.findUniqueOrThrow({
    where: { day: "2026-10-23" },
  });
  assert.equal(stats.visits, 3);
  assert.equal(stats.visitors, 2);
  await recordVisit(first, new Date("2026-10-24T12:00:00Z"));
  assert.equal(
    (
      await prisma.siteDailyStat.findUniqueOrThrow({
        where: { day: "2026-10-24" },
      })
    ).visitors,
    1,
  );
});

test("copy requires a matching visitor grant and consumes it exactly once under contention", async () => {
  await picture();
  assert.equal((await copy.POST(req({}), context)).status, 400);
  const prepared = await copy.POST(req({ action: "prepare" }), context);
  assert.equal(prepared.status, 200);
  const { token } = await prepared.json();
  assert.equal(
    (await prisma.meme.findUniqueOrThrow({ where: { id: "interaction" } }))
      .copies,
    0,
  );
  assert.equal(
    (await copy.POST(req({ token }, await createVisitor()), context)).status,
    403,
  );
  const responses = await Promise.all([
    copy.POST(req({ token }), context),
    copy.POST(req({ token }), context),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal(
    (await prisma.meme.findUniqueOrThrow({ where: { id: "interaction" } }))
      .copies,
    1,
  );
  assert.equal(
    (await copy.POST(req({ action: "prepare" }), context)).status,
    429,
  );
});

test("expired and hidden-image grants do not increment statistics", async () => {
  await picture();
  const prepared = await copy.POST(req({ action: "prepare" }), context);
  const { token } = await prepared.json();
  await prisma.interactionGrant.update({
    where: { tokenHash: tokenDigest(token) },
    data: { expiresAt: new Date(0) },
  });
  assert.equal((await copy.POST(req({ token }), context)).status, 403);
  await prisma.interactionGrant.update({
    where: { tokenHash: tokenDigest(token) },
    data: { expiresAt: new Date(Date.now() + 60000) },
  });
  await prisma.meme.update({
    where: { id: "interaction" },
    data: { status: "HIDDEN" },
  });
  assert.equal((await copy.POST(req({ token }), context)).status, 404);
  assert.equal(await prisma.memeDailyStat.count(), 0);
});

test("download is counted after its complete body, not when a grant is issued", async () => {
  await picture();
  const prepared = await download.POST(req({}), context);
  const { url } = await prepared.json();
  assert.equal(
    (await prisma.meme.findUniqueOrThrow({ where: { id: "interaction" } }))
      .downloads,
    0,
  );
  const response = await download.GET(
    req(null, visitor, "GET", `http://localhost${url}`),
    context,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition")!, /^attachment;/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  assert.equal(
    (await prisma.meme.findUniqueOrThrow({ where: { id: "interaction" } }))
      .downloads,
    1,
  );
  assert.equal(
    (
      await download.GET(
        req(null, visitor, "GET", `http://localhost${url}`),
        context,
      )
    ).status,
    409,
  );
});

test("canceled downloads do not count and deleting images retains historical activity", async () => {
  await picture();
  const { url } = await (await download.POST(req({}), context)).json();
  const response = await download.GET(
    req(null, visitor, "GET", `http://localhost${url}`),
    context,
  );
  await response.body!.cancel();
  assert.equal(
    (await prisma.meme.findUniqueOrThrow({ where: { id: "interaction" } }))
      .downloads,
    0,
  );
  const { token } = await (
    await copy.POST(req({ action: "prepare" }), context)
  ).json();
  assert.equal((await copy.POST(req({ token }), context)).status, 200);
  assert.equal(
    (await manage.PATCH(request({ action: "delete" }), context)).status,
    200,
  );
  assert.equal((await prisma.memeDailyStat.findFirstOrThrow()).copies, 1);
  const traffic = await import("../app/api/admin/traffic/route");
  const report = await (
    await traffic.GET(
      new Request("http://localhost/api/admin/traffic?range=all", {
        headers: { cookie },
      }),
    )
  ).json();
  assert.equal(
    report.daily.reduce(
      (sum: number, row: { heat: number }) => sum + row.heat,
      0,
    ),
    1,
  );
});
