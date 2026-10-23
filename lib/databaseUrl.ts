import path from "node:path";

// All application, CLI and migration paths are relative to the repository root.
export function resolveDatabaseUrl(
  raw = process.env.DATABASE_URL ?? "file:./prisma/dev.db",
) {
  if (!raw.startsWith("file:"))
    throw new Error("DATABASE_URL must be a SQLite file: URL");
  const filename = raw.slice(5);
  if (!filename) throw new Error("DATABASE_URL must name a database file");
  // The database is a runtime mount, not an asset to include in Next's build.
  return `file:${path.resolve(/* turbopackIgnore: true */ process.cwd(), filename).replace(/\\/g, "/")}`;
}
