import "dotenv/config";
import path from "node:path";
import { access, rename } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const ORIGINAL_PREFIX = "/memes/original/";
const THUMB_PREFIX = "/memes/thumb/";

const resolveDbUrl = (rawUrl?: string) => {
  const fallback = `file:${path
    .resolve(process.cwd(), "prisma", "dev.db")
    .replace(/\\/g, "/")}`;
  if (!rawUrl) return fallback;
  if (!rawUrl.startsWith("file:")) return rawUrl;
  const filePath = rawUrl.slice(5);
  if (filePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(filePath)) {
    return `file:${filePath.replace(/\\/g, "/")}`;
  }
  const absPath = path.resolve(process.cwd(), filePath).replace(/\\/g, "/");
  return `file:${absPath}`;
};

const adapter = new PrismaBetterSqlite3({
  url: resolveDbUrl(process.env.DATABASE_URL),
});

const prisma = new PrismaClient({ adapter });

const publicDir = path.join(process.cwd(), "public");

const toFsPath = (url: string) =>
  path.join(publicDir, url.replace(/^\//, "").replace(/\//g, path.sep));

const fileExists = async (filePath: string) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const computeTarget = async (
  dir: string,
  base: string,
  ext: string,
  currentPath: string
) => {
  let filename = `${base}${ext}`;
  let targetPath = path.join(dir, filename);
  if (targetPath === currentPath) {
    return { filename, targetPath, changed: false };
  }
  let counter = 2;
  while (await fileExists(targetPath)) {
    filename = `${base}-${counter}${ext}`;
    targetPath = path.join(dir, filename);
    counter += 1;
  }
  return { filename, targetPath, changed: true };
};

async function main() {
  const memes = await prisma.meme.findMany({
    select: {
      id: true,
      numId: true,
      mediaUrl: true,
      thumbUrl: true,
    },
  });

  let renamedMedia = 0;
  let renamedThumb = 0;
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const meme of memes) {
    if (!meme.numId) {
      skipped += 1;
      continue;
    }
    if (!meme.mediaUrl.startsWith(ORIGINAL_PREFIX)) {
      skipped += 1;
      continue;
    }

    const baseName = String(meme.numId);

    const mediaPath = toFsPath(meme.mediaUrl);
    if (!(await fileExists(mediaPath))) {
      missing += 1;
      continue;
    }

    const mediaExt = path.extname(mediaPath);
    const originalDir = path.dirname(mediaPath);
    const mediaTarget = await computeTarget(
      originalDir,
      baseName,
      mediaExt,
      mediaPath
    );

    let newMediaUrl = meme.mediaUrl;
    let newThumbUrl = meme.thumbUrl;
    const renames: Array<{ from: string; to: string }> = [];

    if (mediaTarget.changed) {
      await rename(mediaPath, mediaTarget.targetPath);
      newMediaUrl = `${ORIGINAL_PREFIX}${mediaTarget.filename}`;
      renames.push({ from: mediaTarget.targetPath, to: mediaPath });
      renamedMedia += 1;
    }

    if (meme.thumbUrl.startsWith(THUMB_PREFIX)) {
      const thumbPath = toFsPath(meme.thumbUrl);
      if (await fileExists(thumbPath)) {
        const thumbExt = path.extname(thumbPath);
        const thumbDir = path.dirname(thumbPath);
        const thumbTarget = await computeTarget(
          thumbDir,
          baseName,
          thumbExt,
          thumbPath
        );
        if (thumbTarget.changed) {
          await rename(thumbPath, thumbTarget.targetPath);
          newThumbUrl = `${THUMB_PREFIX}${thumbTarget.filename}`;
          renames.push({ from: thumbTarget.targetPath, to: thumbPath });
          renamedThumb += 1;
        }
      } else {
        missing += 1;
      }
    }

    if (newMediaUrl === meme.mediaUrl && newThumbUrl === meme.thumbUrl) {
      continue;
    }

    try {
      await prisma.meme.update({
        where: { id: meme.id },
        data: {
          mediaUrl: newMediaUrl,
          thumbUrl: newThumbUrl,
        },
      });
      updated += 1;
    } catch (error) {
      console.error(`Update failed for ${meme.id}`, error);
      for (const entry of renames) {
        try {
          if (await fileExists(entry.from)) {
            await rename(entry.from, entry.to);
          }
        } catch (revertError) {
          console.error(`Revert failed for ${entry.from}`, revertError);
        }
      }
    }
  }

  console.log(
    [
      `updated=${updated}`,
      `renamedMedia=${renamedMedia}`,
      `renamedThumb=${renamedThumb}`,
      `missing=${missing}`,
      `skipped=${skipped}`,
    ].join(" ")
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
