CREATE INDEX "Meme_status_createdAt_id_idx" ON "Meme"("status", "createdAt", "id");
CREATE INDEX "Meme_mediaUrl_idx" ON "Meme"("mediaUrl");
CREATE INDEX "Meme_thumbUrl_idx" ON "Meme"("thumbUrl");
CREATE INDEX "MemeTag_tagId_idx" ON "MemeTag"("tagId");
CREATE INDEX "DailyPoolItem_memeId_idx" ON "DailyPoolItem"("memeId");
CREATE INDEX "Meme_status_heat_idx" ON "Meme"("status", ("copies" + "downloads") DESC, "createdAt" DESC, "id" DESC);
