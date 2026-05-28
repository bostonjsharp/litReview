import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '@/db/schema';

// Resets the `public` schema in TEST_DATABASE_URL, then re-applies migrations.
// Works on any Postgres including Neon (no CREATE DATABASE privilege needed).
// SAFETY: only ever connects to TEST_DATABASE_URL, never DATABASE_URL.
export async function makeTestDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  if (url === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  const sql = postgres(url, { max: 1 });
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  return { db: drizzle(sql, { schema }), sql, schema };
}
