-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('TEXT', 'LINK', 'FILE');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "material_topics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "material_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "type" "MaterialType" NOT NULL DEFAULT 'TEXT',
    "url" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "storageKey" TEXT,
    "sha256" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MaterialStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "groupId" TEXT NOT NULL,
    "topicId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "material_topics_groupId_sortOrder_idx" ON "material_topics"("groupId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "material_topics_groupId_name_key" ON "material_topics"("groupId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "materials_storageKey_key" ON "materials"("storageKey");

-- CreateIndex
CREATE INDEX "materials_groupId_status_sortOrder_idx" ON "materials"("groupId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "materials_topicId_idx" ON "materials"("topicId");

-- AddForeignKey
ALTER TABLE "material_topics" ADD CONSTRAINT "material_topics_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "material_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
