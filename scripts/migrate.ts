import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config();

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("缺少 DATABASE_URL");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await ensureMigrationsTable(client);

    const migrationDir = join(process.cwd(), "migrations");
    const files = readdirSync(migrationDir)
      .filter((name) => name.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    for (const filename of files) {
      const already = await client.query<{ filename: string }>(
        "SELECT filename FROM schema_migrations WHERE filename = $1",
        [filename],
      );

      if (already.rowCount && already.rowCount > 0) {
        continue;
      }

      const sql = readFileSync(join(migrationDir, filename), "utf8");
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      await client.query("COMMIT");
      // eslint-disable-next-line no-console
      console.log(`已执行迁移: ${filename}`);
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("迁移失败:", error);
  process.exit(1);
});
