import 'dotenv/config';
import { client, databasePromise } from '../server/db.js';

try {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Manual sample-data seeding is disabled in production.');
  }

  await databasePromise;
  console.log('Development database is ready. Existing accounts and records were preserved.');
} catch (error) {
  console.error(`Database initialization failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
