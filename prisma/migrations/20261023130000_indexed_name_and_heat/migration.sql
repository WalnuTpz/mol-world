ALTER TABLE "Meme" ADD COLUMN "nameOrder" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Meme" ADD COLUMN "heat" INTEGER NOT NULL DEFAULT 0;
UPDATE "Meme" SET "heat" = "copies" + "downloads";
CREATE TRIGGER "Meme_insert_heat" AFTER INSERT ON "Meme" BEGIN
  UPDATE "Meme" SET "heat" = NEW."copies" + NEW."downloads" WHERE "id" = NEW."id";
END;
CREATE TRIGGER "Meme_update_heat" AFTER UPDATE OF "copies", "downloads" ON "Meme" BEGIN
  UPDATE "Meme" SET "heat" = NEW."copies" + NEW."downloads" WHERE "id" = NEW."id";
END;
CREATE INDEX "Meme_nameOrder_id_idx" ON "Meme"("nameOrder", "id");
CREATE INDEX "Meme_status_nameOrder_id_idx" ON "Meme"("status", "nameOrder", "id");
CREATE INDEX "Meme_status_heat_createdAt_id_idx" ON "Meme"("status", "heat", "createdAt", "id");
DROP INDEX "Meme_status_heat_idx";
