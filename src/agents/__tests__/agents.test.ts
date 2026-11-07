import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

import { prisma } from "../lib/db";

const mockJobs: any[] = [];
const mockMatches: any[] = [];
const mockNotifications: any[] = [];
const mockExecutions: any[] = [];
const mockSources: any[] = [];

const p = prisma as any;

p.job.create = async (args: any) => {
  const id = `job-${mockJobs.length + 1}`;
  const row = { id, ...args.data };
  mockJobs.push(row);
  return row;
};
p.job.findFirst = async (args: any) => {
  if (args?.where?.externalId) {
    return mockJobs.find((j) => j.externalId === args.where.externalId) ?? null;
  }
  if (args?.where?.originalUrl) {
    return mockJobs.find((j) => j.originalUrl === args.where.originalUrl) ?? null;
  }
  return mockJobs[0] ?? null;
};
p.job.findMany = async (args: any) => {
  let results = mockJobs;
  if (args?.where?.company) {
    results = results.filter((j) => j.company === args.where.company);
  }
  return results;
};
p.job.update = async (args: any) => {
  const idx = mockJobs.findIndex((j) => j.id === args.where.id);
  if (idx >= 0) {
    mockJobs[idx] = { ...mockJobs[idx], ...args.data };
    return mockJobs[idx];
  }
  return null;
};
p.jobMatch.create = async (args: any) => {
  const id = `match-${mockMatches.length + 1}`;
  const row = { id, ...args.data };
  mockMatches.push(row);
  return row;
};
p.jobNotification.create = async (args: any) => {
  const id = `notif-${mockNotifications.length + 1}`;
  const row = { id, ...args.data };
  mockNotifications.push(row);
  return row;
};
p.agentExecution.create = async (args: any) => {
  const id = `exec-${mockExecutions.length + 1}`;
  const row = { id, ...args.data };
  mockExecutions.push(row);
  return row;
};
p.jobSource.findMany = async () => mockSources;
p.jobSource.create = async (args: any) => {
  const id = `src-${mockSources.length + 1}`;
  const row = { id, ...args.data };
  mockSources.push(row);
  return row;
};
p.jobSource.updateMany = async () => ({ count: 1 });
p.searchQuery.findMany = async () => [];
p.searchQuery.create = async (args: any) => args.data;
p.userProfile.findFirst = async () => null;
p.userProfile.create = async (args: any) => ({
  id: "profile-1",
  ...args.data,
});

import { classifyJob } from "../classification";
import { evaluateEligibility } from "../eligibility";
import {
  checkDuplicate,
  normalizeTitle,
  descriptionHash,
  similarity,
} from "../deduplication";
import { verifyJob } from "../verification";
import { runMatchingAgent } from "../matching";

const baseProfile = {
  id: "profile-1",
  skills: [
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "Laravel",
    "PHP",
    "MySQL",
  ],
  education: "Computer Science",
  graduationYear: 2027,
  preferredJobTypes: ["Internship", "Junior", "Entry-Level"],
  preferredLocations: ["Remote", "Egypt"],
  remotePreference: "remote_first",
  minMatchScore: 70,
};

describe("Classification Agent", () => {
  beforeEach(() => {
    mockJobs.length = 0;
  });

  it("1. classifies internship", async () => {
    const r = await classifyJob({
      jobId: "j1",
      title: "Backend Developer Intern",
      description: "We are hiring a backend intern to work with Laravel and PHP.",
    });
    assert.strictEqual(r.experienceLevel, "INTERNSHIP");
  });

  it("2. classifies junior position", async () => {
    const r = await classifyJob({
      jobId: "j2",
      title: "Junior Backend Developer",
      description: "Junior role for a recent graduate with Node.js experience.",
    });
    assert.strictEqual(r.experienceLevel, "JUNIOR");
  });

  it("3. classifies fresh graduate", async () => {
    const r = await classifyJob({
      jobId: "j3",
      title: "New Graduate Software Engineer",
      description: "Fresh graduate developer position for 2027 grads.",
    });
    assert.ok(
      ["FRESH_GRADUATE", "ENTRY_LEVEL", "GRADUATE_PROGRAM"].includes(
        r.experienceLevel,
      ),
      `Expected fresh-grad level, got ${r.experienceLevel}`,
    );
  });

  it("4. rejects senior jobs", async () => {
    const r = await classifyJob({
      jobId: "j4",
      title: "Senior Backend Engineer",
      description: "5+ years of experience required. Lead the backend team.",
    });
    assert.strictEqual(r.experienceLevel, "SENIOR");
  });

  it("4b. rejects mid-level jobs", async () => {
    const r = await classifyJob({
      jobId: "j5",
      title: "Mid-level Developer",
      description: "3+ years experience required.",
    });
    assert.strictEqual(r.experienceLevel, "MID_LEVEL");
  });
});

