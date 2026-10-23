import path from "node:path";
import { spawnSync } from "node:child_process";
import { root } from "./helpers/fixture.mts";
import { test } from "node:test";
import { assert, prisma, cookie, setCookie } from "./helpers/fixture.mts";

test("sessions use random tokens, enforce server expiry, and revoke on logout", async () => {
  const sessions = await import("../src/lib/adminSession");
  const logout = await import("../src/app/api/admin/logout/route");
  const credential = (await sessions.getAdminCredential())!;
  const first = await sessions.createAdminSession(credential, 60);
  const second = await sessions.createAdminSession(credential, 60);
  assert.notEqual(first, second);
  assert.equal(await sessions.isAdminSessionValid(first), true);
  assert.equal(
    await sessions.isAdminSessionValid(
      Buffer.from(`${credential.user}:${credential.passHash}`).toString(
        "base64",
      ),
    ),
    false,
  );
  assert.equal(
    await sessions.isAdminSessionValid(
      Buffer.from(`${credential.user}:${process.env.REVIEW_PASS}`).toString(
        "base64",
      ),
    ),
    false,
  );
  await logout.POST(
    new Request("http://localhost/api/admin/logout", {
      method: "POST",
      headers: { cookie: `admin_session=${first}` },
    }),
  );
  assert.equal(await sessions.isAdminSessionValid(first), false);
  assert.equal(await sessions.isAdminSessionValid(second), true);
  const expired = await sessions.createAdminSession(credential, -1);
  assert.equal(await sessions.isAdminSessionValid(expired), false);
  const rows = await prisma.adminSession.findMany();
  assert.ok(
    rows.every((row) => row.tokenHash !== first && row.tokenHash !== second),
  );
});

test("malformed cookies are unauthorized and cookies without spaces still parse", async () => {
  const { requireAdmin } = await import("../src/lib/adminAuth");
  const bad = await requireAdmin(
    new Request("http://localhost", {
      headers: { cookie: "admin_session=%E0%A4%A" },
    }),
  );
  assert.equal(bad.ok, false);
  assert.equal(
    (
      await requireAdmin(
        new Request("http://localhost", {
          headers: { cookie: `other=x;${cookie}` },
        }),
      )
    ).ok,
    true,
  );
});

test("a forged cookie cannot bypass API limits and cross-site writes are rejected", async () => {
  const { proxy } = await import("../src/proxy");
  const { NextRequest } = await import("next/server");
  let response: Response | undefined;
  for (let i = 0; i < 121; i++) {
    response = await proxy(
      new NextRequest("http://localhost/api/memes", {
        headers: {
          cookie: "admin_session=forged",
          "x-real-ip": "test-rate-client",
        },
      }),
    );
  }
  assert.equal(response!.status, 429);
  const crossSite = await proxy(
    new NextRequest("http://localhost/api/upload", {
      method: "POST",
      headers: { origin: "https://other.example" },
    }),
  );
  assert.equal(crossSite.status, 403);
});

test("changing a password revokes every existing session", async () => {
  const sessions = await import("../src/lib/adminSession");
  const credential = (await sessions.getAdminCredential())!;
  const token = await sessions.createAdminSession(credential, 60);
  try {
    await sessions.updateAdminPassword(token, "a-new-test-password", 60);
    assert.equal(await sessions.isAdminSessionValid(token), false);
    assert.equal(
      (
        await sessions.verifyAdminPassword(
          credential.user,
          "a-new-test-password",
        )
      ).ok,
      true,
    );
    assert.equal(
      (
        await sessions.verifyAdminPassword(
          credential.user,
          process.env.REVIEW_PASS!,
        )
      ).ok,
      false,
    );
  } finally {
    await prisma.adminCredential.deleteMany();
    setCookie(
      `admin_session=${await sessions.createAdminSession((await sessions.getAdminCredential())!, 60)}`,
    );
  }
});

test("credentials changed by another process are visible to session validation immediately", async () => {
  const sessions = await import("../src/lib/adminSession");
  await sessions.getAdminCredential();
  const program = `const sessions = require(${JSON.stringify(path.join(root, "src/lib/adminSession.ts"))});
    (async () => { const changed = await sessions.updateAdminPassword(${JSON.stringify(cookie.split("=")[1])}, "external-test-password", 60);
    console.log(changed.token); })().catch(error => { console.error(error); process.exitCode = 1; });`;
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "node_modules/tsx/dist/cli.mjs"), "--eval", program],
      { cwd: root, env: process.env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await sessions.isAdminSessionValid(result.stdout.trim()),
      true,
    );
  } finally {
    await prisma.adminCredential.deleteMany();
    await prisma.adminSession.deleteMany();
    setCookie(
      `admin_session=${await sessions.createAdminSession((await sessions.getAdminCredential())!, 60)}`,
    );
  }
});

test("simultaneous password changes allow one winner and a stale login cannot create a session", async () => {
  const sessions = await import("../src/lib/adminSession");
  const credential = (await sessions.getAdminCredential())!;
  const token = await sessions.createAdminSession(credential, 60);
  try {
    const results = await Promise.all([
      sessions.updateAdminPassword(token, "first-password", 60),
      sessions.updateAdminPassword(token, "second-password", 60),
    ]);
    assert.deepEqual(results.map((result) => result.ok).sort(), [false, true]);
    await assert.rejects(
      sessions.createAdminSession(credential, 60),
      sessions.StaleCredentialError,
    );
    assert.equal(await prisma.adminSession.count(), 1);
  } finally {
    await prisma.adminCredential.deleteMany();
    setCookie(
      `admin_session=${await sessions.createAdminSession((await sessions.getAdminCredential())!, 60)}`,
    );
  }
});

test("homepage prefetch and forged visitor headers do not produce visits", async () => {
  const { proxy } = await import("../src/proxy");
  const { NextRequest } = await import("next/server");
  for (const header of [
    "next-router-prefetch",
    "next-router-segment-prefetch",
  ]) {
    const response = await proxy(
      new NextRequest("http://localhost/", {
        headers: { [header]: "1", "x-molworld-visitor": "forged" },
      }),
    );
    assert.equal(
      response.headers.get("x-middleware-request-x-molworld-visitor"),
      null,
    );
    assert.equal(response.headers.get("set-cookie"), null);
  }
  const actual = await proxy(
    new NextRequest("http://localhost/", {
      headers: { "x-molworld-visitor": "forged" },
    }),
  );
  assert.match(
    actual.headers.get("x-middleware-request-x-molworld-visitor")!,
    /^[a-f0-9]{64}$/,
  );
  assert.match(actual.headers.get("set-cookie")!, /molworld_visitor=/);
});
