import { logger } from "../lib/logger";
import { prisma } from "../lib/db";
import { createHash } from "crypto";

// ─── Deduplication Agent ────────────────────────────────────────────────
// Prevents duplicate notifications. Uses source job ID, canonical URL,
// company name, normalized title, description similarity, publication date.

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function descriptionHash(desc: string): string {
  return createHash("sha256").update(desc || "").digest("hex").slice(0, 16);
}

export function similarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export interface DedupResult {
  isDuplicate: boolean;
  existingJobId?: string;
  matchReason: string;
  similarity: number;
}

export async function checkDuplicate(input: {
  sourceJobId?: string;
  canonicalUrl?: string;
  company: string;
  normalizedTitle: string;
  description: string;
  publicationDate?: string | null;
}): Promise<DedupResult> {
  const { sourceJobId, canonicalUrl, company, normalizedTitle, description, publicationDate } = input;
  const descHash = descriptionHash(description);

  // Exact match on source job ID
  if (sourceJobId) {
    const existing = await prisma.job.findFirst({
      where: { externalId: sourceJobId },
      select: { id: true, externalId: true, title: true, company: true },
    });
    if (existing) {
      return { isDuplicate: true, existingJobId: existing.id, matchReason: "Same source job ID", similarity: 1 };
    }
  }

  // Exact match on canonical URL
  if (canonicalUrl) {
    const existing = await prisma.job.findFirst({
      where: { originalUrl: canonicalUrl },
      select: { id: true, originalUrl: true, title: true, company: true },
    });
    if (existing) {
      return { isDuplicate: true, existingJobId: existing.id, matchReason: "Same canonical URL", similarity: 1 };
    }
  }

  // Fuzzy match: same company + similar title + similar description
  const existing = await prisma.job.findMany({
    where: { company },
    select: { id: true, title: true, description: true, externalId: true, originalUrl: true },
  });

  let best: DedupResult | null = null;
  for (const job of existing) {
    const simTitle = similarity(normalizedTitle, normalizeTitle(job.title));
    const simDesc = similarity(description, job.description);
    const combined = simTitle * 0.6 + simDesc * 0.4;
    if (combined > 0.75) {
      if (!best || combined > best.similarity) {
        best = {
          isDuplicate: true,
          existingJobId: job.id,
          matchReason: "Same company with similar title and description",
          similarity: combined,
        };
      }
    }
  }

  if (best) return best;

  return { isDuplicate: false, similarity: 0, matchReason: "No duplicate found" };
}

export async function runDeduplicationAgent(input: {
  sourceJobId?: string;
  canonicalUrl?: string;
  company: string;
  normalizedTitle: string;
  description: string;
  publicationDate?: string | null;
}) {
  const start = Date.now();
  logger.info("[dedup] starting", { company: input.company, title: input.normalizedTitle });
  try {
    const result = await checkDuplicate(input);
    await prisma.agentExecution.create({
      data: {
        agentName: "deduplication",
        status: "COMPLETED",
        startedAt: new Date(start),
        completedAt: new Date(),
        executionMetadata: {
          company: input.company,
          isDuplicate: result.isDuplicate,
          similarity: result.similarity,
          durationMs: Date.now() - start,
        },
      },
    });
    logger.info("[dedup] completed", {
      isDuplicate: result.isDuplicate,
      similarity: result.similarity,
      durationMs: Date.now() - start,
    });
    return result;
  } catch (error) {
    await prisma.agentExecution.create({
      data: {
        agentName: "deduplication",
        status: "FAILED",
        startedAt: new Date(start),
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
