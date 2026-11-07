import { logger } from "../lib/logger";
import { prisma } from "../lib/db";

// ─── Classification Agent ───────────────────────────────────────────────
// Deterministic classification of job seniority from title + description.
// Never classifies on title alone; considers experience years, skills,
// education, and whether students/new grads are accepted.

const SENIOR_KEYWORDS = [
  "senior", "staff", "principal", "lead engineer", "engineering manager",
  "architect", "director", "head of", "vp ", "vice president",
];

const MID_KEYWORDS = [
  "mid.level", "mid level", "intermediate", "2+ years", "3+ years",
  "4+ years", "5+ years",
];

const INTERNSHIP_KEYWORDS = [
  "intern", "internship", "summer intern", "co-op", "coop",
  "placement", "trainee",
];

const GRADUATE_KEYWORDS = [
  "graduate program", "grad program", "new grad", "new graduate",
  "fresh graduate", "fresh grad", "entry level", "entry-level",
  "junior", "associate",
];

const EXPERIENCE_YEARS_REGEX = /(\d+)\s*\+?\s*years?/i;

export async function classifyJob(input: {
  jobId: string;
  title: string;
  description: string;
}): Promise<{
  experienceLevel:
    | "INTERNSHIP"
    | "SUMMER_INTERNSHIP"
    | "GRADUATE_PROGRAM"
    | "FRESH_GRADUATE"
    | "JUNIOR"
    | "ENTRY_LEVEL"
    | "MID_LEVEL"
    | "SENIOR"
    | "UNCLEAR";
  reasoning: string;
}> {
  const { title, description } = input;
  const text = `${title}\n${description}`.toLowerCase();
  const reasoning: string[] = [];

  // Senior rejection first (highest priority)
  for (const kw of SENIOR_KEYWORDS) {
    if (text.includes(kw)) {
      reasoning.push(`Title/description contains senior keyword: "${kw}"`);
      return {
        experienceLevel: "SENIOR",
        reasoning: reasoning.join("; "),
      };
    }
  }

  // Mid-level detection
  for (const kw of MID_KEYWORDS) {
    if (text.includes(kw)) {
      reasoning.push(`Mid-level keyword: "${kw}"`);
      const yearsMatch = text.match(EXPERIENCE_YEARS_REGEX);
      const years = yearsMatch ? parseInt(yearsMatch[1], 10) : undefined;
      if (years !== undefined && years >= 2) {
        return {
          experienceLevel: "MID_LEVEL",
          reasoning: `${reasoning.join("; ")}; ${years}+ years experience required`,
        };
      }
    }
  }

  // Internship detection
  for (const kw of INTERNSHIP_KEYWORDS) {
    if (text.includes(kw)) {
      reasoning.push(`Internship keyword: "${kw}"`);
      if (kw === "summer intern") {
        return {
          experienceLevel: "SUMMER_INTERNSHIP",
          reasoning: `${reasoning.join("; ")}; summer internship`,
        };
      }
      return {
        experienceLevel: "INTERNSHIP",
        reasoning: reasoning.join("; "),
      };
    }
  }

  // Graduate program / fresh graduate / junior / entry-level
  for (const kw of GRADUATE_KEYWORDS) {
    if (text.includes(kw)) {
      reasoning.push(`Graduate/entry keyword: "${kw}"`);
      if (kw.includes("graduate program") || kw.includes("grad program")) {
        return {
          experienceLevel: "GRADUATE_PROGRAM",
          reasoning: reasoning.join("; "),
        };
      }
      if (kw.includes("fresh graduate") || kw.includes("fresh grad")) {
        return {
          experienceLevel: "FRESH_GRADUATE",
          reasoning: reasoning.join("; "),
        };
      }
      if (kw.includes("junior")) {
        return {
          experienceLevel: "JUNIOR",
          reasoning: reasoning.join("; "),
        };
      }
      return {
        experienceLevel: "ENTRY_LEVEL",
        reasoning: reasoning.join("; "),
      };
    }
  }

  return {
    experienceLevel: "UNCLEAR",
    reasoning: "No clear seniority signal found in title or description",
  };
}

export async function runClassificationAgent(input: {
  jobId: string;
  title: string;
  description: string;
}) {
  const start = Date.now();
  logger.info("[classification] starting", { jobId: input.jobId });
  try {
    const result = await classifyJob(input);
    await prisma.agentExecution.create({
      data: {
        agentName: "classification",
        status: "COMPLETED",
        startedAt: new Date(start),
        completedAt: new Date(),
        executionMetadata: { jobId: input.jobId, experienceLevel: result.experienceLevel, durationMs: Date.now() - start },
      },
    });
    logger.info("[classification] completed", {
      jobId: input.jobId,
      level: result.experienceLevel,
      durationMs: Date.now() - start,
    });
    return result;
  } catch (error) {
    await prisma.agentExecution.create({
      data: {
        agentName: "classification",
        status: "FAILED",
        startedAt: new Date(start),
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      },
    });
    logger.error("[classification] failed", {
      jobId: input.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
