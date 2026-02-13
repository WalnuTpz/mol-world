/*
  Warnings:

  - A unique constraint covering the columns `[numId]` on the table `Meme` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[numId]` on the table `Tag` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Meme" ADD COLUMN "numId" INTEGER;

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN "numId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Meme_numId_key" ON "Meme"("numId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_numId_key" ON "Tag"("numId");
