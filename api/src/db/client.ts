import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const url = process.env.DATABASE_URL;

if (!url) {
  // Don't throw at import-time; tests may run without DB.
  // Server startup checks this separately.
  console.warn('[db] DATABASE_URL not set — db client will fail on first query');
}

// Neon requires ssl. Local dev — user provides sslmode in URL.
export const sql = postgres(url ?? 'postgres://invalid-placeholder', {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

export const db = drizzle(sql, { schema });

export type DB = typeof db;
