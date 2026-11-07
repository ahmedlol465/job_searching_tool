import { z } from "zod";

// ─── Shared agent I/O schemas ───────────────────────────────────────────

export const JobDiscoveryInputSchema = z.object({
  sourceId: z.string(),
  keywords: z.array(z.string()),
  category: z.string(),
});

export const JobDiscoveryOutputSchema = z.object({
  sourceId: z.string(),
  jobs: z.array(
    z.object({
      externalId: z.string(),
      title: z.string(),
      company: z.string(),
      location: z.string(),
      description: z.string().optional(),
      jobType: z.string(),
      postingDate: z.string().optional().nullable(),
      deadline: z.string().optional().nullable(),
      originalUrl: z.string().url(),
      applicationUrl: z.string().url().optional().nullable(),
      salary: z.string().optional().nullable(),
      remote: z.string().optional().nullable(),
    })
  ),
});

export const ClassificationInputSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  description: z.string(),
});

export const ClassificationOutputSchema = z.object({
  jobId: z.string(),
  experienceLevel: z.enum([
    "INTERNSHIP",
    "SUMMER_INTERNSHIP",
    "GRADUATE_PROGRAM",
    "FRESH_GRADUATE",
    "JUNIOR",
    "ENTRY_LEVEL",
    "MID_LEVEL",
    "SENIOR",
    "UNCLEAR",
  ]),
  reasoning: z.string(),
});

export const EligibilityInputSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  description: z.string(),
  remote: z.string().optional(),
  deadline: z.string().optional().nullable(),
  graduationYear: z.number(),
  skills: z.array(z.string()),
  preferredLocations: z.array(z.string()),
});

export const EligibilityOutputSchema = z.object({
  jobId: z.string(),
  eligibility: z.enum([
    "ELIGIBLE",
    "LIKELY_ELIGIBLE",
    "UNCERTAIN",
    "NOT_ELIGIBLE",
  ]),
  reasons: z.array(z.string()),
  checks: z.object({
    countryEligible: z.boolean(),
    remoteEligible: z.boolean(),
    visaRequired: z.boolean().optional(),
    studentEligible: z.boolean(),
    graduationYearCompatible: z.boolean(),
    experienceCompatible: z.boolean(),
    languageCompatible: z.boolean(),
    workAuthorization: z.boolean().optional(),
    enrollmentRequired: z.boolean().optional(),
    deadlineValid: z.boolean(),
  }),
});

export const MatchingInputSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  company: z.string(),
  description: z.string(),
  profileSkills: z.array(z.string()),
  profileEducation: z.string(),
  profileGraduationYear: z.number(),
  preferredJobTypes: z.array(z.string()),
  preferredLocations: z.array(z.string()),
  remotePreference: z.string(),
});

export const MatchingOutputSchema = z.object({
  jobId: z.string(),
  matchScore: z.number().min(0).max(100),
  experienceLevel: z.string(),
  eligibility: z.string(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  recommendation: z.enum(["HIGH_PRIORITY", "MEDIUM_PRIORITY", "LOW_PRIORITY"]),
});

export const VerificationInputSchema = z.object({
  jobId: z.string(),
  originalUrl: z.string().url(),
  title: z.string(),
  company: z.string(),
  description: z.string(),
  postingDate: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  applicationUrl: z.string().url().optional().nullable(),
});

export const VerificationOutputSchema = z.object({
  jobId: z.string(),
  verificationStatus: z.enum(["VERIFIED", "FAILED", "UNVERIFIED"]),
  verifiedFields: z.array(z.string()),
  failedFields: z.array(z.string()),
  activeListing: z.boolean(),
  notes: z.string().optional(),
});

export const DedupKeySchema = z.object({
  sourceJobId: z.string().optional(),
  canonicalUrl: z.string().url().optional(),
  company: z.string(),
  normalizedTitle: z.string(),
  descriptionHash: z.string(),
  publicationDate: z.string().optional().nullable(),
});

export type JobDiscoveryInput = z.infer<typeof JobDiscoveryInputSchema>;
export type JobDiscoveryOutput = z.infer<typeof JobDiscoveryOutputSchema>;
export type ClassificationInput = z.infer<typeof ClassificationInputSchema>;
export type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>;
export type EligibilityInput = z.infer<typeof EligibilityInputSchema>;
export type EligibilityOutput = z.infer<typeof EligibilityOutputSchema>;
export type MatchingInput = z.infer<typeof MatchingInputSchema>;
export type MatchingOutput = z.infer<typeof MatchingOutputSchema>;
export type VerificationInput = z.infer<typeof VerificationInputSchema>;
export type VerificationOutput = z.infer<typeof VerificationOutputSchema>;
