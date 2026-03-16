import { buildApp } from "./app.js";
import { env } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT,
    });
    app.log.info(`Elysia API 启动成功: http://${env.HOST}:${env.PORT}`);
  } catch (error) {
    app.log.error(error, "启动失败");
    process.exit(1);
  }
}

bootstrap();
