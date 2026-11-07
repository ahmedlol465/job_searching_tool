import { SourceAdapter, SourceJob } from "./adapter";
import { logger } from "../lib/logger";

// ─── JobSpy Adapter ─────────────────────────────────────────────────────
// JobSpy (https://github.com/speedyapply/JobSpy) scrapes Indeed, Glassdoor,
// ZipRecruiter, Bayt, LinkedIn (jobs only), etc.
// Only enabled for sources whose terms permit automated access.
// This adapter shells out to the JobSpy Python package where installed.

export class JobSpyAdapter implements SourceAdapter {
  name = "jobspy";
  sourceType = "JOBSPY";
  private enabled: boolean;

  constructor(config?: { enabled?: boolean }) {
    this.enabled = config?.enabled ?? false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async discover(keywords: string[], category: string): Promise<SourceJob[]> {
    if (!this.enabled) {
      logger.info("[jobspy] disabled, skipping");
      return [];
    }
    logger.info("[jobspy] discovering", { keywords, category });

    // Try running JobSpy via Python. If not installed, return empty with a clear warning.
    try {
      const { execFile } = await import("child_process");
      const python = await this.findPython();
      if (!python) {
        logger.warn("[jobspy] Python not found — JobSpy adapter unavailable");
        return [];
      }

      const script = `
import json, sys
try:
    from jobspy import scrape_jobs
except ImportError:
    print(json.dumps([])); sys.exit(0)

jobs = scrape_jobs(
    site_name=["indeed", "glassdoor", "zip_recruiter", "bayt"],
    search_term="${keywords.join(" ")}",
    results_wanted=20,
    hours_old=72,
    country_indeed="Egypt",
)
print(json.dumps([{
  "externalId": str(j.get("id", "")),
  "title": j.get("title", ""),
  "company": j.get("company", ""),
  "location": j.get("location", ""),
  "description": j.get("description", ""),
  "jobType": j.get("job_type", "FULL_TIME"),
  "postingDate": str(j.get("date_posted", "")),
  "originalUrl": j.get("job_url", ""),
  "applicationUrl": j.get("job_url", ""),
  "salary": str(j.get("salary", "")),
  "remote": str(j.get("is_remote", False)),
} for j in jobs]))
      `;

      const output = await new Promise<string>((resolve, reject) => {
        execFile(python, ["-c", script], { timeout: 90000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });

      const parsed: SourceJob[] = JSON.parse(output || "[]");
      logger.info("[jobspy] completed", { count: parsed.length });
      return parsed;
    } catch (e) {
      logger.warn("[jobspy] error", { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  async healthcheck(): Promise<{ ok: boolean; error?: string }> {
    try {
      const { execFile } = await import("child_process");
      const python = await this.findPython();
      if (!python) return { ok: false, error: "Python not found" };
      await new Promise<void>((resolve, reject) => {
        execFile(python, ["-c", "import jobspy; print('ok')"], { timeout: 15000 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async findPython(): Promise<string | null> {
    const { execFile } = await import("child_process");
    return new Promise((resolve) => {
      execFile("python3", ["--version"], { timeout: 5000 }, (err) => {
        if (!err) return resolve("python3");
        execFile("python", ["--version"], { timeout: 5000 }, (err2) => {
          if (!err2) return resolve("python");
          resolve(null);
        });
      });
    });
  }
}

export function createJobSpyAdapter(config?: { enabled?: boolean }): JobSpyAdapter {
  return new JobSpyAdapter(config);
}
