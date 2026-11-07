import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function writeJson(file: string, data: unknown): void {
  ensureDataDir();
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    ensureDataDir();
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function appendJobRecord(job: any): void {
  ensureDataDir();
  const logFile = path.join(DATA_DIR, "jobs-discovered.json");
  let existing: any[] = [];
  if (fs.existsSync(logFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(logFile, "utf-8"));
    } catch {
      existing = [];
    }
  }
  existing.push({ ...job, savedAt: new Date().toISOString() });
  writeJson("jobs-discovered.json", existing);
}

export const REVIEW_DIR = path.join(DATA_DIR, "review");

export function ensureReviewDir(): void {
  if (!fs.existsSync(REVIEW_DIR)) fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

export function saveReviewJob(job: any): void {
  ensureReviewDir();
  const file = path.join(REVIEW_DIR, `${job.jobId || job.externalId || "job"}.json`);
  writeJson(file.replace(DATA_DIR + path.sep, ""), job);
}
