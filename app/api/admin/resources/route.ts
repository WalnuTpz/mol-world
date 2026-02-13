import path from "node:path";
import { promises as fs } from "node:fs";

import { prisma } from "@/lib/db";
import { errorResponse, successResponse } from "@/lib/api";
import { requireAdmin } from "@/lib/adminAuth";

const ORIGINAL_PREFIX = "/memes/original/";
const THUMB_PREFIX = "/memes/thumb/";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const ORIGINAL_DIR = path.join(PUBLIC_DIR, "memes", "original");
const THUMB_DIR = path.join(PUBLIC_DIR, "memes", "thumb");

const IGNORED_FILES = new Set([".gitkeep", ".DS_Store"]);

const isIgnored = (name: string) => name.startsWith(".") || IGNORED_FILES.has(name);

const listFiles = async (dir: string) => {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => !isIgnored(name));
  } catch {
    return [];
  }
};

const safeJoin = (dir: string, filename: string) => {
  const resolvedDir = path.resolve(dir);
  const resolvedPath = path.resolve(dir, filename);
  if (!resolvedPath.startsWith(`${resolvedDir}${path.sep}`)) {
    return null;
  }
  return resolvedPath;
};

type ResourceStats = {
  missing: { original: number; thumb: number };
  orphans: { original: number; thumb: number };
};

const scanResources = async (): Promise<{
  stats: ResourceStats;
  orphans: { original: string[]; thumb: string[] };
}> => {
  const memes = await prisma.meme.findMany({
    select: { mediaUrl: true, thumbUrl: true },
  });

  const originalFiles = await listFiles(ORIGINAL_DIR);
  const thumbFiles = await listFiles(THUMB_DIR);

  const originalSet = new Set(originalFiles);
  const thumbSet = new Set(thumbFiles);

  const referencedOriginal = new Set<string>();
  const referencedThumb = new Set<string>();
  let missingOriginal = 0;
  let missingThumb = 0;

  for (const meme of memes) {
    if (meme.mediaUrl?.startsWith(ORIGINAL_PREFIX)) {
      const name = path.posix.basename(meme.mediaUrl);
      referencedOriginal.add(name);
      if (!originalSet.has(name)) {
        missingOriginal += 1;
      }
    }
    if (meme.thumbUrl?.startsWith(THUMB_PREFIX)) {
      const name = path.posix.basename(meme.thumbUrl);
      referencedThumb.add(name);
      if (!thumbSet.has(name)) {
        missingThumb += 1;
      }
    }
  }

  const orphanOriginal = originalFiles.filter(
    (name) => !referencedOriginal.has(name)
  );
  const orphanThumb = thumbFiles.filter((name) => !referencedThumb.has(name));

  return {
    stats: {
      missing: { original: missingOriginal, thumb: missingThumb },
      orphans: { original: orphanOriginal.length, thumb: orphanThumb.length },
    },
    orphans: { original: orphanOriginal, thumb: orphanThumb },
  };
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  try {
    const { stats } = await scanResources();
    return successResponse({ stats }, "检查完成");
  } catch (error) {
    const message = error instanceof Error ? error.message : "检查失败";
    return errorResponse(message, 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  let payload: { action?: string } | null = null;
  try {
    payload = (await request.json().catch(() => null)) as { action?: string } | null;
  } catch {
    payload = null;
  }

  if (!payload || payload.action !== "cleanup") {
    return errorResponse("无效操作", 400, "INVALID_ACTION");
  }

  try {
    const { orphans } = await scanResources();
    let removedOriginal = 0;
    let removedThumb = 0;

    for (const filename of orphans.original) {
      const target = safeJoin(ORIGINAL_DIR, filename);
      if (!target) continue;
      try {
        await fs.unlink(target);
        removedOriginal += 1;
      } catch {
        // ignore removal failures
      }
    }

    for (const filename of orphans.thumb) {
      const target = safeJoin(THUMB_DIR, filename);
      if (!target) continue;
      try {
        await fs.unlink(target);
        removedThumb += 1;
      } catch {
        // ignore removal failures
      }
    }

    const { stats } = await scanResources();
    return successResponse(
      {
        removed: { original: removedOriginal, thumb: removedThumb },
        stats,
      },
      "清理完成"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "清理失败";
    return errorResponse(message, 500);
  }
}
