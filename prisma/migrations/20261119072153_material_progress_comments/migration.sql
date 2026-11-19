-- CreateTable
CREATE TABLE "material_progress" (
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "material_progress_pkey" PRIMARY KEY ("materialId","userId")
);

-- CreateTable
CREATE TABLE "material_comments" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "materialId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "material_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_progress_userId_idx" ON "material_progress"("userId");

-- CreateIndex
CREATE INDEX "material_comments_materialId_createdAt_idx" ON "material_comments"("materialId", "createdAt");

-- AddForeignKey
ALTER TABLE "material_progress" ADD CONSTRAINT "material_progress_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_progress" ADD CONSTRAINT "material_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_comments" ADD CONSTRAINT "material_comments_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_comments" ADD CONSTRAINT "material_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
