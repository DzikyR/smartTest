-- Classwork ala Google Classroom: jenis postingan (PostKind) + multi-lampiran
-- (material_attachments). Data lama dikonversi:
--   TEXT → MATERI · LINK/FILE → MATERI + 1 lampiran · ASSIGNMENT → TUGAS

-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('MATERI', 'TUGAS', 'TUGAS_KUIS', 'PERTANYAAN');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('FILE', 'LINK', 'YOUTUBE');

-- CreateTable
CREATE TABLE "material_attachments" (
    "id" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "sha256" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialId" TEXT NOT NULL,

    CONSTRAINT "material_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_attachments_materialId_sortOrder_idx" ON "material_attachments"("materialId", "sortOrder");

-- CreateIndex
CREATE INDEX "material_attachments_storageKey_idx" ON "material_attachments"("storageKey");

-- AddForeignKey
ALTER TABLE "material_attachments" ADD CONSTRAINT "material_attachments_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: jenis postingan
ALTER TABLE "materials" ADD COLUMN "kind" "PostKind" NOT NULL DEFAULT 'MATERI';
UPDATE "materials" SET "kind" = 'TUGAS' WHERE "type" = 'ASSIGNMENT';

-- Data: lampiran dari kolom lama (id = 'mig_' || id materi; cukup unik & stabil)
INSERT INTO "material_attachments" ("id", "type", "name", "url", "materialId")
SELECT 'mig_' || "id",
       CASE WHEN "url" ~* '^https?://([a-z0-9-]+\.)*(youtube\.com|youtu\.be)(/|$)' THEN 'YOUTUBE'::"AttachmentType" ELSE 'LINK'::"AttachmentType" END,
       COALESCE(substring("url" from '^https?://([^/:?#]+)'), "url"),
       "url",
       "id"
FROM "materials" WHERE "type" = 'LINK' AND "url" IS NOT NULL;

INSERT INTO "material_attachments" ("id", "type", "name", "storageKey", "mimeType", "size", "sha256", "materialId")
SELECT 'mig_' || "id", 'FILE', COALESCE("fileName", 'berkas'), "storageKey", "mimeType", "size", "sha256", "id"
FROM "materials" WHERE "type" = 'FILE' AND "storageKey" IS NOT NULL;

-- DropIndex
DROP INDEX "materials_storageKey_key";

-- AlterTable: kolom lama dipindah ke material_attachments
ALTER TABLE "materials" DROP COLUMN "type",
DROP COLUMN "url",
DROP COLUMN "fileName",
DROP COLUMN "mimeType",
DROP COLUMN "size",
DROP COLUMN "storageKey",
DROP COLUMN "sha256";

-- DropEnum
DROP TYPE "MaterialType";
