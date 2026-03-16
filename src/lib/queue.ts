import { Queue } from "bullmq";
import { env } from "../config/env.js";

const connection = {
  url: env.REDIS_URL,
};

export const imageQueue = new Queue("image-process", { connection });
export const embeddingQueue = new Queue("embedding-process", { connection });
export const weeklyQueue = new Queue("weekly-insight", { connection });
export const exportQueue = new Queue("export-process", { connection });
