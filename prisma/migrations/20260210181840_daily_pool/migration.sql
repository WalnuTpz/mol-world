-- CreateTable
CREATE TABLE "DailyPool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "groupIndex" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "DailyPoolItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poolId" TEXT NOT NULL,
    "memeId" TEXT NOT NULL,
    CONSTRAINT "DailyPoolItem_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "DailyPool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyPoolItem_memeId_fkey" FOREIGN KEY ("memeId") REFERENCES "Meme" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyPool_day_groupIndex_key" ON "DailyPool"("day", "groupIndex");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPoolItem_poolId_memeId_key" ON "DailyPoolItem"("poolId", "memeId");
