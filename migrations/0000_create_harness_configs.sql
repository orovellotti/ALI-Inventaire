CREATE TABLE IF NOT EXISTS "harness_configs" (
  "id" varchar PRIMARY KEY NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "config" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);