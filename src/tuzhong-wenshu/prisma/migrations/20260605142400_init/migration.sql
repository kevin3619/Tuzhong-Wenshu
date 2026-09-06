-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "email" TEXT,
    "avatarUrl" TEXT,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'free',
    "subscriptionExpiresAt" TEXT,
    "dailyQuotaUsed" INTEGER NOT NULL DEFAULT 0,
    "dailyQuotaLimit" INTEGER NOT NULL DEFAULT 3000,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "status" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "novels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "genre" TEXT,
    "status" TEXT NOT NULL DEFAULT 'writing',
    "targetWordCount" INTEGER,
    "currentWordCount" INTEGER NOT NULL DEFAULT 0,
    "healthScore" INTEGER,
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "novels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "volumes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "coreObjective" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "volumes_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "volumeId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "orderIndex" INTEGER NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "versionHistory" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "chapters_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chapters_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "volumes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "gender" TEXT,
    "age" INTEGER,
    "role" TEXT,
    "appearance" TEXT,
    "personality" TEXT,
    "background" TEXT,
    "abilities" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "positionX" INTEGER,
    "positionY" INTEGER,
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "characters_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "character_relationships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "strength" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "character_relationships_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "character_relationships_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "world_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parentId" TEXT,
    "metadata" TEXT,
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "world_settings_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "world_settings_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "world_settings" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "foreshadowings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT,
    "plantedChapterId" TEXT,
    "plantedText" TEXT,
    "plannedResolveChapterId" TEXT,
    "plannedResolveDescription" TEXT,
    "actualResolveChapterId" TEXT,
    "actualResolveStatus" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "importance" INTEGER NOT NULL DEFAULT 3,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderChaptersBefore" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TEXT NOT NULL DEFAULT '',
    "resolvedAt" TEXT,
    CONSTRAINT "foreshadowings_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "foreshadowings_plantedChapterId_fkey" FOREIGN KEY ("plantedChapterId") REFERENCES "chapters" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "foreshadowings_plannedResolveChapterId_fkey" FOREIGN KEY ("plannedResolveChapterId") REFERENCES "chapters" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "foreshadowings_actualResolveChapterId_fkey" FOREIGN KEY ("actualResolveChapterId") REFERENCES "chapters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tomato_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chapterId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "aiTrace" INTEGER,
    "coherence" INTEGER,
    "homogeneity" INTEGER,
    "shadowBanRisk" INTEGER,
    "excitementDensity" INTEGER,
    "immersion" INTEGER,
    "coldStart" INTEGER,
    "overallScore" INTEGER,
    "issues" TEXT,
    "suggestions" TEXT,
    "createdAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "tomato_reports_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tomato_reports_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "writing_styles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "presetCategory" TEXT,
    "parameters" TEXT NOT NULL DEFAULT '{}',
    "sampleText" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "writing_styles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_model_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT,
    "baseUrl" TEXT,
    "modelName" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "usageStats" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ai_model_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reference_works" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "genre" TEXT,
    "content" TEXT,
    "fileUrl" TEXT,
    "styleAnalysis" TEXT,
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "reference_works_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "planType" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "payScreenshot" TEXT,
    "auditTime" TEXT,
    "createdAt" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configKey" TEXT NOT NULL,
    "configValue" TEXT,
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT ''
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_isAdmin_idx" ON "users"("isAdmin");

-- CreateIndex
CREATE INDEX "novels_userId_idx" ON "novels"("userId");

-- CreateIndex
CREATE INDEX "novels_status_idx" ON "novels"("status");

-- CreateIndex
CREATE INDEX "volumes_novelId_idx" ON "volumes"("novelId");

-- CreateIndex
CREATE INDEX "volumes_novelId_orderIndex_idx" ON "volumes"("novelId", "orderIndex");

-- CreateIndex
CREATE INDEX "chapters_novelId_idx" ON "chapters"("novelId");

-- CreateIndex
CREATE INDEX "chapters_novelId_orderIndex_idx" ON "chapters"("novelId", "orderIndex");

-- CreateIndex
CREATE INDEX "chapters_volumeId_idx" ON "chapters"("volumeId");

-- CreateIndex
CREATE INDEX "characters_novelId_idx" ON "characters"("novelId");

-- CreateIndex
CREATE INDEX "characters_novelId_role_idx" ON "characters"("novelId", "role");

-- CreateIndex
CREATE INDEX "world_settings_novelId_idx" ON "world_settings"("novelId");

-- CreateIndex
CREATE INDEX "world_settings_novelId_category_idx" ON "world_settings"("novelId", "category");

-- CreateIndex
CREATE INDEX "foreshadowings_novelId_idx" ON "foreshadowings"("novelId");

-- CreateIndex
CREATE INDEX "foreshadowings_novelId_status_idx" ON "foreshadowings"("novelId", "status");

-- CreateIndex
CREATE INDEX "tomato_reports_chapterId_idx" ON "tomato_reports"("chapterId");

-- CreateIndex
CREATE INDEX "writing_styles_userId_idx" ON "writing_styles"("userId");

-- CreateIndex
CREATE INDEX "ai_model_configs_userId_idx" ON "ai_model_configs"("userId");

-- CreateIndex
CREATE INDEX "reference_works_userId_idx" ON "reference_works"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_orderNo_key" ON "payments"("orderNo");

-- CreateIndex
CREATE INDEX "payments_userId_idx" ON "payments"("userId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_configKey_key" ON "system_config"("configKey");
