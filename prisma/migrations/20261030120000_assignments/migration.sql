-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "submissionText" TEXT;

-- CreateTable
CREATE TABLE "submission_files" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptId" TEXT NOT NULL,

    CONSTRAINT "submission_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "submission_files_storageKey_key" ON "submission_files"("storageKey");

-- CreateIndex
CREATE INDEX "submission_files_attemptId_idx" ON "submission_files"("attemptId");

-- AddForeignKey
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

