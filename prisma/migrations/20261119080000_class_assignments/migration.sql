-- AlterEnum
ALTER TYPE "MaterialType" ADD VALUE 'ASSIGNMENT';

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "submissionUrl" TEXT;

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "examId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "materials_groupId_examId_key" ON "materials"("groupId", "examId");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

