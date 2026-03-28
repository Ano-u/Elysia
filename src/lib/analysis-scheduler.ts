import os from "node:os";
import type { Queue, Worker } from "bullmq";
import { env } from "../config/env.js";
import {
  determineAnalysisLoadState,
  isAnalysisClusteringEnabled,
  type AnalysisLoadState,
} from "./analysis.js";
import { listScopesDueForRecluster, listScopesMissingBackfill, loadRecentApiMetrics } from "./analysis-store.js";
import { enqueueScopeBackfill, enqueueScopeRecluster } from "./analysis-jobs.js";

export type ManagedAnalysisWorkers = {
  lightWorker: Worker;
  backfillWorker: Worker;
  reclusterWorker: Worker;
};

export type ManagedAnalysisQueues = {
  lightQueue: Queue;
  backfillQueue: Queue;
  reclusterQueue: Queue;
};

export async function captureAnalysisLoadState(args: ManagedAnalysisQueues): Promise<{
  state: AnalysisLoadState;
  lightBacklog: number;
}> {
  if (!isAnalysisClusteringEnabled()) {
    return {
      state: "NORMAL",
      lightBacklog: 0,
    };
  }

  const [apiMetrics, lightWaiting, lightActive] = await Promise.all([
    loadRecentApiMetrics(3),
    args.lightQueue.getWaitingCount(),
    args.lightQueue.getActiveCount(),
  ]);

  const availableParallelism =
    typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  const loadAverage1m = os.loadavg()[0] ?? 0;
  const freeMemBytes = os.freemem();
  const lightBacklog = lightWaiting + lightActive;

  const state = determineAnalysisLoadState(
    {
      loadAverage1m,
      availableParallelism,
      freeMemBytes,
      apiP95Ms: apiMetrics.apiP95Ms,
      recentRequestCount: apiMetrics.recentRequestCount,
    },
    env.ANALYSIS_IDLE_FREE_MEM_BYTES,
  );

  return { state, lightBacklog };
}

export async function applyAnalysisWorkerState(
  args: ManagedAnalysisWorkers & { state: AnalysisLoadState },
): Promise<void> {
  if (!isAnalysisClusteringEnabled()) {
    await Promise.all([
      args.backfillWorker.pause(),
      args.reclusterWorker.pause(),
    ]);
    return;
  }

  args.lightWorker.concurrency = 1;
  args.backfillWorker.concurrency = 1;
  args.reclusterWorker.concurrency = 1;

  if (args.state === "IDLE") {
    await Promise.all([
      args.backfillWorker.resume(),
      args.reclusterWorker.resume(),
      args.lightWorker.resume(),
    ]);
    return;
  }

  await Promise.all([
    args.lightWorker.resume(),
    args.backfillWorker.pause(),
    args.reclusterWorker.pause(),
  ]);
}

export async function runAnalysisMaintenancePass(
  args: ManagedAnalysisWorkers & ManagedAnalysisQueues,
): Promise<AnalysisLoadState> {
  if (!isAnalysisClusteringEnabled()) {
    await applyAnalysisWorkerState({
      lightWorker: args.lightWorker,
      backfillWorker: args.backfillWorker,
      reclusterWorker: args.reclusterWorker,
      state: "NORMAL",
    });
    return "NORMAL";
  }

  const { state, lightBacklog } = await captureAnalysisLoadState(args);
  await applyAnalysisWorkerState({
    lightWorker: args.lightWorker,
    backfillWorker: args.backfillWorker,
    reclusterWorker: args.reclusterWorker,
    state,
  });

  if (state !== "IDLE" || lightBacklog > 16) {
    return state;
  }

  const [missingScopes, reclusterScopes] = await Promise.all([
    listScopesMissingBackfill(2),
    listScopesDueForRecluster({
      publicIntervalMinutes: env.ANALYSIS_PUBLIC_RECLUSTER_INTERVAL_MINUTES,
      personalIntervalMinutes: env.ANALYSIS_PERSONAL_RECLUSTER_INTERVAL_MINUTES,
      limitPersonal: 2,
    }),
  ]);

  await Promise.all(missingScopes.map((scope) => enqueueScopeBackfill(scope)));
  await Promise.all(reclusterScopes.map((scope) => enqueueScopeRecluster(scope)));

  return state;
}
