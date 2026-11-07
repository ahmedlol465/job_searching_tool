import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { logger } from "./lib/logger";
import { prisma } from "./lib/db";
import { readJson, writeJson, ensureDataDir } from "./lib/file-store";
import { classifyJob } from "./agents/classification";
import { evaluateEligibility } from "./agents/eligibility";
import { runMatchingAgent } from "./agents/matching";

// In file mode the DB isn't running — no-op any Prisma writes the agents make.
(prisma as any).agentExecution = { create: async () => ({}) };

const PORT = Number(process.env.PORT ?? 3737);
const HOST = process.env.HOST ?? "localhost";
const DATA_DIR = path.join(process.cwd(), "data");
const JOBS_FILE = "jobs-discovered.json";
const APPS_FILE = "applications.json";

const DEFAULT_PROFILE = {
  id: "profile-default",
  name: "CS Student",
  location: "Cairo, Egypt",
  education: "Computer Science student — final year",
  graduationYear: 2027,
  skills: [
    "JavaScript",
    "TypeScript",
    "React",
    "Node.js",
    "Express.js",
    "NestJS",
    "PHP",
    "Laravel",
    "MySQL",
    "MongoDB",
    "PostgreSQL",
    "REST APIs",
    "Git",
    "GitHub",
  ],
  preferredJobTypes: ["Internship", "Junior", "Entry-Level", "Graduate Program"],
  preferredLocations: ["Remote", "Egypt", "Europe", "UK", "USA", "Middle East"],
  remotePreference: "remote_first",
  minMatchScore: 70,
};

interface IncomingPost {
  externalId: string;
  text: string;
  author?: string;
  url: string;
  postedAt?: string | null;
  location?: string | null;
}

