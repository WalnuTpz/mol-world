import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";

const shared = globalThis as typeof globalThis & {
  molworldLocks?: AsyncLocalStorage<Set<string>>;
};
const heldLocks = (shared.molworldLocks ??= new AsyncLocalStorage<
  Set<string>
>());

// flock locks the inherited open-file description. Node retains the descriptor
// after the short-lived helper exits; close or process death releases the lock.
export async function withFileLock<T>(
  filename: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(filename);
  const current = heldLocks.getStore();
  if (current?.has(key)) return operation();
  await mkdir(path.dirname(key), { recursive: true });
  const handle = await open(key, "a");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("flock", ["--exclusive", "3"], {
        stdio: ["ignore", "ignore", "pipe", handle.fd],
      });
      let stderr = "";
      child.stderr!.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`File lock failed (${code}): ${stderr}`)),
      );
    });
    return await heldLocks.run(new Set([...(current ?? []), key]), operation);
  } finally {
    await handle.close();
  }
}
