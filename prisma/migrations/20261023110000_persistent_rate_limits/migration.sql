CREATE TABLE "RateLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "resetAt" DATETIME NOT NULL
);
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");
