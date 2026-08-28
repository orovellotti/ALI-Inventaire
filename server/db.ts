import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL doit être défini (base non provisionnée ?)");
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export async function ensureHarnessSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS harness_configs (
      id varchar PRIMARY KEY,
      version integer NOT NULL DEFAULT 1,
      config jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}
