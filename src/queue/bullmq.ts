import { Worker, Queue } from "bullmq";
import { logger } from "../lib/logger";

// ─── BullMQ Queue ───────────────────────────────────────────────────────
// Queue-based execution for the discovery pipeline. Prevents duplicate
// scheduled runs and supports graceful shutdown.

export const JOB_HUNTER_QUEUE_NAME = "job-hunter";

let queue: Queue | null = null;
let worker: Worker | null = null;

export interface DiscoveryJobData {
  executionId: string;
  sourceJobs: any[];
  profile: any;
}

export async function getQueue(): Promise<Queue> {
  if (!queue) {
    queue = new Queue(JOB_HUNTER_QUEUE_NAME, {
      connection: { host: "127.0.0.1", port: 6379 },
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    });
  }
  return queue;
}

export async function enqueueDiscovery(data: DiscoveryJobData) {
  const q = await getQueue();
  // Idempotency: prevent duplicate scheduled runs by execution id
  await q.add("discover", data, {
    jobId: `discover-${data.executionId}`,
  });
  logger.info("[queue] enqueued", { executionId: data.executionId });
}

export function createWorker(handler: (job: any) => Promise<void>): Worker {
  if (worker) return worker;
  worker = new Worker(
    JOB_HUNTER_QUEUE_NAME,
    async (job) => {
      logger.info("[worker] processing", { jobId: job.id, name: job.name });
      await handler(job);
    },
    { connection: { host: "127.0.0.1", port: 6379 } }
  );
  worker.on("completed", (job) => logger.info("[worker] completed", { jobId: job.id }));
  worker.on("failed", (job, err) => logger.error("[worker] failed", { jobId: job?.id, error: err?.message }));
  return worker;
}

export async function shutdown(): Promise<void> {
  if (worker) await worker.close();
  if (queue) await queue.close();
  worker = null;
  queue = null;
}
