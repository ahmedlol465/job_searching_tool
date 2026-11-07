import { SourceAdapter, SourceJob } from "./adapter";
import { logger } from "../lib/logger";

// Re-export a lightweight fetch for career pages
import fetch from "node-fetch";

export const USER_AGENT = "AI-Job-Hunter/1.0";

interface FetchedPage {
  html: string;
  statusCode: number;
  finalUrl: string;
  loadTimeMs: number;
}

async function fetchPage(url: string, timeoutMs = 15000): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(timer);
    const html = await res.text();
    return { html, statusCode: res.status, finalUrl: res.url ?? url, loadTimeMs: Date.now() - startedAt };
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ─── Career Page Adapter ────────────────────────────────────────────────
// Fetches permitted public career pages (Greenhouse, Lever, company sites)
// using plain HTTP — no scrolling, no stealth, no LinkedIn automation.

export class CareerPageAdapter implements SourceAdapter {
  name = "career-page";
  sourceType = "CAREER_PAGE";
  private enabled: boolean;
  private baseUrls: string[];

  constructor(config?: { enabled?: boolean; baseUrls?: string[] }) {
    this.enabled = config?.enabled ?? true;
    this.baseUrls = config?.baseUrls ?? [];
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async discover(keywords: string[], category: string): Promise<SourceJob[]> {
    if (!this.enabled || this.baseUrls.length === 0) {
      logger.info("[career-page] disabled or no base URLs, skipping");
      return [];
    }
    const jobs: SourceJob[] = [];
    for (const baseUrl of this.baseUrls) {
      try {
        const page = await fetchPage(baseUrl, 15000);
        const found = this.extractJobsFromHtml(page.html, baseUrl, keywords);
        jobs.push(...found);
      } catch (e) {
        logger.warn("[career-page] fetch failed", { url: baseUrl, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return jobs;
  }

  private extractJobsFromHtml(html: string, baseUrl: string, keywords: string[]): SourceJob[] {
    // Lightweight keyword-based extraction from static career pages.
    // Real implementations would parse Greenhouse/Lever JSON or specific markup.
    const jobs: SourceJob[] = [];
    const lower = html.toLowerCase();
    const hasKeyword = keywords.some((k) => lower.includes(k.toLowerCase()));
    if (!hasKeyword) return jobs;

    // Heuristic: look for job-like links
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].trim();
      if (text.length < 5 || text.length > 120) continue;
      const kwMatch = keywords.some((k) => text.toLowerCase().includes(k.toLowerCase()));
      if (!kwMatch) continue;
      const url = href.startsWith("http") ? href : new URL(href, baseUrl).href;
      jobs.push({
        externalId: `career-${Buffer.from(url).toString("hex").slice(0, 12)}`,
        title: text,
        company: "Unknown",
        location: "",
        description: "",
        jobType: "FULL_TIME",
        originalUrl: url,
        applicationUrl: url,
      });
    }
    return jobs.slice(0, 20);
  }

  async healthcheck(): Promise<{ ok: boolean; error?: string }> {
    if (this.baseUrls.length === 0) return { ok: true };
    try {
      await fetchPage(this.baseUrls[0], 10000);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

export function createCareerPageAdapter(config?: { enabled?: boolean; baseUrls?: string[] }): CareerPageAdapter {
  return new CareerPageAdapter(config);
}
