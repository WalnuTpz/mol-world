-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Meme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numId" INTEGER,
    "title" TEXT,
    "type" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "thumbUrl" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Meme" ("copies", "createdAt", "id", "isFeatured", "mediaUrl", "numId", "status", "thumbUrl", "title", "type", "updatedAt") SELECT "copies", "createdAt", "id", "isFeatured", "mediaUrl", "numId", "status", "thumbUrl", "title", "type", "updatedAt" FROM "Meme";
DROP TABLE "Meme";
ALTER TABLE "new_Meme" RENAME TO "Meme";
CREATE UNIQUE INDEX "Meme_numId_key" ON "Meme"("numId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
