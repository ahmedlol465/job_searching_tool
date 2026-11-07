import { SourceAdapter, SourceJob, withSourceTiming } from "./adapter";
import { logger } from "../lib/logger";
import { prisma } from "../lib/db";

// ─── Source Registry ────────────────────────────────────────────────────
// Keeps every source independently configurable and isolated.

export class SourceRegistry {
  private adapters = new Map<string, SourceAdapter>();

  register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.name, adapter);
    logger.info("[registry] registered", { source: adapter.name, type: adapter.sourceType });
  }

  get(name: string): SourceAdapter | undefined {
    return this.adapters.get(name);
  }

  enabled(): SourceAdapter[] {
    return Array.from(this.adapters.values()).filter((a) => a.isEnabled());
  }

  async healthcheckAll(): Promise<Record<string, { ok: boolean; error?: string }>> {
    const results: Record<string, { ok: boolean; error?: string }> = {};
    for (const [name, adapter] of this.adapters) {
      try {
        results[name] = await adapter.healthcheck();
      } catch (e) {
        results[name] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    return results;
  }

  async safeDbUpdate(op: () => Promise<unknown>): Promise<void> {
    try {
      await op();
    } catch {
      // DB unavailable (e.g. file mode) — do not crash discovery.
    }
  }

  async discoverAll(keywords: string[], category: string): Promise<Record<string, SourceJob[]>> {
    const results: Record<string, SourceJob[]> = {};
    const enabled = this.enabled();
    logger.info("[registry] discovering", { sources: enabled.length, keywords: keywords.length, category });

    // Run independent source searches concurrently within documented limits (max 2 concurrent)
    const concurrency = 2;
    const queue = [...enabled];
    let i = 0;
    const run = async () => {
      while (i < queue.length) {
        const adapter = queue[i++];
        try {
          const jobs = await withSourceTiming(adapter, () => adapter.discover(keywords, category));
          results[adapter.name] = jobs;
          await this.safeDbUpdate(() => prisma.jobSource.updateMany({
            where: { name: adapter.name },
            data: { lastSuccessfulRun: new Date(), lastError: null },
          }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          results[adapter.name] = [];
          await this.safeDbUpdate(() => prisma.jobSource.updateMany({
            where: { name: adapter.name },
            data: { lastError: msg },
          }));
          logger.warn("[registry] source failed", { source: adapter.name, error: msg });
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => run());
    await Promise.all(workers);

    const total = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
    logger.info("[registry] discovery complete", { totalJobs: total });
    return results;
  }
}

export const registry = new SourceRegistry();