describe("Eligibility Agent", () => {
  it("5. remote eligibility detection", async () => {
    const r = await evaluateEligibility({
      jobId: "j6",
      title: "Remote Backend Intern",
      company: "Tech Co",
      location: "Remote — Worldwide",
      description: "Fully remote internship open worldwide.",
      remote: "REMOTE",
      deadline: "2027-12-31",
      graduationYear: 2027,
      skills: baseProfile.skills,
      preferredLocations: baseProfile.preferredLocations,
    });
    assert.strictEqual(r.checks.remoteEligible, true);
    assert.strictEqual(r.checks.countryEligible, true);
    assert.ok(
      ["ELIGIBLE", "LIKELY_ELIGIBLE"].includes(r.eligibility),
      `Expected eligible/likely, got ${r.eligibility}`,
    );
  });

  it("6. Egypt eligibility detection", async () => {
    const r = await evaluateEligibility({
      jobId: "j7",
      title: "Junior Developer",
      company: "Cairo Tech",
      location: "Cairo, Egypt",
      description: "On-site junior role in Cairo.",
      remote: "ONSITE",
      deadline: "2027-12-31",
      graduationYear: 2027,
      skills: baseProfile.skills,
      preferredLocations: baseProfile.preferredLocations,
    });
    assert.strictEqual(r.checks.countryEligible, true);
    assert.ok(r.eligibility !== "NOT_ELIGIBLE");
  });

  it("7. visa requirement detection", async () => {
    const r = await evaluateEligibility({
      jobId: "j8",
      title: "Junior Developer",
      company: "US Startup",
      location: "Remote",
      description: "Visa sponsorship required for this role.",
      remote: "REMOTE",
      deadline: "2027-12-31",
      graduationYear: 2027,
      skills: baseProfile.skills,
      preferredLocations: baseProfile.preferredLocations,
    });
    assert.strictEqual(r.checks.visaRequired, true);
    assert.ok(r.reasons.some((x) => x.toLowerCase().includes("visa")));
  });

  it("8. graduation year compatibility", async () => {
    const r = await evaluateEligibility({
      jobId: "j9",
      title: "Intern",
      company: "Co",
      location: "Remote",
      description: "Internship for students graduating 2027.",
      remote: "REMOTE",
      deadline: "2027-12-31",
      graduationYear: 2027,
      skills: baseProfile.skills,
      preferredLocations: baseProfile.preferredLocations,
    });
    assert.strictEqual(r.checks.graduationYearCompatible, true);
  });

  it("8b. expired listing detection", async () => {
    const r = await evaluateEligibility({
      jobId: "j10",
      title: "Intern",
      company: "Co",
      location: "Remote",
      description: "Internship.",
      remote: "REMOTE",
      deadline: "2025-01-01",
      graduationYear: 2027,
      skills: baseProfile.skills,
      preferredLocations: baseProfile.preferredLocations,
    });
    assert.strictEqual(r.checks.deadlineValid, false);
  });

  it("11. broken application URL detection", async () => {
    const r = await verifyJob({
      jobId: "j11",
      originalUrl: "https://example.com/job/1",
      title: "Intern",
      company: "Example Co",
      description: "Internship description.",
      applicationUrl: "https://nonexistent-domain-xyz123.com/apply",
    });
    assert.ok(
      r.failedFields.includes("applicationUrl"),
      `Expected applicationUrl in failed fields, got ${JSON.stringify(
        r.failedFields,
      )}`,
    );
  });
});

describe("Deduplication Agent", () => {
  beforeEach(() => {
    mockJobs.length = 0;
  });

  it("9. detects duplicate by source job ID", async () => {
    mockJobs.push({
      id: "existing-1",
      externalId: "ext-123",
      title: "Backend Intern",
      company: "Co",
      description: "desc",
      originalUrl: "https://example.com/1",
    });

    const r = await checkDuplicate({
      sourceJobId: "ext-123",
      company: "Co",
      normalizedTitle: normalizeTitle("Backend Intern"),
      description: "desc",
    });
    assert.strictEqual(r.isDuplicate, true);
    assert.strictEqual(r.matchReason, "Same source job ID");
  });

  it("9b. detects duplicate by canonical URL", async () => {
    mockJobs.push({
      id: "existing-2",
      externalId: "ext-999",
      title: "Different",
      company: "Co",
      description: "different desc",
      originalUrl: "https://example.com/same",
    });

    const r = await checkDuplicate({
      canonicalUrl: "https://example.com/same",
      company: "Co",
      normalizedTitle: normalizeTitle("Something Else"),
      description: "totally different",
    });
    assert.strictEqual(r.isDuplicate, true);
    assert.strictEqual(r.matchReason, "Same canonical URL");
  });

  it("9c. not a duplicate when no match", async () => {
    const r = await checkDuplicate({
      company: "New Co",
      normalizedTitle: normalizeTitle("Fresh Intern"),
      description: "brand new description here",
    });
    assert.strictEqual(r.isDuplicate, false);
  });
});

describe("Verification Agent", () => {
  it("10. marks unverified when source unreachable", async () => {
    const r = await verifyJob({
      jobId: "j12",
      originalUrl: "https://httpbin.org/status/404",
      title: "Intern",
      company: "Co",
      description: "desc",
    });
    assert.ok(
      ["FAILED", "UNVERIFIED"].includes(r.verificationStatus),
      `Expected FAILED/UNVERIFIED, got ${r.verificationStatus}`,
    );
  });
});

describe("Matching Agent (deterministic fallback)", () => {
  it("12. AI scoring consistency", async () => {
    const origKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "";
    const r = await runMatchingAgent({
      jobId: "j13",
      title: "Laravel Developer Intern",
      company: "Web Co",
      description:
        "We need a Laravel and PHP intern for backend work with MySQL and REST APIs.",
      profileSkills: baseProfile.skills,
      profileEducation: baseProfile.education,
      profileGraduationYear: baseProfile.graduationYear,
      preferredJobTypes: baseProfile.preferredJobTypes,
      preferredLocations: baseProfile.preferredLocations,
      remotePreference: baseProfile.remotePreference,
    });
    process.env.OPENAI_API_KEY = origKey;
    assert.ok(r.matchScore > 0, `Expected score > 0, got ${r.matchScore}`);
    assert.ok(r.matchedSkills.length > 0, "Expected matched skills");
    assert.ok(
      ["HIGH_PRIORITY", "MEDIUM_PRIORITY", "LOW_PRIORITY"].includes(
        r.recommendation,
      ),
    );
  });
});

console.log("All deterministic agent tests completed.");
