import path from "node:path";
import { readdir, unlink } from "node:fs/promises";

async function main() {
  let removed = 0;
  // Include the previous pending-upload trash directory when upgrading.
  for (const relative of ["trash", "uploads/trash"]) {
    const dir = path.join(process.cwd(), "public", relative);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      await unlink(path.join(dir, entry.name));
      removed += 1;
    }
  }
  console.log(`已清理 trash 文件：${removed}`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
