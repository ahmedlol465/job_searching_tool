import { z } from "zod";

// ─── Notification Templates / Preferences ──────────────────────────────
// Priority thresholds: High 85-100, Medium 70-84, Low <70.
// Configurable per user.

export const PRIORITY_THRESHOLDS = {
  HIGH: 85,
  MEDIUM: 70,
  LOW: 0,
} as const;

export function priorityForScore(score: number): "HIGH_PRIORITY" | "MEDIUM_PRIORITY" | "LOW_PRIORITY" {
  if (score >= PRIORITY_THRESHOLDS.HIGH) return "HIGH_PRIORITY";
  if (score >= PRIORITY_THRESHOLDS.MEDIUM) return "MEDIUM_PRIORITY";
  return "LOW_PRIORITY";
}

export const NotificationPreferenceSchema = z.object({
  notifyTelegram: z.boolean().default(true),
  notifyWhatsApp: z.boolean().default(false),
  minMatchScore: z.number().min(0).max(100).default(70),
  telegramChatId: z.string().optional(),
  whatsappPhone: z.string().optional(),
});

export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>;
