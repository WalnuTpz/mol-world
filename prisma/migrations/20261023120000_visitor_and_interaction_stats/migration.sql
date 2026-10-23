-- Keep historical activity even when its image is deleted.
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MemeDailyStat" (
  "day" TEXT NOT NULL,
  "memeId" TEXT NOT NULL,
  "copies" INTEGER NOT NULL DEFAULT 0,
  "downloads" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("day", "memeId")
);
INSERT INTO "new_MemeDailyStat" SELECT "day", "memeId", "copies", "downloads" FROM "MemeDailyStat";
DROP TABLE "MemeDailyStat";
ALTER TABLE "new_MemeDailyStat" RENAME TO "MemeDailyStat";
CREATE INDEX "MemeDailyStat_day_idx" ON "MemeDailyStat"("day");
CREATE INDEX "MemeDailyStat_memeId_idx" ON "MemeDailyStat"("memeId");
PRAGMA foreign_keys=ON;
ALTER TABLE "SiteDailyStat" ADD COLUMN "visitors" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "VisitorSession" ("tokenHash" TEXT NOT NULL PRIMARY KEY, "expiresAt" DATETIME NOT NULL);
CREATE INDEX "VisitorSession_expiresAt_idx" ON "VisitorSession"("expiresAt");
CREATE TABLE "SiteDailyVisitor" ("day" TEXT NOT NULL, "visitorHash" TEXT NOT NULL, PRIMARY KEY ("day", "visitorHash"));
CREATE TABLE "InteractionGrant" (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  "visitorHash" TEXT NOT NULL,
  "memeId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "consumedAt" DATETIME
);
CREATE INDEX "InteractionGrant_expiresAt_idx" ON "InteractionGrant"("expiresAt");
