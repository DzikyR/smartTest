-- CreateEnum
CREATE TYPE "ClassRole" AS ENUM ('TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PENDING', 'REMOVED');

-- CreateEnum
CREATE TYPE "JoinPolicy" AS ENUM ('AUTO', 'APPROVAL');

-- CreateEnum
CREATE TYPE "AccessCodeType" AS ENUM ('CLASS', 'SESSION');

-- CreateEnum
CREATE TYPE "CodeStatus" AS ENUM ('ACTIVE', 'DISABLED', 'REVOKED');

-- AlterTable
ALTER TABLE "group_members" ADD COLUMN     "blockRejoin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "joinedVia" TEXT,
ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "role" "ClassRole" NOT NULL DEFAULT 'STUDENT',
ADD COLUMN     "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "joinLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "joinPolicy" "JoinPolicy" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "requireStudentId" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "term" TEXT;

-- CreateTable
CREATE TABLE "access_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "AccessCodeType" NOT NULL,
    "groupId" TEXT,
    "status" "CodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "access_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_codes_code_key" ON "access_codes"("code");

-- CreateIndex
CREATE INDEX "access_codes_groupId_idx" ON "access_codes"("groupId");

-- CreateIndex
CREATE INDEX "group_members_groupId_status_idx" ON "group_members"("groupId", "status");

-- CreateIndex
CREATE INDEX "groups_ownerId_idx" ON "groups"("ownerId");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Target kode wajib sesuai tipe (target SESSION ditambahkan di Fase 4)
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_target_chk" CHECK ("type" <> 'CLASS' OR "groupId" IS NOT NULL);
-- Maksimal satu kode AKTIF per kelas; kode lama (REVOKED/DISABLED) tetap sebagai riwayat
CREATE UNIQUE INDEX "access_codes_one_active_per_group" ON "access_codes" ("groupId") WHERE "status" = 'ACTIVE';
