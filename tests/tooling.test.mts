import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);

test("Next ESLint root globs retain directory and brace matching without braces dependency", async () => {
  const configRequire = createRequire(require.resolve("eslint-config-next"));
  const plugin = configRequire.resolve("@next/eslint-plugin-next");
  const { getRootDirs } = require(
    path.join(path.dirname(plugin), "utils/get-root-dirs.js"),
  );
  const root = await mkdtemp(path.join(tmpdir(), "molworld-globs-"));
  try {
    for (const name of ["apps/web", "apps/admin", "other"])
      await mkdir(path.join(root, name), { recursive: true });
    const roots = getRootDirs({
      cwd: root,
      settings: { next: { rootDir: `${root}/apps/{web,admin}` } },
    });
    assert.deepEqual(roots.sort(), [
      path.join(root, "apps/admin"),
      path.join(root, "apps/web"),
    ]);
    assert.deepEqual(getRootDirs({ cwd: root, settings: {} }), [root]);
    assert.doesNotThrow(() =>
      getRootDirs({
        cwd: root,
        settings: {
          next: { rootDir: `${root}/${"{".repeat(4000)}a${"}".repeat(4000)}` },
        },
      }),
    );
    const dependency = createRequire(plugin)("fast-glob/package.json");
    assert.equal(dependency.name, "tinyglobby");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("production maintenance loads the same environment precedence as Next", async () => {
  const { writeFile } = await import("node:fs/promises");
  const { spawnSync } = await import("node:child_process");
  const root = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
  );
  const dir = await mkdtemp(path.join(tmpdir(), "molworld-env-"));
  try {
    await writeFile(path.join(dir, ".env"), 'DATABASE_URL="file:./wrong.db"\n');
    await writeFile(
      path.join(dir, ".env.production"),
      'DATABASE_URL="file:./production.db"\n',
    );
    await writeFile(
      path.join(dir, ".env.production.local"),
      'DATABASE_URL="file:./actual.db"\n',
    );
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
    delete env.DATABASE_URL;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        path.join(root, "node_modules/tsx/dist/loader.mjs"),
        "--eval",
        `require(${JSON.stringify(path.join(root, "scripts/env.ts"))}); console.log(process.env.DATABASE_URL);`,
      ],
      { cwd: dir, env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "file:./actual.db");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
