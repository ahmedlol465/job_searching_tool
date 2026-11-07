import { logger } from "../lib/logger";
import { prisma } from "../lib/db";

// ─── Eligibility Agent ──────────────────────────────────────────────────
// Determines whether the user can realistically apply. Never invents
// eligibility info. Returns ELIGIBLE / LIKELY_ELIGIBLE / UNCERTAIN / NOT_ELIGIBLE.

const EGYPT = "egypt";
const CAIRO = "cairo";

export async function evaluateEligibility(input: {
  jobId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  remote?: string | null;
  deadline?: string | null;
  graduationYear: number;
  skills: string[];
  preferredLocations: string[];
}): Promise<{
  eligibility: "ELIGIBLE" | "LIKELY_ELIGIBLE" | "UNCERTAIN" | "NOT_ELIGIBLE";
  reasons: string[];
  checks: {
    countryEligible: boolean;
    remoteEligible: boolean;
    visaRequired?: boolean;
    studentEligible: boolean;
    graduationYearCompatible: boolean;
    experienceCompatible: boolean;
    languageCompatible: boolean;
    workAuthorization?: boolean;
    enrollmentRequired?: boolean;
    deadlineValid: boolean;
  };
}> {
  const {
    title, company, location, description, remote, deadline,
    graduationYear, skills, preferredLocations,
  } = input;
  const text = `${title} ${description} ${location}`.toLowerCase();
  const reasons: string[] = [];
  const checks: any = {
    countryEligible: false,
    remoteEligible: false,
    studentEligible: true,
    graduationYearCompatible: true,
    experienceCompatible: true,
    languageCompatible: true,
    deadlineValid: true,
  };

  // 1. Country eligibility
  const locLower = location.toLowerCase();
  const isEgypt = locLower.includes(EGYPT) || locLower.includes(CAIRO);
  const isRemoteWorldwide = text.includes("worldwide") || text.includes("anywhere") || text.includes("globally");
  const remoteStr = (remote ?? "").toLowerCase();
  const isRemote = remoteStr === "remote" || text.includes("remote");

  if (isEgypt) {
    checks.countryEligible = true;
    reasons.push("Location is in Egypt — eligible");
  } else if (isRemoteWorldwide) {
    checks.countryEligible = true;
    checks.remoteEligible = true;
    reasons.push("Remote worldwide — eligible regardless of location");
  } else if (isRemote && preferredLocations.some(p => text.includes(p.toLowerCase()))) {
    checks.countryEligible = true;
    checks.remoteEligible = true;
    reasons.push("Remote in a preferred location");
  } else {
    checks.countryEligible = false;
    reasons.push(`Location "${location}" is not Egypt and not confirmed worldwide remote`);
  }

  // 2. Remote-work eligibility (never assume remote = worldwide)
  if (isRemote) {
    checks.remoteEligible = true;
    reasons.push("Position is remote");
  } else if (isEgypt) {
    checks.remoteEligible = false;
    reasons.push("On-site in Egypt — eligible if user is in Cairo/Egypt");
  } else {
    checks.remoteEligible = false;
    reasons.push("Not remote and not in Egypt");
  }

  // 3. Visa requirements (detect mentions, never assume)
  const visaMentions = text.match(/visa|sponsorship|work permit|work authorization/i);
  if (visaMentions) {
    checks.visaRequired = true;
    reasons.push("Visa/sponsorship mentioned — eligibility uncertain without confirmation");
  }

  // 4. Student eligibility
  const studentMentions = text.match(/student|current enrollment|enrolled|pursuing/i);
  if (studentMentions) {
    checks.studentEligible = true;
    reasons.push("Students accepted");
  } else if (text.includes("internship") || text.includes("graduate")) {
    checks.studentEligible = true;
    reasons.push("Internship/graduate role — typically student-eligible");
  }

  // 5. Graduation year compatibility
  const currentYear = new Date().getFullYear();
  if (graduationYear >= currentYear) {
    checks.graduationYearCompatible = true;
    reasons.push(`Graduation year ${graduationYear} is current or future — compatible`);
  } else {
    checks.graduationYearCompatible = false;
    reasons.push(`Graduation year ${graduationYear} has passed`);
  }

  // 6. Experience requirements
  const yearsMatch = text.match(/(\d+)\s*\+?\s*years?\s*of\s*experience/i);
  const yearsRequired = yearsMatch ? parseInt(yearsMatch[1], 10) : 0;
  if (yearsRequired === 0 || yearsRequired <= 1) {
    checks.experienceCompatible = true;
    reasons.push("No significant professional experience required");
  } else if (yearsRequired >= 3) {
    checks.experienceCompatible = false;
    reasons.push(`${yearsRequired}+ years experience required — not entry-level`);
  } else {
    checks.experienceCompatible = false;
    reasons.push(`${yearsRequired} years experience required — may exceed entry-level`);
  }

  // 7. Language requirements (assume English OK unless stated otherwise)
  checks.languageCompatible = true;

  // 8. Work authorization
  checks.workAuthorization = checks.countryEligible;

  // 9. Enrollment required
  checks.enrollmentRequired = !!studentMentions;

  // 10. Deadline validity
  if (deadline) {
    const deadlineDate = new Date(deadline);
    checks.deadlineValid = !isNaN(deadlineDate.getTime()) && deadlineDate > new Date();
    if (!checks.deadlineValid) reasons.push("Application deadline has passed");
  }

  // Determine eligibility
  // remoteEligible is informational (not remote ≠ ineligible — on-site in Egypt
  // is fine for an Egypt-based user). countryEligible is the location gate.
  let eligibility: "ELIGIBLE" | "LIKELY_ELIGIBLE" | "UNCERTAIN" | "NOT_ELIGIBLE";

  if (
    !checks.countryEligible ||
    !checks.experienceCompatible ||
    !checks.deadlineValid
  ) {
    eligibility = "NOT_ELIGIBLE";
  } else if (checks.visaRequired || checks.enrollmentRequired || !checks.studentEligible) {
    eligibility = "LIKELY_ELIGIBLE";
  } else if (!checks.graduationYearCompatible) {
    eligibility = "LIKELY_ELIGIBLE";
  } else {
    eligibility = "ELIGIBLE";
  }

  return { eligibility, reasons, checks };
}

export async function runEligibilityAgent(input: {
  jobId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  remote?: string | null;
  deadline?: string | null;
  graduationYear: number;
  skills: string[];
  preferredLocations: string[];
}) {
  const start = Date.now();
  logger.info("[eligibility] starting", { jobId: input.jobId });
  try {
    const result = await evaluateEligibility(input);
    await prisma.agentExecution.create({
      data: {
        agentName: "eligibility",
        status: "COMPLETED",
        startedAt: new Date(start),
        completedAt: new Date(),
        executionMetadata: { jobId: input.jobId, eligibility: result.eligibility, durationMs: Date.now() - start },
      },
    });
    logger.info("[eligibility] completed", {
      jobId: input.jobId,
      eligibility: result.eligibility,
      durationMs: Date.now() - start,
    });
    return result;
  } catch (error) {
    await prisma.agentExecution.create({
      data: {
        agentName: "eligibility",
        status: "FAILED",
        startedAt: new Date(start),
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
