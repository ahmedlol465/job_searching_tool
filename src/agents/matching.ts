import { OpenAI } from "openai";
import { logger } from "../lib/logger";
import { prisma } from "../lib/db";

// ─── Matching Agent ─────────────────────────────────────────────────────
// Uses an LLM to compare job descriptions against the user profile.
// Returns an explainable 0-100 match score with weighted breakdown.

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MATCH_PROMPT = `You are an expert technical recruiter. Compare a job description against a candidate profile and return a JSON match score (0-100) with explainable reasoning.

Weighting:
- Technical skills match: 30%
- Experience-level compatibility: 20%
- Education and graduation compatibility: 15%
- Location and remote eligibility: 15%
- Responsibilities compatibility: 10%
- Additional relevant skills (AI/ML/GenAI): 10%

Do NOT give a high score just because the job title matches. Be strict about experience level — reject senior/mid roles for a final-year student.

Return ONLY this JSON schema:
{
  "match_score": number (0-100),
  "experience_level": string,
  "eligibility": "ELIGIBLE" | "LIKELY_ELIGIBLE" | "UNCERTAIN" | "NOT_ELIGIBLE",
  "matched_skills": string[],
  "missing_skills": string[],
  "strengths": string[],
  "concerns": string[],
  "recommendation": "HIGH_PRIORITY" | "MEDIUM_PRIORITY" | "LOW_PRIORITY",
  "explanation": string (2-3 sentences)
}

Candidate profile:
{{PROFILE_SKILLS}}
Education: {{PROFILE_EDUCATION}}, graduating {{PROFILE_YEAR}}
Location: {{PROFILE_LOCATION}}
Preferred: {{PREFERRED_JOB_TYPES}}, {{PREFERRED_LOCATIONS}}
Remote preference: {{REMOTE_PREF}}

Job:
Title: {{JOB_TITLE}}
Company: {{JOB_COMPANY}}
Location: {{JOB_LOCATION}}
Description: {{JOB_DESCRIPTION}}

Output valid JSON only, no markdown fences.`;

// Deterministic fallback score when no LLM is configured
function deterministicScore(input: {
  profileSkills: string[];
  jobTitle: string;
  jobDescription: string;
  jobExperienceLevel: string;
}): { score: number; matched: string[]; missing: string[] } {
  const text = `${input.jobTitle} ${input.jobDescription}`.toLowerCase();
  const matched: string[] = [];
  const missing: string[] = [];
  for (const skill of input.profileSkills) {
    if (text.includes(skill.toLowerCase())) matched.push(skill);
    else missing.push(skill);
  }
  let score = 0;
  if (matched.length > 0) score += Math.min(30, (matched.length / input.profileSkills.length) * 30);
  const level = input.jobExperienceLevel.toLowerCase();
  if (level.includes("intern") || level.includes("junior") || level.includes("entry") || level.includes("graduate") || level.includes("fresh")) {
    score += 20;
  } else if (level.includes("mid")) {
    score += 5;
  } else if (level.includes("senior")) {
    score += 0;
  }
  score += matched.length > 0 ? 25 : 0;
  return { score: Math.min(100, Math.round(score)), matched, missing };
}

export async function runMatchingAgent(input: {
  jobId: string;
  title: string;
  company: string;
  description: string;
  profileSkills: string[];
  profileEducation: string;
  profileGraduationYear: number;
  preferredJobTypes: string[];
  preferredLocations: string[];
  remotePreference: string;
}) {
  const start = Date.now();
  logger.info("[matching] starting", { jobId: input.jobId });

  const hasLLM = Boolean(process.env.OPENAI_API_KEY?.trim());

  let result: any;
  if (!hasLLM) {
    const fallback = deterministicScore({
      profileSkills: input.profileSkills,
      jobTitle: input.title,
      jobDescription: input.description,
      jobExperienceLevel: input.title, // best available
    });
    result = {
      match_score: fallback.score,
      experience_level: "entry_level",
      eligibility: "LIKELY_ELIGIBLE",
      matched_skills: fallback.matched,
      missing_skills: fallback.missing,
      strengths: ["Skills match detected"],
      concerns: ["No LLM configured — score is deterministic fallback"],
      recommendation: fallback.score >= 85 ? "HIGH_PRIORITY" : fallback.score >= 70 ? "MEDIUM_PRIORITY" : "LOW_PRIORITY",
      explanation: "Deterministic fallback score based on skill keyword overlap.",
    };
  } else {
    const prompt = MATCH_PROMPT
      .replace("{{PROFILE_SKILLS}}", input.profileSkills.join(", "))
      .replace("{{PROFILE_EDUCATION}}", input.profileEducation)
      .replace("{{PROFILE_YEAR}}", String(input.profileGraduationYear))
      .replace("{{PROFILE_LOCATION}}", "")
      .replace("{{PREFERRED_JOB_TYPES}}", input.preferredJobTypes.join(", "))
      .replace("{{PREFERRED_LOCATIONS}}", input.preferredLocations.join(", "))
      .replace("{{REMOTE_PREF}}", input.remotePreference)
      .replace("{{JOB_TITLE}}", input.title)
      .replace("{{JOB_COMPANY}}", input.company)
      .replace("{{JOB_LOCATION}}", "")
      .replace("{{JOB_DESCRIPTION}}", input.description);

    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    result = JSON.parse(raw);
  }

  const tokenUsage = hasLLM ? (result as any).tokenUsage ?? 0 : 0;

  await prisma.agentExecution.create({
    data: {
      agentName: "matching",
      status: "COMPLETED",
      startedAt: new Date(start),
      completedAt: new Date(),
      tokenUsage,
      executionMetadata: {
        jobId: input.jobId,
        matchScore: result.match_score,
        recommendation: result.recommendation,
        durationMs: Date.now() - start,
        llm: hasLLM,
      },
    },
  });

  logger.info("[matching] completed", {
    jobId: input.jobId,
    score: result.match_score,
    recommendation: result.recommendation,
    durationMs: Date.now() - start,
  });

  return {
    jobId: input.jobId,
    matchScore: result.match_score,
    experienceLevel: result.experience_level,
    eligibility: result.eligibility,
    matchedSkills: result.matched_skills ?? [],
    missingSkills: result.missing_skills ?? [],
    strengths: result.strengths ?? [],
    concerns: result.concerns ?? [],
    recommendation: result.recommendation,
    explanation: result.explanation ?? "",
  };
}
