import path from "node:path";
import { promises as fs } from "node:fs";

const TRASH_DIR = path.join(process.cwd(), "public", "trash");

const main = async () => {
  try {
    const entries = await fs.readdir(TRASH_DIR, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const target = path.join(TRASH_DIR, entry.name);
      await fs.unlink(target);
      removed += 1;
    }
    console.log(`已清理 trash 文件：${removed}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("trash 目录不存在，无需清理");
      return;
    }
    console.error("清理 trash 失败", error);
    process.exit(1);
  }
};

void main();
