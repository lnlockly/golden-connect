import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { registerJob } from './scheduler.js';

registerJob({
  name: 'rate-limit-cleanup',
  schedule: '*/10 * * * *',
  async handler() {
    const res = (await db.execute(sql`
      DELETE FROM rate_limits WHERE expires_at < now()
    `)) as unknown;
    const count = (res as any)?.count ?? (Array.isArray(res) ? (res as any[]).length : undefined);
    logger.info({ count }, 'rate_limits pruned');
  },
});
