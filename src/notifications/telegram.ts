import { logger } from "../lib/logger";

// ─── Telegram Notifications ─────────────────────────────────────────────
// Delivers qualified jobs via Telegram Bot API. WhatsApp can be added via
// the official WhatsApp Business Cloud API as a separate integration.
// Duplicate notification prevention handled by JobNotification table.

export interface TelegramJob {
  position: string;
  company: string;
  location: string;
  type: string;
  posted: string;
  matchScore: number;
  eligibility: string;
  matchedSkills: string[];
  missingSkills: string[];
  whyMatches: string;
  concerns: string;
  originalJob: string;
  application: string;
}

export function formatTelegramMessage(job: TelegramJob): string {
  const lines = [
    "🆕 NEW JOB OPPORTUNITY",
    "",
    `Position: ${job.position}`,
    `Company: ${job.company}`,
    `Location: ${job.location}`,
    `Type: ${job.type}`,
    `Posted: ${job.posted}`,
    `Match Score: ${job.matchScore}/100`,
    `Eligibility: ${job.eligibility}`,
    "",
    "Matched Skills:",
    ...(job.matchedSkills.length ? job.matchedSkills.map((s) => `• ${s}`) : ["• None"]),
    "",
    "Missing Skills:",
    ...(job.missingSkills.length ? job.missingSkills.map((s) => `• ${s}`) : ["• None"]),
    "",
    "Why this job matches:",
    job.whyMatches,
    "",
    "Potential concerns:",
    job.concerns,
    "",
    `Original Job: ${job.originalJob}`,
    `Application: ${job.application}`,
  ];
  return lines.join("\n");
}

export async function sendTelegram(token: string, chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { description?: string };
    if (!res.ok) {
      return { ok: false, error: data.description ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function notifyTelegramJob(
  token: string,
  chatId: string,
  job: TelegramJob
): Promise<{ ok: boolean; error?: string }> {
  const message = formatTelegramMessage(job);
  return sendTelegram(token, chatId, message);
}
