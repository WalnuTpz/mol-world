import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";

export const runtime = "nodejs";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

const isSafeSegment = (value: string) =>
  value === path.basename(value) && !value.includes("..");

const isAllowedKind = (value: string): value is "original" | "thumb" =>
  value === "original" || value === "thumb";

const resolveParams = async (
  params:
    | { kind: string; file: string }
    | Promise<{ kind: string; file: string }>
) => Promise.resolve(params);

const loadFile = async (kind: string, file: string) => {
  if (!isAllowedKind(kind) || !isSafeSegment(file)) return null;
  const baseDir = path.join(process.cwd(), "public", "memes", kind);
  const filePath = path.join(baseDir, file);

  const readByPath = async (targetPath: string) => {
    const [buffer, info] = await Promise.all([readFile(targetPath), stat(targetPath)]);
    return { buffer, info };
  };

  try {
    return await readByPath(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      try {
        const entries = await readdir(baseDir);
        const matched = entries.find(
          (entry) => entry.toLowerCase() === file.toLowerCase()
        );
        if (!matched) return null;
        return await readByPath(path.join(baseDir, matched));
      } catch (innerError) {
        if ((innerError as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw innerError;
      }
    }
    throw error;
  }
};

const buildHeaders = (file: string, size: number, mtime: Date) => {
  const ext = path.extname(file).toLowerCase();
  return {
    "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
    "Content-Length": String(size),
    "Cache-Control": "public, max-age=14400, must-revalidate",
    "Last-Modified": mtime.toUTCString(),
  };
};

export async function GET(
  _request: Request,
  context: {
    params:
      | { kind: string; file: string }
      | Promise<{ kind: string; file: string }>;
  }
) {
  const { kind, file } = await resolveParams(context.params);
  const loaded = await loadFile(kind, file);
  if (!loaded) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(loaded.buffer, {
    status: 200,
    headers: buildHeaders(file, loaded.buffer.byteLength, loaded.info.mtime),
  });
}

export async function HEAD(
  _request: Request,
  context: {
    params:
      | { kind: string; file: string }
      | Promise<{ kind: string; file: string }>;
  }
) {
  const { kind, file } = await resolveParams(context.params);
  const loaded = await loadFile(kind, file);
  if (!loaded) {
    return new Response(null, { status: 404 });
  }
  return new Response(null, {
    status: 200,
    headers: buildHeaders(file, loaded.buffer.byteLength, loaded.info.mtime),
  });
}