const JOB_RX = [
  /\bintern(?:ship)?\b/i,
  /\btrainee\b/i,
  /\bco-op\b/i,
  /\bsoftware engineering intern/i,
  /\bbackend intern/i,
  /\bfrontend intern/i,
  /\bfull.?stack intern/i,
  /\bweb development intern/i,
  /\bai intern/i,
  /\bmachine learning intern/i,
  /\bdeep learning intern/i,
  /\bsummer internship/i,
  /\bwinter internship/i,
  /\bpaid internship/i,
  /\bunpaid internship/i,
  /\bremote internship/i,
  /\binternship program/i,
  /\binternship opportunity/i,
  /\bstudent internship/i,
  /\bgraduate trainee/i,
  /\bتدريب\b/i,
  /\bمتدرب\b/i,
  /\bفرصة تدريب\b/i,
  /\bمتدرب هندسة برمجيات\b/i,
  /\bمتدرب Backend\b/i,
  /\bمتدرب Frontend\b/i,
  /\bمتدرب Full Stack\b/i,
  /\bمتدرب تطوير ويب\b/i,
  /\bمتدرب ذكاء اصطناعي\b/i,
  /\bمتدرب تعلم آلي\b/i,
  /\bمتدرب تعلم عميق\b/i,
  /\bتدريب صيفي\b/i,
  /\bتدريب شتوي\b/i,
  /\bتدريب مدفوع\b/i,
  /\bتدريب غير مدفوع\b/i,
  /\bتدريب عن بعد\b/i,
  /\bبرنامج تدريبي\b/i,
  /\bتدريب للطلاب\b/i,
  /\bتدريب تعاوني\b/i,
  /\bمتدرب خريجين\b/i,
  /\bjunior\b/i,
  /\bentry[\s-]?level\b/i,
  /\bfresh grad/i,
  /\brecent grad/i,
  /\bnew grad/i,
  /\bassociate\b/i,
  /\b0-1 years?/i,
  /\b0-2 years?/i,
  /\bno experience\b/i,
  /\bwithout experience\b/i,
  /\bjunior position\b/i,
  /\bمبتدئ\b/i,
  /\bحديث التخرج\b/i,
  /\bحديثي التخرج\b/i,
  /\bخريج جديد\b/i,
  /\bخريج حديث\b/i,
  /\bمطور مبتدئ\b/i,
  /\bمهندس برمجيات مبتدئ\b/i,
  /\bمستوى مبتدئ\b/i,
  /\bمطور حديث الخبرة\b/i,
  /\bمهندس برمجيات حديث الخبرة\b/i,
  /\bلا يشترط الخبرة\b/i,
  /\bبدون خبرة\b/i,
  /\bوظيفة للمبتدئين\b/i,
  /\bمطور مساعد\b/i,
  /\bمهندس برمجيات مساعد\b/i,
  /\bوظيفة للخريجين\b/i,
  /\bبرنامج الخريجين\b/i,
  /\bwe'?re hiring\b/i,
  /\bhiring now\b/i,
  /\bhiring\b/i,
  /\bjob opening\b/i,
  /\bjob vacancy\b/i,
  /\bcareer opportunity\b/i,
  /\bopen position\b/i,
  /\bapply now\b/i,
  /\bjoin our team\b/i,
  /\brecruitment\b/i,
  /\bwalk-in interview\b/i,
  /\bcareer fair\b/i,
  /\bمطلوب\b/i,
  /\bنعلن عن وظائف\b/i,
  /\bفرصة عمل\b/i,
  /\bوظيفة شاغرة\b/i,
  /\bفرصة وظيفية\b/i,
  /\bمنصب شاغر\b/i,
  /\bإعلان توظيف\b/i,
  /\bقدم الآن\b/i,
  /\bباب التقديم مفتوح\b/i,
  /\bمطلوب مطورين\b/i,
  /\bمطلوب بشكل عاجل\b/i,
  /\bبدء العمل فوراً\b/i,
  /\bملتقى توظيف\b/i,
  /\bتوظيف حديثي التخرج\b/i,
  /\bsoftware engineer/i,
  /\bsoftware developer/i,
  /\bbackend\b/i,
  /\bfrontend\b/i,
  /\bfull.?stack/i,
  /\bweb developer/i,
  /\bphp\b/i,
  /\blaravel\b/i,
  /\breact\b/i,
  /\bnode\.?js\b/i,
  /\bjavascript\b/i,
  /\btypescript\b/i,
  /\bpython\b/i,
  /\bapi developer/i,
  /\bdatabase developer/i,
  /\bdevops\b/i,
  /\bai engineer/i,
  /\bmachine learning\b/i,
  /\bdata engineer/i,
  /\bqa engineer/i,
  /\bautomation tester\b/i,
  /\bmobile developer\b/i,
  /\bمهندس برمجيات\b/i,
  /\bمطور برمجيات\b/i,
  /\bمطور باي\b/i,
  /\bمطور لارافيل\b/i,
  /\bمطور ريأكت\b/i,
  /\bمطور نود\b/i,
  /\bمطور جافاسكريبت\b/i,
  /\bمطور تايب سكريبت\b/i,
  /\bمطور بايثون\b/i,
  /\bمطلوب مبرمج\b/i,
  /\bمطلوب مطور\b/i,
  /\bمطلوب مهندس برمجيات\b/i,
  /\bفرص تدريب\b/i,
  /\bشغل للمبتدئين\b/i,
  /\bخريجي حاسبات\b/i,
  /\bطلاب حاسبات\b/i,
  /\bدفعة 2027\b/i,
  /\bخريجي دفعة 2027\b/i,
  /\bمطلوب دفعة 2027\b/i,
  /\bحديث التخرج بدون خبرة\b/i,
  /\bالتقديم مفتوح\b/i,
  /\bابعت السي في\b/i,
  /\bأرسل السيرة الذاتية\b/i,
  /\bمطلوب للتعيين فوراً\b/i,
  /\bفرصة للشباب\b/i,
  /\bremote\b/i,
  /\bwork from home\b/i,
  /\bfully remote\b/i,
  /\bworldwide remote\b/i,
  /\bglobal hiring\b/i,
  /\bvisa sponsorship\b/i,
  /\brelocation\b/i,
  /\binternational applicants\b/i,
  /\bعن بعد\b/i,
  /\bمن المنزل\b/i,
  /\bعمل عن بعد\b/i,
  /\bموقع عمل مرن\b/i,
  /\bعمل هجين\b/i,
  /\bتوظيف عالمي\b/i,
  /\bتدريب دولي\b/i,
  /\bرعاية تأشيرة\b/i,
];

