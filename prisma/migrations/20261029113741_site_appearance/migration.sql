-- CreateEnum
CREATE TYPE "BrandAssetKind" AS ENUM ('LOGO_LIGHT', 'LOGO_DARK', 'FAVICON');

-- CreateTable
CREATE TABLE "site_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "content_texts" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_texts_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "brand_assets" (
    "kind" "BrandAssetKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_assets_pkey" PRIMARY KEY ("kind")
);
