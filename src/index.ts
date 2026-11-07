import { logger } from "./lib/logger";
import { prisma } from "./lib/db";
import { writeJson, appendJobRecord, saveReviewJob, ensureDataDir } from "./lib/file-store";

// ─── Entry Point ────────────────────────────────────────────────────────
// Runs the discovery pipeline: loads profile, discovers from enabled sources,
// normalizes, dedupes, classifies, checks eligibility, matches, verifies,
// saves, and notifies.
// Supports FILE_MODE=true for running without a database (writes to data/).

import { runDiscoveryPipeline } from "./agents/orchestrator";
import { registry } from "./sources/registry";
import { createJobSpyAdapter } from "./sources/jobspy";
import { createCareerPageAdapter } from "./sources/career-page";

const FILE_MODE = process.env.FILE_MODE === "true";

const KEYWORDS_BY_CATEGORY: Record<string, string[]> = {
  BACKEND: ["Backend Developer Intern", "Junior Backend Developer", "PHP Developer Intern", "Laravel Developer", "Node.js Developer", "NestJS Developer", "Junior API Developer"],
  FRONTEND: ["React Developer Intern", "Junior React Developer", "Frontend Developer Intern", "Junior Frontend Engineer", "TypeScript Developer"],
  FULL_STACK: ["Full Stack Developer Intern", "Junior Full Stack Developer", "Graduate Software Engineer"],
  GENERAL: ["Software Engineering Internship", "Software Engineer Intern", "Entry Level Software Engineer", "New Graduate Software Engineer", "Fresh Graduate Developer", "Junior Software Engineer", "Graduate Technology Program"],
  AI_ML: ["AI Engineer Intern", "Machine Learning Intern", "Junior AI Engineer", "Generative AI Intern"],
};

const DEFAULT_PROFILE = {
  id: "profile-default",
  name: "CS Student",
  location: "Cairo, Egypt",
  education: "Computer Science student — final year",
  graduationYear: 2027,
  skills: ["JavaScript", "TypeScript", "React", "Node.js", "Express.js", "NestJS", "PHP", "Laravel", "MySQL", "MongoDB", "PostgreSQL", "REST APIs", "Git", "GitHub"],
  preferredJobTypes: ["Internship", "Junior", "Entry-Level", "Graduate Program"],
  preferredLocations: ["Remote", "Egypt", "Europe", "UK", "USA", "Middle East"],
  remotePreference: "remote_first",
  minMatchScore: 70,
  notifyTelegram: true,
  notifyWhatsApp: false,
};

async function loadProfile(): Promise<any> {
  if (FILE_MODE) {
    ensureDataDir();
    return DEFAULT_PROFILE;
  }
  let profile = await prisma.userProfile.findFirst();
  if (!profile) {
    profile = await prisma.userProfile.create({ data: DEFAULT_PROFILE });
    logger.info("[profile] created default profile", { id: profile.id });
  }
  return profile;
}

async function loadSources(): Promise<void> {
  if (FILE_MODE) {
    registry.register(createJobSpyAdapter({ enabled: true }));
    registry.register(createCareerPageAdapter({ enabled: true }));
    return;
  }
  const sources = await prisma.jobSource.findMany({ where: { enabled: true } });
  for (const s of sources) {
    if (s.sourceType === "JOBSPY") {
      registry.register(createJobSpyAdapter({ enabled: true }));
    } else if (s.sourceType === "CAREER_PAGE") {
      const cfg = s.configuration as { baseUrls?: string } | null;
      registry.register(createCareerPageAdapter({ enabled: true, baseUrls: cfg?.baseUrls ? [cfg.baseUrls] : [] }));
    }
  }
  if (sources.length === 0) {
    registry.register(createJobSpyAdapter({ enabled: true }));
    registry.register(createCareerPageAdapter({ enabled: true }));
  }
}

async function loadSearchQueries(): Promise<string[]> {
  if (FILE_MODE) {
    return Object.entries(KEYWORDS_BY_CATEGORY).flatMap(([cat, kws]) => kws);
  }
  const queries = await prisma.searchQuery.findMany({ where: { enabled: true } });
  if (queries.length === 0) {
    for (const [category, keywords] of Object.entries(KEYWORDS_BY_CATEGORY)) {
      for (const keyword of keywords) {
        await prisma.searchQuery.create({ data: { keyword, category, enabled: true, priority: 0 } });
      }
    }
    return Object.entries(KEYWORDS_BY_CATEGORY).flatMap(([cat, kws]) => kws);
  }
  return queries.map((q) => q.keyword);
}

