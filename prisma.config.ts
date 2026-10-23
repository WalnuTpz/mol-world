import "./scripts/env";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./src/lib/databaseUrl";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx scripts/seed.ts" },
  datasource: { url: resolveDatabaseUrl() },
});