const looksLikeJob = (t: string) => JOB_RX.some((rx) => rx.test(t));

function deriveTitle(text: string): string {
  const first = text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? text.trim();
  return first.slice(0, 140);
}

function detectLocation(text: string): string {
  if (/\bremote\b/i.test(text)) return "Remote";
  if (/\bcairo\b|\begypt\b/i.test(text)) return "Egypt";
  return "Unspecified";
}

function detectRemote(text: string): "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN" {
  if (/\bremote\b/i.test(text)) return "REMOTE";
  if (/\bhybrid\b/i.test(text)) return "HYBRID";
  if (/\bon[\s-]?site\b/i.test(text)) return "ONSITE";
  return "UNKNOWN";
}

async function importPosts(posts: IncomingPost[]): Promise<{
  imported: number;
  skipped: number;
  jobs: Array<{ externalId: string; score: number }>;
}> {
  ensureDataDir();
  const existing = readJson<any[]>(JOBS_FILE, []);
  const existingIds = new Set(existing.map((j) => j.jobId || j.externalId));
  const existingHashes = new Set(existing.map((j) => j.contentHash).filter(Boolean));

  let imported = 0;
  let skipped = 0;
  const responded: Array<{ externalId: string; score: number }> = [];

  for (const post of posts) {
    try {
      if (!post.externalId || !post.text) {
        skipped++;
        continue;
      }
      const contentHash = crypto.createHash("sha1").update(post.text).digest("hex");
      if (existingIds.has(post.externalId) || existingHashes.has(contentHash)) {
        skipped++;
        continue;
      }
      if (!looksLikeJob(post.text)) {
        skipped++;
        continue;
      }

      const title = deriveTitle(post.text);
      const company = post.author || "LinkedIn";
      const location = post.location || detectLocation(post.text);
      const remote = detectRemote(post.text);

      const classification = await classifyJob({
        jobId: post.externalId,
        title,
        description: post.text,
      });
      if (
        classification.experienceLevel === "SENIOR" ||
        classification.experienceLevel === "MID_LEVEL"
      ) {
        skipped++;
        continue;
      }

      const eligibility = await evaluateEligibility({
        jobId: post.externalId,
        title,
        company,
        location,
        description: post.text,
        remote: remote as any,
        deadline: null,
        graduationYear: DEFAULT_PROFILE.graduationYear,
        skills: DEFAULT_PROFILE.skills,
        preferredLocations: DEFAULT_PROFILE.preferredLocations,
      });
      if (eligibility.eligibility === "NOT_ELIGIBLE") {
        skipped++;
        continue;
      }

      const matching = await runMatchingAgent({
        jobId: post.externalId,
        title,
        company,
        description: post.text,
        profileSkills: DEFAULT_PROFILE.skills,
        profileEducation: DEFAULT_PROFILE.education,
        profileGraduationYear: DEFAULT_PROFILE.graduationYear,
        preferredJobTypes: DEFAULT_PROFILE.preferredJobTypes,
        preferredLocations: DEFAULT_PROFILE.preferredLocations,
        remotePreference: DEFAULT_PROFILE.remotePreference,
      });

      existing.push({
        jobId: post.externalId,
        externalId: post.externalId,
        title,
        company,
        location,
        jobType:
          classification.experienceLevel === "INTERNSHIP"
            ? "Internship"
            : "Full-time",
        experienceLevel: classification.experienceLevel,
        postingDate: post.postedAt ?? null,
        deadline: null,
        originalUrl: post.url,
        applicationUrl: post.url,
        salary: null,
        remote,
        contentHash,
        description: post.text,
        matchScore: matching.matchScore,
        eligibility: eligibility.eligibility,
        matchedSkills: matching.matchedSkills,
        missingSkills: matching.missingSkills,
        strengths: matching.strengths,
        concerns: matching.concerns,
        recommendation: matching.recommendation,
        explanation: matching.explanation,
        verificationStatus: "UNVERIFIED",
        verifiedFields: [],
        failedFields: [],
        activeListing: true,
        stages: { classification, eligibility, matching },
        source: "linkedin-manual",
        savedAt: new Date().toISOString(),
      });

      responded.push({ externalId: post.externalId, score: matching.matchScore });
      existingIds.add(post.externalId);
      existingHashes.add(contentHash);
      imported++;
    } catch (e) {
      logger.warn("[server] post import failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      skipped++;
    }
  }

  writeJson(JOBS_FILE, existing);
  logger.info("[server] import", { imported, skipped });
  return { imported, skipped, jobs: responded };
}

function mergeApplications(jobs: any[]): any[] {
  const apps = readJson<Record<string, { status: string; updatedAt: string }>>(
    APPS_FILE,
    {},
  );
  return jobs.map((j) => {
    const id = j.jobId || j.externalId;
    return {
      ...j,
      status: apps[id]?.status ?? "pending",
      statusUpdatedAt: apps[id]?.updatedAt ?? null,
    };
  });
}

function setStatus(jobId: string, status: string): void {
  const apps = readJson<Record<string, any>>(APPS_FILE, {});
  apps[jobId] = { status, updatedAt: new Date().toISOString() };
  writeJson(APPS_FILE, apps);
}

function sendJson(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 5_000_000) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", () => reject(new Error("read error")));
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (req.method === "OPTIONS") {
      sendJson(res, 200, {});
      return;
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html")
    ) {
      try {
        const html = fs.readFileSync(path.join(DATA_DIR, "review.html"), "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      } catch {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>AI Job Hunter</h1><p>Dashboard loading...</p>");
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        mode: "file",
        jobs: readJson<any[]>(JOBS_FILE, []).length,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/jobs") {
      sendJson(res, 200, {
        jobs: mergeApplications(readJson<any[]>(JOBS_FILE, [])),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/import") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const posts: IncomingPost[] = Array.isArray(body.posts)
        ? body.posts
        : body.post
          ? [body.post]
          : [];
      sendJson(res, 200, await importPosts(posts));
      return;
    }

    const m = url.pathname.match(/^\/api\/jobs\/([^/]+)\/status$/);
    if (req.method === "POST" && m) {
      const jobId = decodeURIComponent(m[1]);
      const body = JSON.parse((await readBody(req)) || "{}");
      const status = String(body.status ?? "pending");
      if (!["pending", "approved", "rejected", "applied"].includes(status)) {
        sendJson(res, 400, { error: "invalid status" });
        return;
      }
      setStatus(jobId, status);
      sendJson(res, 200, { ok: true, jobId, status });
      return;
    }

    sendJson(res, 404, { error: "not found" });
  } catch (e) {
    logger.error("[server] request error", {
      error: e instanceof Error ? e.message : String(e),
    });
    try {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal" }));
    } catch {}
  }
});

server.listen(PORT, HOST, () => {
  logger.info("[server] listening", {
    url: `http://${HOST}:${PORT}`,
    dashboard: `http://${HOST}:${PORT}/`,
  });
});

server.on("error", (e) => {
  logger.error("[server] fatal", { error: e instanceof Error ? e.message : String(e) });
});

process.on("uncaughtException", (e) => {
  logger.error("[process] uncaught", { error: e instanceof Error ? e.message : String(e) });
});

process.on("unhandledRejection", (e) => {
  logger.error("[process] unhandled", { error: e instanceof Error ? e.message : String(e) });
});
