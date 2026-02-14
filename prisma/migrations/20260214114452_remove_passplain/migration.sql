/*
  Warnings:

  - You are about to drop the column `passPlain` on the `AdminCredential` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdminCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user" TEXT NOT NULL,
    "passHash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AdminCredential" ("createdAt", "id", "passHash", "salt", "updatedAt", "user") SELECT "createdAt", "id", "passHash", "salt", "updatedAt", "user" FROM "AdminCredential";
DROP TABLE "AdminCredential";
ALTER TABLE "new_AdminCredential" RENAME TO "AdminCredential";
CREATE UNIQUE INDEX "AdminCredential_user_key" ON "AdminCredential"("user");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
