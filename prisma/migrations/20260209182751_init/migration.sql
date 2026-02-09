-- CreateTable
CREATE TABLE "Meme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "type" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "thumbUrl" TEXT NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MemeTag" (
    "memeId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("memeId", "tagId"),
    CONSTRAINT "MemeTag_memeId_fkey" FOREIGN KEY ("memeId") REFERENCES "Meme" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemeTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
