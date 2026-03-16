import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.js";
import { recordsRoutes } from "./records.js";
import { commentsRoutes } from "./comments.js";
import { reactionsRoutes } from "./reactions.js";
import { universeRoutes } from "./universe.js";
import { mindmapRoutes } from "./mindmap.js";
import { mediaRoutes } from "./media.js";
import { insightRoutes } from "./insights.js";
import { nudgeRoutes } from "./nudges.js";
import { governanceRoutes } from "./governance.js";
import { analyticsRoutes } from "./analytics.js";
import { userRoutes } from "./user.js";
import { systemRoutes } from "./system.js";
import { locationRoutes } from "./locations.js";
import { aiRoutes } from "./ai.js";
import { registerSocket } from "../lib/realtime.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ws", { websocket: true }, (connection) => {
    registerSocket(connection);
    connection.socket.send(JSON.stringify({ event: "system.connected", at: new Date().toISOString() }));
  });

  await app.register(systemRoutes);
  await app.register(locationRoutes);
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(recordsRoutes);
  await app.register(commentsRoutes);
  await app.register(reactionsRoutes);
  await app.register(universeRoutes);
  await app.register(mindmapRoutes);
  await app.register(mediaRoutes);
  await app.register(insightRoutes);
  await app.register(aiRoutes);
  await app.register(nudgeRoutes);
  await app.register(governanceRoutes);
  await app.register(analyticsRoutes);
}
