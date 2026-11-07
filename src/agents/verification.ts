import { logger } from "../lib/logger";
import { prisma } from "../lib/db";

// ─── Verification Agent ─────────────────────────────────────────────────
// Verifies each promising job against the original source. Never fabricates.
// Marks UNVERIFIED if verification fails.

export interface VerificationResult {
  jobId: string;
  verificationStatus: "VERIFIED" | "FAILED" | "UNVERIFIED";
  verifiedFields: string[];
  failedFields: string[];
  activeListing: boolean;
  notes?: string;
}

// Minimal inline fetch so verification has no hard dependency on a scraper module.
async function fetchUrl(url: string, timeoutMs = 15000): Promise<{ ok: boolean; status?: number; text?: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AI-Job-Hunter/1.0 (+verified discovery)" },
    });
    clearTimeout(timer);
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function verifyJob(input: {
  jobId: string;
  originalUrl: string;
  title: string;
  company: string;
  description: string;
  postingDate?: string | null;
  deadline?: string | null;
  applicationUrl?: string | null;
}): Promise<VerificationResult> {
  const { originalUrl, title, company, description, applicationUrl } = input;
  const verifiedFields: string[] = [];
  const failedFields: string[] = [];
  let activeListing = false;
  let notes: string[] = [];

  const fetched = await fetchUrl(originalUrl);
  if (!fetched.ok) {
    failedFields.push("originalUrl");
    notes.push(`Source URL returned ${fetched.status ?? "error"}: ${fetched.error ?? ""}`);
  } else {
    verifiedFields.push("originalUrl");
    const body = (fetched.text ?? "").toLowerCase();
    const titleLower = title.toLowerCase();
    const companyLower = company.toLowerCase();

    // Check company identity
    if (body.includes(companyLower)) {
      verifiedFields.push("company");
    } else {
      failedFields.push("company");
      notes.push("Company name not found on source page");
    }

    // Check job title
    if (body.includes(titleLower)) {
      verifiedFields.push("title");
    } else {
      // Title may be phrased differently; mark as unverified but not failed
      notes.push("Exact title not found on source page (may be paraphrased)");
    }

    // Check whether listing is still active (404 / filled / removed signals)
    const removedSignals = ["job no longer available", "position filled", "this job has been removed", "404", "not found"];
    const isRemoved = removedSignals.some((s) => body.includes(s));
    if (isRemoved) {
      activeListing = false;
      failedFields.push("activeListing");
      notes.push("Listing appears to be removed or filled");
    } else {
      activeListing = true;
      verifiedFields.push("activeListing");
    }
  }

  // Check application URL
  if (applicationUrl) {
    const appFetched = await fetchUrl(applicationUrl);
    if (appFetched.ok) {
      verifiedFields.push("applicationUrl");
    } else {
      failedFields.push("applicationUrl");
      notes.push(`Application URL not reachable: ${appFetched.error ?? appFetched.status}`);
    }
  }

  // Determine status
  let status: "VERIFIED" | "FAILED" | "UNVERIFIED";
  if (failedFields.length > 0) {
    status = "FAILED";
  } else if (verifiedFields.length >= 2 && activeListing) {
    status = "VERIFIED";
  } else {
    status = "UNVERIFIED";
  }

  return {
    jobId: input.jobId,
    verificationStatus: status,
    verifiedFields,
    failedFields,
    activeListing,
    notes: notes.length ? notes.join("; ") : undefined,
  };
}

export async function runVerificationAgent(input: {
  jobId: string;
  originalUrl: string;
  title: string;
  company: string;
  description: string;
  postingDate?: string | null;
  deadline?: string | null;
  applicationUrl?: string | null;
}) {
  const start = Date.now();
  logger.info("[verification] starting", { jobId: input.jobId, company: input.company });
  try {
    const result = await verifyJob(input);
    await prisma.job.update({
      where: { id: input.jobId },
      data: { verificationStatus: result.verificationStatus },
    });
    await prisma.agentExecution.create({
      data: {
        agentName: "verification",
        status: "COMPLETED",
        startedAt: new Date(start),
        completedAt: new Date(),
        executionMetadata: {
          jobId: input.jobId,
          status: result.verificationStatus,
          verifiedFields: result.verifiedFields,
          failedFields: result.failedFields,
          activeListing: result.activeListing,
          durationMs: Date.now() - start,
        },
      },
    });
    logger.info("[verification] completed", {
      jobId: input.jobId,
      status: result.verificationStatus,
      durationMs: Date.now() - start,
    });
    return result;
  } catch (error) {
    await prisma.agentExecution.create({
      data: {
        agentName: "verification",
        status: "FAILED",
        startedAt: new Date(start),
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
