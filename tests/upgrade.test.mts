import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  cp,
  mkdir,
  readdir,
  rm,
  rename,
  symlink,
  writeFile,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { scryptSync } from "node:crypto";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
test("a populated legacy installation upgrades in place, preserves data and can upload after repeated migrations", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "mol-world-upgrade-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    TSX_TSCONFIG_PATH: path.join(dir, "tsconfig.json"),
  };
  delete env.DATABASE_URL;
  delete env.REVIEW_USER;
  delete env.REVIEW_PASS;
  const run = (args: string[]) =>
    spawnSync(process.execPath, args, {
      cwd: dir,
      env,
      encoding: "utf8",
      timeout: 60_000,
    });
  try {
    for (const name of [
      "app",
      "lib",
      "components",
      "proxy.ts",
      "instrumentation.ts",
      "prisma",
      "prisma.config.ts",
      "tsconfig.json",
      "package.json",
    ])
      await cp(path.join(root, name), path.join(dir, name), {
        recursive: true,
        filter: (source) =>
          !source.endsWith(".db") && !source.endsWith(".lock"),
      });
    await symlink(
      path.join(root, "node_modules"),
      path.join(dir, "node_modules"),
      "dir",
    );
    for (const entry of await readdir(path.join(dir, "prisma/migrations")))
      if (entry.startsWith("202610"))
        await rm(path.join(dir, "prisma/migrations", entry), {
          recursive: true,
        });
    // Production must select the legacy database, even when .env points elsewhere.
    await writeFile(path.join(dir, ".env"), 'DATABASE_URL="file:./wrong.db"\n');
    await writeFile(
      path.join(dir, ".env.production"),
      'DATABASE_URL="file:./prisma/legacy.db"\nREVIEW_USER="unused-env"\nREVIEW_PASS="unused-env-pass"\n',
    );
    await writeFile(path.join(dir, "prisma/legacy.db"), "");
    let result = run([
      path.join(root, "node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const image = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    for (const name of ["memes/original", "memes/thumb", "uploads", "trash"])
      await mkdir(path.join(dir, "public", name), { recursive: true });
    await writeFile(path.join(dir, "public/memes/original/猫#10%.png"), image);
    await writeFile(path.join(dir, "public/memes/original/hidden.png"), image);
    await writeFile(path.join(dir, "public/uploads/pending.png"), image);
    let db = new DatabaseSync(path.join(dir, "prisma/legacy.db"));
    const now = Date.now();
    const insert = db.prepare(
      "INSERT INTO Meme (id,numId,title,type,mediaUrl,thumbUrl,copies,downloads,status,createdAt,updatedAt) VALUES (?,?,?,'STATIC',?,?,?,?,?,?,?)",
    );
    insert.run(
      "published",
      1,
      "猫10",
      "/memes/original/猫#10%.png",
      "/memes/original/猫#10%.png",
      7,
      4,
      "PUBLISHED",
      now,
      now,
    );
    insert.run(
      "hidden",
      2,
      "猫2",
      "/memes/original/hidden.png",
      "/memes/original/hidden.png",
      0,
      0,
      "HIDDEN",
      now,
      now,
    );
    insert.run(
      "pending",
      3,
      "待审",
      "/uploads/pending.png",
      "/uploads/pending.png",
      0,
      0,
      "PENDING",
      now,
      now,
    );
    db.exec(
      "INSERT INTO Tag VALUES ('tag',1,'旧标签'); INSERT INTO MemeTag VALUES ('published','tag'); INSERT INTO MemeDailyStat VALUES ('2026-10-01','published',7,4); INSERT INTO DailyPool VALUES ('pool','2026-10-01',0); INSERT INTO DailyPoolItem VALUES ('pool-item','pool','published');",
    );
    db.prepare(
      "INSERT INTO SiteDailyStat (day,visits,createdAt,updatedAt) VALUES (?,99,?,?)",
    ).run("2026-10-01", now, now);
    db.prepare("INSERT INTO AppConfig VALUES (?,?,?)").run(
      "siteName",
      "旧站点",
      now,
    );
    db.prepare(
      "INSERT INTO AuditLog (id,action,status,createdAt) VALUES (?,?,?,?)",
    ).run("log", "old-action", "success", now);
    const hash = scryptSync("stored-password", "legacy-salt", 32).toString(
      "hex",
    );
    db.prepare("INSERT INTO AdminCredential VALUES (?,?,?,?,?,?)").run(
      "credential",
      "stored-admin",
      hash,
      "legacy-salt",
      now,
      now,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM _prisma_migrations").get()!.n,
      12,
    );
    db.close();
    await cp(
      path.join(root, "prisma/migrations"),
      path.join(dir, "prisma/migrations"),
      { recursive: true },
    );
    const command = [
      "--import",
      path.join(root, "node_modules/tsx/dist/loader.mjs"),
      path.join(dir, "prisma/migrate.ts"),
    ];
    result = run(command);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Legacy media remains/);
    await mkdir(path.join(dir, "data"));
    for (const name of ["memes", "uploads", "trash"])
      await rename(
        path.join(dir, "public", name),
        path.join(dir, "data", name),
      );
    for (let i = 0; i < 2; i++) {
      result = run(command);
      assert.equal(result.status, 0, result.stderr + result.stdout);
    }
    db = new DatabaseSync(path.join(dir, "prisma/legacy.db"));
    assert.equal(db.prepare("SELECT count(*) AS n FROM Meme").get()!.n, 3);
    assert.equal(
      db.prepare("SELECT heat FROM Meme WHERE id='published'").get()!.heat,
      11,
    );
    assert.ok(
      Number(
        db.prepare("SELECT nameOrder FROM Meme WHERE id='hidden'").get()!
          .nameOrder,
      ) <
        Number(
          db.prepare("SELECT nameOrder FROM Meme WHERE id='published'").get()!
            .nameOrder,
        ),
    );
    for (const table of [
      "MemeTag",
      "MemeDailyStat",
      "DailyPoolItem",
      "AuditLog",
      "AdminCredential",
    ])
      assert.equal(
        db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n,
        1,
        table,
      );
    assert.equal(
      db.prepare("SELECT visits FROM SiteDailyStat").get()!.visits,
      99,
    );
    assert.equal(
      db.prepare("SELECT visitors FROM SiteDailyStat").get()!.visitors,
      0,
    );
    assert.equal(
      db.prepare("SELECT value FROM AppConfig WHERE key='siteName'").get()!
        .value,
      "旧站点",
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.close();
    assert.deepEqual(
      await readFile(path.join(dir, "data/memes/original/猫#10%.png")),
      image,
    );
    assert.ok(!(await readdir(dir)).includes("wrong.db"));
    const probe = `require('./prisma/env'); const assert = require('node:assert/strict'); (async () => {
      const s = require('./lib/adminSession'); const {mediaResponse} = require('./lib/mediaResponse');
      assert.equal(await s.isAdminSessionValid(Buffer.from('stored-admin:${hash}').toString('base64')),false);
      const login = require('./app/api/admin/login/route');
      const response = await login.POST(new Request('http://localhost/api/admin/login',{method:'POST',body:JSON.stringify({user:'stored-admin',pass:'stored-password'})}));
      assert.equal(response.status,200); const cookie=response.headers.get('set-cookie').split(';')[0];
      assert.equal((await mediaResponse(new Request('http://localhost'), 'original','hidden.png')).status,404);
      const hidden=await mediaResponse(new Request('http://localhost',{headers:{cookie}}),'original','hidden.png'); assert.equal(hidden.status,200); await hidden.arrayBuffer();
      const body=new FormData();body.append('file',new File([require('node:fs').readFileSync('data/memes/original/hidden.png')],'new.png',{type:'image/png'}));
      const uploaded=await require('./app/api/upload/route').POST(new Request('http://localhost/api/upload',{method:'POST',headers:{cookie},body}));assert.equal(uploaded.status,200);
      await require('./lib/db').prisma.$disconnect();
    })().catch(e=>{console.error(e);process.exitCode=1;});`;
    result = run([
      "--import",
      path.join(root, "node_modules/tsx/dist/loader.mjs"),
      "--eval",
      probe,
    ]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    result = run([
      "--import",
      path.join(root, "node_modules/tsx/dist/loader.mjs"),
      path.join(dir, "prisma/seed.ts"),
    ]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    db = new DatabaseSync(path.join(dir, "prisma/legacy.db"));
    assert.equal(db.prepare("SELECT count(*) AS n FROM Meme").get()!.n, 2);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM MemeDailyStat").get()!.n,
      1,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM MediaOperation").get()!.n,
      0,
    );
    db.close();
    assert.ok(!(await readdir(path.join(dir, "prisma"))).includes("dev.db"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
