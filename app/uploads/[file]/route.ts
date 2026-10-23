import path from "node:path";
import { readFile } from "node:fs/promises";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { file } = await context.params;
  const types: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  const mime = types[path.extname(file).toLowerCase()];
  if (file !== path.basename(file) || file.includes("..") || !mime)
    return new Response(null, { status: 404 });
  try {
    const buffer = await readFile(
      path.join(process.cwd(), "public", "uploads", file),
    );
    return new Response(buffer, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return new Response(null, { status: 404 });
    throw error;
  }
}
