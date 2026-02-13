-- CreateTable
CREATE TABLE "MemeDailyStat" (
    "day" TEXT NOT NULL,
    "memeId" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "memeId"),
    CONSTRAINT "MemeDailyStat_memeId_fkey" FOREIGN KEY ("memeId") REFERENCES "Meme" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MemeDailyStat_day_idx" ON "MemeDailyStat"("day");

-- CreateIndex
CREATE INDEX "MemeDailyStat_memeId_idx" ON "MemeDailyStat"("memeId");
