import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, index, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
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

// Espèces documentées dans l'inventaire national ZNIEFF publié par PatriNat.
// Ce stockage reste séparé de Natura 2000 : une mention à l'échelle d'une
// ZNIEFF n'est ni une occurrence géolocalisée ni une preuve de compatibilité
// avec un habitat dans l'emprise.
export const znieffSpecies = pgTable(
  "znieff_species",
  {
    zoneCode: varchar("zone_code").notNull(),
    cdRef: varchar("cd_ref").notNull().default(""),
    cdNom: varchar("cd_nom").notNull().default(""),
    scientificName: text("scientific_name").notNull(),
    citedName: text("cited_name").notNull().default(""),
    speciesGroup: text("species_group").notNull().default(""),
    // D : déterminante ; E : autre espèce à enjeux ; A : autre espèce.
    // Les taxons confidentiels C ne sont pas importés.
    determinationStatus: varchar("determination_status", { length: 1 })
      .notNull()
      .default("A"),
  },
  (table) => [
    index("idx_znieff_species_zone_code").on(table.zoneCode),
    index("idx_znieff_species_cd_ref").on(table.cdRef),
  ],
);

export const znieffReferenceMeta = pgTable("znieff_reference_meta", {
  id: varchar("id").primaryKey(),
  sourceUrl: text("source_url").notNull(),
  sourceUpdated: varchar("source_updated").notNull(),
  sourceVersion: varchar("source_version").notNull().default(""),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertZnieffSpeciesSchema = createInsertSchema(znieffSpecies);

export type InsertZnieffSpecies = z.infer<typeof insertZnieffSpeciesSchema>;
export type ZnieffSpecies = typeof znieffSpecies.$inferSelect;
export type ZnieffReferenceMeta = typeof znieffReferenceMeta.$inferSelect;

export const harnessConfigs = pgTable("harness_configs", {
  id: varchar("id").primaryKey(),
  version: integer("version").notNull().default(1),
  config: jsonb("config").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type HarnessConfigRow = typeof harnessConfigs.$inferSelect;
