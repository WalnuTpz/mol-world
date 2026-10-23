import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Thumbnails are generated on publication; a second optimizer wastes work
  // and cannot forward the admin cookie for private previews.
  experimental: { proxyClientMaxBodySize: "51mb" },
  images: { unoptimized: true },
  serverExternalPackages: ["@prisma/adapter-better-sqlite3", "better-sqlite3"],
};
export default nextConfig;
