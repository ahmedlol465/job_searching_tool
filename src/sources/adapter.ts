import { logger } from "../lib/logger";

// ─── Source abstraction ─────────────────────────────────────────────────
// Each source independently configurable. If one fails, others continue.

export interface SourceJob {
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

export interface SourceAdapter {
  name: string;
  sourceType: string;
  isEnabled(): boolean;
  discover(keywords: string[], category: string): Promise<SourceJob[]>;
  healthcheck(): Promise<{ ok: boolean; error?: string }>;
}

export class SourceError extends Error {
  constructor(public source: string, public code: string, message: string) {
    super(message);
    this.name = "SourceError";
  }
}

export async function withSourceTiming<T>(adapter: SourceAdapter, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.info("[source] success", {
      source: adapter.name,
      durationMs: Date.now() - start,
    });
    return result;
  } catch (error) {
    logger.warn("[source] failed", {
      source: adapter.name,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
