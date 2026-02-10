/*
  Warnings:

  - You are about to drop the column `downloads` on the `Meme` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Meme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "type" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "thumbUrl" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Meme" ("createdAt", "id", "isFeatured", "mediaUrl", "status", "thumbUrl", "title", "type", "updatedAt") SELECT "createdAt", "id", "isFeatured", "mediaUrl", "status", "thumbUrl", "title", "type", "updatedAt" FROM "Meme";
DROP TABLE "Meme";
ALTER TABLE "new_Meme" RENAME TO "Meme";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
