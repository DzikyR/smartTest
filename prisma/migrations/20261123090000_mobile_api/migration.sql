-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "allowMobileApp" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "client" TEXT,
ADD COLUMN     "clientSeq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "mobile_refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "authAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "mobile_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_devices" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "fcmToken" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "mobile_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempts_examId_status_idx" ON "attempts"("examId", "status");

-- Monitoring & pengumpulan otomatis hanya membaca percobaan yang sedang berjalan: index parsial kecil.
CREATE INDEX "attempts_in_progress_idx" ON "attempts"("examId") WHERE "status" = 'IN_PROGRESS';

-- CreateIndex
CREATE UNIQUE INDEX "mobile_refresh_tokens_tokenHash_key" ON "mobile_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "mobile_refresh_tokens_familyId_idx" ON "mobile_refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "mobile_refresh_tokens_userId_idx" ON "mobile_refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_devices_fcmToken_key" ON "mobile_devices"("fcmToken");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_devices_userId_deviceId_key" ON "mobile_devices"("userId", "deviceId");

-- AddForeignKey
ALTER TABLE "mobile_refresh_tokens" ADD CONSTRAINT "mobile_refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_devices" ADD CONSTRAINT "mobile_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
