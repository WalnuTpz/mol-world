import { loadEnvConfig } from "@next/env";
// Match Next's precedence, including .env.local and .env.production. Production
// maintenance commands set NODE_ENV=production; development remains the default.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
