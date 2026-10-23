import path from "node:path";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { getCookieValue } from "@/lib/adminAuth";
import {
  getAdminSessionCookieName,
  isAdminSessionValid,
} from "@/lib/adminSession";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

export async function mediaResponse(
  request: Request,
  kind: "uploads" | "original" | "thumb",
  file: string,
) {
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime || file !== path.basename(file) || file.includes("\\"))
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const url =
    kind === "uploads" ? `/uploads/${file}` : `/memes/${kind}/${file}`;
  const published =
    kind !== "uploads" &&
    (await prisma.meme.findFirst({
      where: {
        status: "PUBLISHED",
        OR: [{ mediaUrl: url }, { thumbUrl: url }],
      },
      select: { id: true },
    }));
  if (
    !published &&
    !(await isAdminSessionValid(
      getCookieValue(request, getAdminSessionCookieName()),
    ))
  ) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const target = path.join(process.cwd(), "data", url);
  let info;
  try {
    info = await stat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    throw error;
  }
  if (!info.isFile())
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const etag = `W/"${info.size}-${info.mtimeMs}"`;
  const headers = new Headers({
    "Content-Type": mime,
    "Content-Length": String(info.size),
    ETag: etag,
    "Last-Modified": info.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": published
      ? "public, max-age=0, must-revalidate"
      : "private, no-store",
  });
  if (published) {
    const match = request.headers.get("if-none-match");
    const modified = request.headers.get("if-modified-since");
    if (
      match
        ?.split(",")
        .map((value) => value.trim())
        .includes(etag) ||
      (!match && modified && info.mtime.getTime() < Date.parse(modified) + 1000)
    ) {
      headers.delete("Content-Length");
      return new Response(null, { status: 304, headers });
    }
  }
  if (request.method === "HEAD") return new Response(null, { headers });
  const stream = Readable.toWeb(
    createReadStream(target),
  ) as ReadableStream<Uint8Array>;
  return new Response(stream, { headers });
}
