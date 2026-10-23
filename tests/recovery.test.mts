import { test } from "node:test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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
} from "./helpers/fixture.mts";

function worker(code: string) {
  return spawn(
    process.execPath,
    [
      "--import",
      path.join(root, "node_modules/tsx/dist/loader.mjs"),
      "--eval",
      code,
    ],
    { cwd: fixture, env: process.env, stdio: "pipe" },
  );
}
function waitFor(child: ChildProcessWithoutNullStreams, expected: string) {
  return new Promise<void>((resolve, reject) => {
    let output = "";
    let errors = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Worker timed out: ${output}\n${errors}`));
    }, 15_000);
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes(expected)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      if (!output.includes(expected))
        reject(new Error(`Worker exited: ${output}\n${errors}`));
    });
  });
}
async function kill(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGKILL");
  });
}

for (const phase of ["prepared", "committed", "retired"] as const) {
  test(`SIGKILL recovery at ${phase} keeps database references and media consistent`, async () => {
    await meme("recovery");
    await prisma.meme.update({
      where: { id: "recovery" },
      data: {
        mediaUrl: "/memes/original/old.png",
        thumbUrl: "/memes/original/old.png",
      },
    });
    await writeFile("data/memes/original/old.png", image);
    const code = `
      const fs = require("node:fs/promises");
      const { syncBuiltinESMExports } = require("node:module");
      const pause = async () => { console.log("READY"); await new Promise(() => { setInterval(() => {}, 1000); }); };
      if (${JSON.stringify(phase)} !== "prepared") {
        const rename = fs.rename;
        fs.rename = async (...args) => {
          if (${JSON.stringify(phase)} === "retired") await rename(...args);
          await pause();
        };
        syncBuiltinESMExports();
      }
      const media = require(${JSON.stringify(path.join(root, "src/lib/mediaFiles.ts"))});
      media.withMediaWrite(() => media.withMediaMutation(["/memes/original/new.png"], ["/memes/original/old.png"], async () => {
        await fs.copyFile("data/memes/original/old.png", "data/memes/original/new.png");
        if (${JSON.stringify(phase)} === "prepared") await pause();
      }, tx => tx.meme.update({ where: { id: "recovery" }, data: { mediaUrl: "/memes/original/new.png", thumbUrl: "/memes/original/new.png" } }))).catch(error => { console.error(error); process.exitCode = 1; });
    `;
    const child = worker(code);
    await waitFor(child, "READY");
    await kill(child);
    const { recoverMediaOperations } = await import("../src/lib/mediaFiles");
    await recoverMediaOperations();
    await recoverMediaOperations();
    const row = await prisma.meme.findUniqueOrThrow({
      where: { id: "recovery" },
    });
    assert.equal(
      row.mediaUrl,
      phase === "prepared"
        ? "/memes/original/old.png"
        : "/memes/original/new.png",
    );
    assert.deepEqual(await readFile(path.join("data", row.mediaUrl)), image);
    assert.deepEqual(await readdir("data/memes/original"), [
      phase === "prepared" ? "old.png" : "new.png",
    ]);
    assert.equal(await prisma.mediaOperation.count(), 0);
  });
}

test("another process cannot enter the media lock until a killed owner releases it", async () => {
  const modulePath = JSON.stringify(path.join(root, "src/lib/mediaFiles.ts"));
  const first = worker(
    `const { withMediaWrite } = require(${modulePath}); withMediaWrite(async () => { console.log("FIRST"); await new Promise(() => { setInterval(() => {}, 1000); }); });`,
  );
  await waitFor(first, "FIRST");
  const second = worker(
    `const { withMediaWrite } = require(${modulePath}); withMediaWrite(async () => { console.log("SECOND"); });`,
  );
  let entered = false;
  const completed = waitFor(second, "SECOND").then(() => {
    entered = true;
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(entered, false);
  } finally {
    await kill(first);
  }
  await completed;
});
