-- CreateTable
CREATE TABLE "features" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "features_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_role_access" (
    "featureKey" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_role_access_pkey" PRIMARY KEY ("featureKey","role")
);

-- AddForeignKey
ALTER TABLE "feature_role_access" ADD CONSTRAINT "feature_role_access_featureKey_fkey" FOREIGN KEY ("featureKey") REFERENCES "features"("key") ON DELETE CASCADE ON UPDATE CASCADE;
