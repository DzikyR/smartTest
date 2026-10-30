-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('QUIZ', 'QUESTION', 'ASSIGNMENT');

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "isLate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "maxPoints" DOUBLE PRECISION,
ADD COLUMN     "timed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "workType" "WorkType" NOT NULL DEFAULT 'QUIZ';

-- CreateTable
CREATE TABLE "exam_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ExamKind" NOT NULL DEFAULT 'LAINNYA',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_categories_name_key" ON "exam_categories"("name");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "exam_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Kategori bawaan (sesuai jenis ujian lama + "Tes"); id tetap agar bisa dirujuk
INSERT INTO "exam_categories" ("id", "name", "kind", "sortOrder") VALUES
  ('cat_kuis', 'Kuis', 'KUIS', 10),
  ('cat_uts', 'UTS', 'UTS', 20),
  ('cat_uas', 'UAS', 'UAS', 30),
  ('cat_tes', 'Tes', 'LAINNYA', 40),
  ('cat_tryout', 'Try Out', 'TRYOUT', 50),
  ('cat_latihan', 'Latihan', 'LATIHAN', 60),
  ('cat_lainnya', 'Lainnya', 'LAINNYA', 70)
ON CONFLICT ("name") DO NOTHING;

-- Ujian lama dipetakan ke kategori sesuai kind-nya (kolom kind tetap utuh)
UPDATE "exams" e SET "categoryId" = c."id"
FROM "exam_categories" c
WHERE e."categoryId" IS NULL AND c."id" = CASE e."kind"
  WHEN 'KUIS' THEN 'cat_kuis' WHEN 'UTS' THEN 'cat_uts' WHEN 'UAS' THEN 'cat_uas'
  WHEN 'TRYOUT' THEN 'cat_tryout' WHEN 'LATIHAN' THEN 'cat_latihan' ELSE 'cat_lainnya' END;
