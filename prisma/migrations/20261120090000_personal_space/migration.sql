-- Ruang ajar (mata uji bayangan milik pengajar). Hanya menambah kolom; tidak ada data yang diubah.
ALTER TABLE "subjects" ADD COLUMN "isPersonalSpace" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subjects" ADD COLUMN "ownerId" TEXT;

CREATE UNIQUE INDEX "subjects_ownerId_key" ON "subjects"("ownerId");

ALTER TABLE "subjects" ADD CONSTRAINT "subjects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
