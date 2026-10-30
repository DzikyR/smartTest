-- AlterTable
ALTER TABLE "access_codes" ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "test_sessions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requireStudentId" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "test_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateIndex
CREATE INDEX "test_sessions_examId_idx" ON "test_sessions"("examId");

-- CreateIndex
CREATE INDEX "session_participants_userId_status_idx" ON "session_participants"("userId", "status");

-- CreateIndex
CREATE INDEX "access_codes_sessionId_idx" ON "access_codes"("sessionId");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Target kode sesuai tipe (memperluas constraint Fase 2 dengan target SESSION)
ALTER TABLE "access_codes" DROP CONSTRAINT "access_codes_target_chk";
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_target_chk" CHECK (
  ("type" = 'CLASS' AND "groupId" IS NOT NULL AND "sessionId" IS NULL) OR
  ("type" = 'SESSION' AND "sessionId" IS NOT NULL AND "groupId" IS NULL)
);
-- Maksimal satu kode AKTIF per sesi
CREATE UNIQUE INDEX "access_codes_one_active_per_session" ON "access_codes" ("sessionId") WHERE "status" = 'ACTIVE';
