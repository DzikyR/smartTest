-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "rosterOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "class_rosters" (
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_rosters_pkey" PRIMARY KEY ("groupId","studentId")
);

-- CreateTable
CREATE TABLE "exam_attachments" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "exam_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_attachments_storageKey_key" ON "exam_attachments"("storageKey");

-- CreateIndex
CREATE INDEX "exam_attachments_examId_idx" ON "exam_attachments"("examId");

-- AddForeignKey
ALTER TABLE "class_rosters" ADD CONSTRAINT "class_rosters_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attachments" ADD CONSTRAINT "exam_attachments_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