async function saveJobsToFile(jobs: any[]): Promise<void> {
  ensureDataDir();
  const out: any[] = [];
  for (const job of jobs) {
    out.push({
      jobId: job.jobId,
      externalId: job.externalId,
      title: job.title,
      company: job.company,
      location: job.location,
      jobType: job.jobType,
      experienceLevel: job.stages?.classification?.experienceLevel,
      postingDate: job.postingDate,
      deadline: job.deadline,
      originalUrl: job.originalUrl,
      applicationUrl: job.applicationUrl,
      salary: job.salary,
      remote: job.remote,
      contentHash: job.stages?.matching?.explanation ? "hashed" : undefined,
      matchScore: job.stages?.matching?.matchScore,
      eligibility: job.stages?.eligibility?.eligibility,
      matchedSkills: job.stages?.matching?.matchedSkills,
      missingSkills: job.stages?.matching?.missingSkills,
      strengths: job.stages?.matching?.strengths,
      concerns: job.stages?.matching?.concerns,
      recommendation: job.stages?.matching?.recommendation,
      explanation: job.stages?.matching?.explanation,
      verificationStatus: job.stages?.verification?.verificationStatus,
      verifiedFields: job.stages?.verification?.verifiedFields,
      failedFields: job.stages?.verification?.failedFields,
      activeListing: job.stages?.verification?.activeListing,
      verificationNotes: job.stages?.verification?.notes,
      stages: job.stages,
      savedAt: new Date().toISOString(),
    });
    saveReviewJob(out[out.length - 1]);
  }
  writeJson("jobs-discovered.json", out);
  logger.info("[file-store] wrote jobs", { count: out.length, dir: "data/" });
}

async function main(): Promise<any> {
  const executionId = `run-${Date.now()}`;
  logger.info("[job-hunter] starting", { executionId, fileMode: FILE_MODE });

  const profile = await loadProfile();
  await loadSources();
  const keywords = await loadSearchQueries();

  // Discover from all enabled sources concurrently
  const results = await registry.discoverAll(keywords, "GENERAL");

  const allJobs: any[] = [];
  for (const [sourceName, jobs] of Object.entries(results)) {
    for (const job of jobs) {
      allJobs.push({
        ...job,
        sourceId: sourceName,
      });
    }
  }

  // Run pipeline (DB path). In FILE_MODE, prisma calls inside agents will fail;
  // we run classification/eligibility/matching/verification directly in memory.
  let result: any = {
    executionId,
    discovered: allJobs.length,
    deduplicated: 0,
    classified: 0,
    eligible: 0,
    matched: 0,
    verified: 0,
    notified: 0,
    jobs: [],
  };

  if (FILE_MODE) {
    // In-memory pipeline without DB
    for (const job of allJobs) {
      // Dedup check (in-memory)
      const deduped = result.jobs.some((j: any) => j.externalId === job.externalId || j.originalUrl === job.originalUrl);
      if (deduped) continue;
      result.deduplicated++;

      // Classification
      const classification = await (await import("./agents/classification.ts")).classifyJob({
        jobId: job.externalId,
        title: job.title,
        description: job.description,
      });

      if (classification.experienceLevel === "SENIOR" || classification.experienceLevel === "MID_LEVEL") continue;
      result.classified++;

      // Eligibility
      const eligibility = await (await import("./agents/eligibility.ts")).evaluateEligibility({
        jobId: job.externalId,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        remote: job.remote ?? null,
        deadline: job.deadline ?? null,
        graduationYear: profile.graduationYear,
        skills: profile.skills,
        preferredLocations: profile.preferredLocations,
      });
      if (eligibility.eligibility === "NOT_ELIGIBLE") continue;
      result.eligible++;

      // Matching
      const matching = await (await import("./agents/matching.ts")).runMatchingAgent({
        jobId: job.externalId,
        title: job.title,
        company: job.company,
        description: job.description,
        profileSkills: profile.skills,
        profileEducation: profile.education,
        profileGraduationYear: profile.graduationYear,
        preferredJobTypes: profile.preferredJobTypes,
        preferredLocations: profile.preferredLocations,
        remotePreference: profile.remotePreference,
      });
      result.matched++;

      if (matching.matchScore < profile.minMatchScore) continue;

      // Verification
      const verification = await (await import("./agents/verification.ts")).verifyJob({
        jobId: job.externalId,
        originalUrl: job.originalUrl,
        title: job.title,
        company: job.company,
        description: job.description,
        postingDate: job.postingDate ?? null,
        deadline: job.deadline ?? null,
        applicationUrl: job.applicationUrl ?? null,
      });
      result.verified++;

      result.jobs.push({
        ...job,
        jobId: job.externalId,
        stages: { classification, eligibility, matching, verification },
      });
      result.notified++;
    }

    await saveJobsToFile(result.jobs);
  } else {
    result = await runDiscoveryPipeline({ executionId, jobs: allJobs, profile: profile as any });
    await saveJobsToFile(result.jobs);
  }

  logger.info("[job-hunter] complete", {
    executionId,
    discovered: result.discovered,
    deduplicated: result.deduplicated,
    classified: result.classified,
    eligible: result.eligible,
    matched: result.matched,
    verified: result.verified,
    notified: result.notified,
  });

  return result;
}

main()
  .then((r) => {
    logger.info("[job-hunter] done", r as unknown as Record<string, unknown>);
    process.exit(0);
  })
  .catch((err) => {
    logger.error("[job-hunter] fatal", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
