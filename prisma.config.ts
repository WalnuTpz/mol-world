import "./prisma/env";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrl } from "./lib/databaseUrl";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: resolveDatabaseUrl() },
});
