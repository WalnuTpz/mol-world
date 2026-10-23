import path from "node:path";
import { readdir } from "node:fs/promises";

async function hasMedia(directory: string): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  for (const entry of entries) {
    if ([".gitkeep", ".DS_Store"].includes(entry.name)) continue;
    if (
      !entry.isDirectory() ||
      (await hasMedia(path.join(directory, entry.name)))
    )
      return true;
  }
  return false;
}

// Leaving old media in public would bypass every application permission check.
export async function assertPrivateMediaStorage() {
  for (const directory of ["memes", "uploads", "trash"]) {
    if (await hasMedia(path.join(process.cwd(), "public", directory)))
      throw new Error(
        `Legacy media remains in public/${directory}. Stop the service and follow docs/upgrading.md before starting.`,
      );
  }
}
