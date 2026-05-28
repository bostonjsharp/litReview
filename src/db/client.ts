import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function makeDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 5 });
  return { db: drizzle(sql, { schema }), sql };
}

const globalForDb = globalThis as unknown as { _db?: ReturnType<typeof makeDb> };
export const { db } = globalForDb._db ?? (globalForDb._db = makeDb(process.env.DATABASE_URL!));
export { schema };
