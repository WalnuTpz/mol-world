import { test } from "node:test";
import { spawn } from "node:child_process";
import {
  assert,
  prisma,
  root,
  fixture,
  path,
  spawnSync,
} from "./helpers/fixture.mts";

test("rate limits survive worker restarts", async () => {
  const modulePath = JSON.stringify(path.join(root, "src/lib/rateLimit.ts"));
  const program = `const { consumeRateLimits } = require(${modulePath}); consumeRateLimits([{ key: "restart", maximum: 1, windowMs: 60000 }]).then(() => console.log("allowed"), error => console.log("denied:" + error.retryAfter));`;
  const run = () =>
    spawnSync(
      process.execPath,
      [
        "--import",
        path.join(root, "node_modules/tsx/dist/loader.mjs"),
        "--eval",
        program,
      ],
      { cwd: fixture, env: process.env, encoding: "utf8" },
    );
  const first = run();
  const second = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout.trim(), "allowed");
  assert.match(second.stdout.trim(), /^denied:\d+$/);
});

test("competing processes consume one shared limit without lost updates", async () => {
  const modulePath = JSON.stringify(path.join(root, "src/lib/rateLimit.ts"));
  const program = `const { consumeRateLimits, RateLimitError } = require(${modulePath}); (async () => { let allowed=0; for(let i=0;i<4;i++) { try { await consumeRateLimits([{ key: "concurrent", maximum: 5, windowMs: 60000 }]); allowed++; } catch(e) { if(!(e instanceof RateLimitError)) throw e; } } console.log(allowed); })().catch(e=>{ console.error(e); process.exitCode=1; });`;
  const results = await Promise.all(
    Array.from(
      { length: 3 },
      () =>
        new Promise<number>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [
              "--import",
              path.join(root, "node_modules/tsx/dist/loader.mjs"),
              "--eval",
              program,
            ],
            { cwd: fixture, env: process.env },
          );
          let output = "",
            errors = "";
          child.stdout.on("data", (value) => {
            output += value;
          });
          child.stderr.on("data", (value) => {
            errors += value;
          });
          child.once("error", reject);
          child.once("exit", (code) =>
            code === 0
              ? resolve(Number(output.trim()))
              : reject(new Error(errors)),
          );
        }),
    ),
  );
  assert.equal(
    results.reduce((a, b) => a + b, 0),
    5,
  );
  assert.equal(
    (await prisma.rateLimit.findUniqueOrThrow({ where: { key: "concurrent" } }))
      .count,
    5,
  );
});
