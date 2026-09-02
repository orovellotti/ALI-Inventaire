import { z } from "zod";
import { customMcpServerSchema, harnessConfigSchema } from "@shared/harness";

export const latSchema = z.coerce
  .number()
  .refine((v) => !Number.isNaN(v), "Latitude invalide")
  .refine((v) => v >= -90 && v <= 90, "Latitude doit être entre -90 et 90");

export const lngSchema = z.coerce
  .number()
  .refine((v) => !Number.isNaN(v), "Longitude invalide")
  .refine((v) => v >= -180 && v <= 180, "Longitude doit être entre -180 et 180");

export const radiusSchema = z.coerce
  .number()
  .positive("'radius' doit être un nombre positif en mètres")
  .max(50000, "Rayon maximum 50 km");

export const coordsSchema = z
  .tuple([z.number(), z.number()])
  .refine(([lat]) => lat >= -90 && lat <= 90, "Latitude hors limites")
  .refine(([, lng]) => lng >= -180 && lng <= 180, "Longitude hors limites");

export const bufferCircleSchema = z.object({
  id: z.string(),
  center: coordsSchema,
  radius: radiusSchema,
  label: z.string(),
  enabled: z.boolean(),
  color: z.string().optional(),
});

export const inventoryBodySchema = z.object({
  circles: z.array(bufferCircleSchema).min(1, "Au moins un cercle requis").max(10, "Maximum 10 cercles par requête"),
  includeINaturalist: z.boolean().optional(),
});

export const simpleInventoryQuerySchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  radius: radiusSchema.default(500),
  includeINaturalist: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v !== "false" && v !== false),
});

export const latLngQuerySchema = z.object({
  lat: latSchema,
  lng: lngSchema,
});

export const zonagesQuerySchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  radius: radiusSchema.default(2000),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "Paramètre 'q' requis"),
});

export const priorityBodySchema = z.object({
  toponym: z.string().min(1, "Champ 'toponym' requis"),
  coords: coordsSchema,
  occurrences: z
    .array(z.any())
    .min(1, "Champ 'occurrences' requis (tableau non vide)")
    .max(5000, "Maximum 5000 occurrences"),
});

export const potentialSpeciesBodySchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  radius: radiusSchema.default(2000),
  occurrences: z
    .array(
      z.object({
        key: z.number().int(),
        scientificName: z.string().trim().min(1, "Nom scientifique requis"),
        decimalLatitude: latSchema,
        decimalLongitude: lngSchema,
        source: z.enum(["gbif", "inaturalist"]),
      }),
    )
    .max(5000, "Maximum 5000 occurrences"),
});

export const MAX_REFORMAT_REPORT_CHARACTERS = 200_000;
export const MAX_REFORMAT_CONTEXT_CHARACTERS = 120_000;

export const reformatBodySchema = z.object({
  report: z
    .string()
    .min(1, "Champ 'report' requis")
    .max(
      MAX_REFORMAT_REPORT_CHARACTERS,
      `Rapport trop long (max ${MAX_REFORMAT_REPORT_CHARACTERS.toLocaleString("fr-FR")} caractères)`,
    ),
  context: z
    .string()
    .min(2, "Champ 'context' requis")
    .max(
      MAX_REFORMAT_CONTEXT_CHARACTERS,
      `Contexte trop long (max ${MAX_REFORMAT_CONTEXT_CHARACTERS.toLocaleString("fr-FR")} caractères)`,
    ),
});

export const harnessConfigBodySchema = harnessConfigSchema;
export const mcpDiscoveryBodySchema = customMcpServerSchema.pick({ label: true, url: true });

export const taxonKeyParamSchema = z.object({
  taxonKey: z.coerce.number().int().positive("taxonKey doit être un entier"),
});

export function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join(" • ");
}
