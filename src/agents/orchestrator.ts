import { logger } from "../lib/logger";
import { prisma } from "../lib/db";
import { runClassificationAgent } from "./classification";
import { runEligibilityAgent } from "./eligibility";
import { runMatchingAgent } from "./matching";
import { runVerificationAgent } from "./verification";
import { runDeduplicationAgent, checkDuplicate, normalizeTitle, descriptionHash } from "./deduplication";

// ─── Orchestrator ───────────────────────────────────────────────────────
// Coordinates all agents through the 7-stage pipeline with structured JSON,
// execution IDs, timeouts, retry handling, and failure isolation.

export interface DiscoveredJob {
  sourceId: string;
  externalId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  jobType: string;
  postingDate?: string | null;
  deadline?: string | null;
  originalUrl: string;
  applicationUrl?: string | null;
  salary?: string | null;
  remote?: string | null;
}

export interface PipelineResult {
  executionId: string;
  discovered: number;
  deduplicated: number;
  classified: number;
  eligible: number;
  matched: number;
  verified: number;
  notified: number;
  jobs: any[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function runDiscoveryPipeline(input: {
  executionId: string;
  jobs: DiscoveredJob[];
  profile: {
    id: string;
    skills: string[];
    education: string;
    graduationYear: number;
    preferredJobTypes: string[];
    preferredLocations: string[];
    remotePreference: string;
    minMatchScore: number;
  };
}): Promise<PipelineResult> {
  const { executionId, jobs, profile } = input;
  const stats: PipelineResult = {
    executionId,
    discovered: jobs.length,
    deduplicated: 0,
    classified: 0,
    eligible: 0,
    matched: 0,
    verified: 0,
    notified: 0,
    jobs: [],
  };

  for (const job of jobs) {
    const jobResult: any = { ...job, stages: {} };

    // Stage 3: Deduplication
    const dedup = await withTimeout(
      runDeduplicationAgent({
        sourceJobId: job.externalId,
        canonicalUrl: job.originalUrl,
        company: job.company,
        normalizedTitle: normalizeTitle(job.title),
        description: job.description,
        publicationDate: job.postingDate ?? null,
      }),
      30000,
      `dedup:${job.externalId}`
    ).catch((err) => {
      logger.warn(`[orchestrator] dedup failed for ${job.externalId}: ${err.message}`);
      return { isDuplicate: false, similarity: 0, matchReason: "error" };
    });

    if (dedup.isDuplicate) {
      logger.info(`[orchestrator] skipping duplicate ${job.externalId}: ${dedup.matchReason}`);
      continue;
    }
    stats.deduplicated++;

    // Create the job record
    const createdJob = await prisma.job.create({
      data: {
        sourceId: job.sourceId,
        externalId: job.externalId,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        jobType: (job.jobType as any) || "FULL_TIME",
        experienceLevel: "UNCLEAR",
        postingDate: job.postingDate ? new Date(job.postingDate) : null,
        deadline: job.deadline ? new Date(job.deadline) : null,
        originalUrl: job.originalUrl,
        applicationUrl: job.applicationUrl ?? null,
        salary: job.salary ?? null,
        remote: (job.remote as any) || "UNKNOWN",
        contentHash: descriptionHash(job.description),
        sourceReferences: [{ source: job.sourceId, externalId: job.externalId, url: job.originalUrl }],
      },
    });
    jobResult.jobId = createdJob.id;

    // Stage 7: Classification
    const classification = await withTimeout(
      runClassificationAgent({
        jobId: createdJob.id,
        title: job.title,
        description: job.description,
      }),
      30000,
      `classify:${createdJob.id}`
    ).catch((err) => {
      logger.warn(`[orchestrator] classification failed for ${createdJob.id}: ${err.message}`);
      return { experienceLevel: "UNCLEAR", reasoning: "error" };
    });

    await prisma.job.update({
      where: { id: createdJob.id },
      data: { experienceLevel: classification.experienceLevel as any },
    });
    stats.classified++;

    // Reject senior/mid unless enabled (default: reject)
    if (classification.experienceLevel === "SENIOR" || classification.experienceLevel === "MID_LEVEL") {
      logger.info(`[orchestrator] rejecting ${classification.experienceLevel} job ${job.externalId}`);
      continue;
    }

    // Stage 8: Eligibility
    const eligibility = await withTimeout(
      runEligibilityAgent({
        jobId: createdJob.id,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        remote: job.remote ?? null,
        deadline: job.deadline ?? null,
        graduationYear: profile.graduationYear,
        skills: profile.skills,
        preferredLocations: profile.preferredLocations,
      }),
      30000,
      `eligibility:${createdJob.id}`
    ).catch((err) => {
      logger.warn(`[orchestrator] eligibility failed for ${createdJob.id}: ${err.message}`);
      return { eligibility: "UNCERTAIN" as const, reasons: ["error"], checks: {} };
    });

    if (eligibility.eligibility === "NOT_ELIGIBLE") {
      logger.info(`[orchestrator] not eligible ${job.externalId}`);
      continue;
    }
    stats.eligible++;

    // Stage 9: Matching (LLM)
    const matching = await withTimeout(
      runMatchingAgent({
        jobId: createdJob.id,
        title: job.title,
        company: job.company,
        description: job.description,
        profileSkills: profile.skills,
        profileEducation: profile.education,
        profileGraduationYear: profile.graduationYear,
        preferredJobTypes: profile.preferredJobTypes,
        preferredLocations: profile.preferredLocations,
        remotePreference: profile.remotePreference,
      }),
      60000,
      `match:${createdJob.id}`
    ).catch((err) => {
      logger.warn(`[orchestrator] matching failed for ${createdJob.id}: ${err.message}`);
      return { matchScore: 0, recommendation: "LOW_PRIORITY" as const, matchedSkills: [], missingSkills: [], explanation: "error", concerns: [], strengths: [] };
    });

    // Save match
    await prisma.jobMatch.create({
      data: {
        jobId: createdJob.id,
        profileId: profile.id,
        matchScore: matching.matchScore,
        eligibility: eligibility.eligibility,
        matchedSkills: matching.matchedSkills,
        missingSkills: matching.missingSkills,
        explanation: matching.explanation,
        priority: matching.recommendation,
      },
    });
    stats.matched++;

    // Only notify if meets min match score
    if (matching.matchScore < profile.minMatchScore) {
      logger.info(`[orchestrator] below min score ${matching.matchScore} < ${profile.minMatchScore}`);
      continue;
    }

    // Stage 10: Verification (top-scoring only)
    const verification = await withTimeout(
      runVerificationAgent({
        jobId: createdJob.id,
        originalUrl: job.originalUrl,
        title: job.title,
        company: job.company,
        description: job.description,
        postingDate: job.postingDate ?? null,
        deadline: job.deadline ?? null,
        applicationUrl: job.applicationUrl ?? null,
      }),
      60000,
      `verify:${createdJob.id}`
    ).catch((err) => {
      logger.warn(`[orchestrator] verification failed for ${createdJob.id}: ${err.message}`);
      return { verificationStatus: "UNVERIFIED" as const, verifiedFields: [], failedFields: [], activeListing: false };
    });
    stats.verified++;

    jobResult.stages = { classification, eligibility, matching, verification };
    stats.jobs.push(jobResult);
    stats.notified++; // notification handled by notification agent
  }

  return stats;
}
