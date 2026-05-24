import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { logger } from '../lib/logger.js';
import { registerJob } from './scheduler.js';

const execAsync = promisify(exec);

const BACKUP_DIR_DEFAULT = '/tmp/backups';
const KEEP_DUMPS = 7;

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function hasPgDump(): Promise<boolean> {
  try {
    // `command -v` on sh, `where` on Windows. Linux containers are safe.
    const { stdout } = await execAsync('command -v pg_dump', { timeout: 5000 });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

registerJob({
  name: 'db-backup',
  schedule: '0 2 * * *',
  timezone: 'Europe/Moscow',
  async handler() {
    const log = logger;
    const backupDir = process.env.BACKUP_DIR || BACKUP_DIR_DEFAULT;
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
      log.warn('backup skipped: DATABASE_URL not set');
      return;
    }

    const hasTool = await hasPgDump();
    if (!hasTool) {
      log.warn('backup skipped: pg_dump not available in this image');
      return;
    }

    if (!(await pathExists(backupDir))) {
      try {
        await mkdir(backupDir, { recursive: true });
      } catch (err) {
        log.warn({ err, backupDir }, 'backup skipped: mkdir failed');
        return;
      }
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(backupDir, `golden-connect-${ts}.sql.gz`);

    try {
      // Pipe pg_dump into gzip. Shell redirection keeps the stream off the
      // Node process's stdout buffer so a multi-GB dump won't balloon heap.
      // `--no-owner --no-privileges` makes the dump portable between envs.
      const cmd = `pg_dump --no-owner --no-privileges "${dbUrl}" | gzip -c > "${outPath}"`;
      await execAsync(cmd, { timeout: 30 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
      const info = await stat(outPath);
      log.info({ file: outPath, bytes: info.size }, 'db backup written');
    } catch (err) {
      log.error({ err, outPath }, 'pg_dump failed (backup skipped)');
      return;
    }

    // Retention: keep last KEEP_DUMPS golden-connect-*.sql.gz files.
    try {
      const entries = await readdir(backupDir);
      const mine = entries.filter((n) => /^golden-connect-.+\.sql\.gz$/.test(n));
      const withStat = await Promise.all(
        mine.map(async (n) => ({ n, st: await stat(path.join(backupDir, n)) })),
      );
      withStat.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
      const toDelete = withStat.slice(KEEP_DUMPS);
      for (const { n } of toDelete) {
        try {
          await unlink(path.join(backupDir, n));
        } catch (err) {
          log.warn({ err, file: n }, 'failed to prune old dump');
        }
      }
      if (toDelete.length) log.info({ pruned: toDelete.length }, 'old dumps pruned');
    } catch (err) {
      log.warn({ err }, 'retention pass failed (non-fatal)');
    }
  },
});
