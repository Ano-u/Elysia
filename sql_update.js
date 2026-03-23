import { db } from './src/lib/db.js';
async function run() {
  await db.query("ALTER TABLE reactions DROP CONSTRAINT IF EXISTS reactions_reaction_type_check;");
  await db.query("ALTER TABLE reactions ADD CONSTRAINT reactions_reaction_type_check CHECK (reaction_type IN ('hug', 'heart', 'star', 'butterfly', 'flower'));");
  console.log('done');
  process.exit(0);
}
run();
