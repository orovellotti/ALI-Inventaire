import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Espèces désignatrices Natura 2000 (source EEA end2024), stockées pour
// enrichir l'inventaire GBIF avec les espèces "attendues" sur les sites proches.
export const natura2000Species = pgTable(
  "natura2000_species",
  {
    id: serial("id").primaryKey(),
    siteCode: varchar("site_code").notNull(),
    siteName: text("site_name").notNull().default(""),
    country: varchar("country").notNull().default(""),
    scientificName: text("scientific_name").notNull(),
    speciesGroup: text("species_group").notNull().default(""),
    directive: text("directive").notNull().default(""),
    annexes: text("annexes").notNull().default(""),
    populationType: text("population_type").notNull().default(""),
    evalConservation: text("eval_conservation").notNull().default(""),
    evalGlobal: text("eval_global").notNull().default(""),
  },
  (table) => [index("idx_natura2000_species_site_code").on(table.siteCode)],
);

export const insertNatura2000SpeciesSchema = createInsertSchema(natura2000Species).omit({
  id: true,
});

export type InsertNatura2000Species = z.infer<typeof insertNatura2000SpeciesSchema>;
export type Natura2000Species = typeof natura2000Species.$inferSelect;
