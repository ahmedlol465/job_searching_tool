-- Migration: 01_job_hunter
-- Created for AI Job Hunter entities

-- CreateEnum
CREATE TYPE "JobExperienceLevel" AS ENUM ('INTERNSHIP', 'SUMMER_INTERNSHIP', 'GRADUATE_PROGRAM', 'FRESH_GRADUATE', 'JUNIOR', 'ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('INTERNSHIP', 'FULL_TIME', 'PART_TIME', 'CONTRACT', 'APPRENTICESHIP');

-- CreateEnum
CREATE TYPE "JobRemote" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "location" TEXT NOT NULL,
    "education" TEXT NOT NULL,
    "graduationYear" INTEGER NOT NULL,
    "skills" TEXT[] NOT NULL DEFAULT '{}',
    "preferredJobTypes" TEXT[] NOT NULL DEFAULT '{}',
    "preferredLocations" TEXT[] NOT NULL DEFAULT '{}',
    "remotePreference" TEXT NOT NULL DEFAULT 'remote_first',
    "minMatchScore" INTEGER NOT NULL DEFAULT 70,
    "notifyTelegram" BOOLEAN NOT NULL DEFAULT true,
    "notifyWhatsApp" BOOLEAN NOT NULL DEFAULT false,
    "telegramChatId" TEXT,
    "whatsappPhone" TEXT,
    "cvUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configuration" JSONB,
    "lastSuccessfulRun" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchQuery" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL,
    "experienceLevel" "JobExperienceLevel" NOT NULL,
    "postingDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "originalUrl" TEXT NOT NULL,
    "applicationUrl" TEXT,
    "salary" TEXT,
    "remote" "JobRemote" NOT NULL DEFAULT 'UNKNOWN',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "contentHash" TEXT,
    "sourceReferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "eligibility" TEXT NOT NULL,
    "matchedSkills" TEXT[] NOT NULL DEFAULT '{}',
    "missingSkills" TEXT[] NOT NULL DEFAULT '{}',
    "explanation" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobNotification" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryStatus" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,

    CONSTRAINT "JobNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "tokenUsage" INTEGER NOT NULL DEFAULT 0,
    "executionMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_name_key" ON "JobSource"("name");

-- CreateIndex
CREATE INDEX "JobSource_enabled_idx" ON "JobSource"("enabled");

-- CreateIndex
CREATE INDEX "JobSource_sourceType_idx" ON "JobSource"("sourceType");

-- CreateIndex
CREATE INDEX "SearchQuery_enabled_idx" ON "SearchQuery"("enabled");

-- CreateIndex
CREATE INDEX "SearchQuery_category_idx" ON "SearchQuery"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Job_sourceId_externalId_key" ON "Job"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "Job_experienceLevel_idx" ON "Job"("experienceLevel");

-- CreateIndex
CREATE INDEX "Job_verificationStatus_idx" ON "Job"("verificationStatus");

-- CreateIndex
CREATE INDEX "Job_contentHash_idx" ON "Job"("contentHash");

-- CreateIndex
CREATE INDEX "Job_postingDate_idx" ON "Job"("postingDate");

-- CreateIndex
CREATE INDEX "Job_deadline_idx" ON "Job"("deadline");

-- CreateIndex
CREATE INDEX "Job_sourceId_idx" ON "Job"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_jobId_profileId_key" ON "JobMatch"("jobId", "profileId");

-- CreateIndex
CREATE INDEX "JobMatch_matchScore_idx" ON "JobMatch"("matchScore");

-- CreateIndex
CREATE INDEX "JobMatch_eligibility_idx" ON "JobMatch"("eligibility");

-- CreateIndex
CREATE INDEX "JobMatch_priority_idx" ON "JobMatch"("priority");

-- CreateIndex
CREATE INDEX "JobNotification_jobId_idx" ON "JobNotification"("jobId");

-- CreateIndex
CREATE INDEX "JobNotification_channel_idx" ON "JobNotification"("channel");

-- CreateIndex
CREATE INDEX "JobNotification_sentAt_idx" ON "JobNotification"("sentAt");

-- CreateIndex
CREATE INDEX "AgentExecution_agentName_status_idx" ON "AgentExecution"("agentName", "status");

-- CreateIndex
CREATE INDEX "AgentExecution_createdAt_idx" ON "AgentExecution"("createdAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobNotification" ADD CONSTRAINT "JobNotification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
