import path from "node:path";
import { mkdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Originals, previews and pending uploads can share a filename, or even a file.
export async function withTrashedMedia<T>(
  urls: string[],
  operation: () => Promise<T>,
): Promise<T> {
  const moved: { source: string; target: string }[] = [];
  const trash = path.join(process.cwd(), "public", "trash");
  try {
    await mkdir(trash, { recursive: true });
    for (const url of new Set(urls)) {
      if (
        !/^\/(?:memes\/(?:original|thumb)|uploads)\/[^/]+$/.test(url) ||
        url.includes("..")
      ) {
        throw new Error(`Unsupported local media path: ${url}`);
      }
      const source = path.join(process.cwd(), "public", url);
      const target = path.join(trash, `${randomUUID()}-${path.basename(url)}`);
      try {
        await rename(source, target);
        moved.push({ source, target });
      } catch (error) {
        // A missing asset must not make its database record impossible to remove.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return await operation();
  } catch (error) {
    const failures: unknown[] = [error];
    for (const { source, target } of moved.reverse()) {
      try {
        await rename(target, source);
      } catch (rollbackError) {
        failures.push(rollbackError);
      }
    }
    if (failures.length > 1)
      throw new AggregateError(failures, "Media deletion and rollback failed");
    throw error;
  }
}

// The supported deployment is a single Node process. Serialize filesystem writes
// with their database changes so cleanup cannot collect an in-flight publication.
let mediaWrite: Promise<unknown> = Promise.resolve();
export function withMediaWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = mediaWrite.then(operation, operation);
  mediaWrite = result;
  return result;
}
