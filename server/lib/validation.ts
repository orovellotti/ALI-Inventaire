import { z } from "zod";
import { customMcpServerSchema, harnessConfigSchema } from "@shared/harness";

export const latSchema = z.coerce
  .number()
  .refine((v) => !Number.isNaN(v), "Invalid latitude")
  .refine((v) => v >= -90 && v <= 90, "Latitude must be between -90 and 90");

export const lngSchema = z.coerce
  .number()
  .refine((v) => !Number.isNaN(v), "Invalid longitude")
  .refine((v) => v >= -180 && v <= 180, "Longitude must be between -180 and 180");

export const radiusSchema = z.coerce
  .number()
  .positive("'radius' must be positive in metres")
  .max(50000, "Maximum radius is 50 km");

export const coordsSchema = z
  .tuple([z.number(), z.number()])
  .refine(([lat]) => lat >= -90 && lat <= 90, "Latitude out of range")
  .refine(([, lng]) => lng >= -180 && lng <= 180, "Longitude out of range");

export const bufferCircleSchema = z.object({
  id: z.string(),
  center: coordsSchema,
  radius: radiusSchema,
  label: z.string(),
  enabled: z.boolean(),
  color: z.string().optional(),
});

export const inventoryBodySchema = z.object({
  circles: z.array(bufferCircleSchema).min(1, "At least one circle is required").max(10, "Maximum 10 circles per request"),
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
  q: z.string().trim().min(1, "Parameter 'q' is required"),
});

const positionSchema = z
  .tuple([lngSchema, latSchema])
  .transform(([lng, lat]) => [lng, lat] as [number, number]);
const linearRingSchema = z.array(positionSchema).min(4).max(10_000).refine(
  (ring) => {
    const first = ring[0];
    const last = ring[ring.length - 1];
    return first[0] === last[0] && first[1] === last[1];
  },
  "Each polygon ring must be closed",
);
const polygonCoordinatesSchema = z.array(linearRingSchema).min(1).max(100);
const projectGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygonCoordinatesSchema }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(polygonCoordinatesSchema).min(1).max(100),
  }),
]);

export const projectAreaSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(z.object({
      type: z.literal("Feature"),
      properties: z.record(z.unknown()).nullable().optional(),
      geometry: projectGeometrySchema,
    })).min(1).max(100),
  })
  .superRefine((collection, ctx) => {
    let positions = 0;
    for (const feature of collection.features) {
      const polygons = feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
      for (const polygon of polygons) {
        for (const ring of polygon) positions += ring.length;
      }
    }
    if (positions > 10_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Project footprint too detailed (maximum 10,000 vertices)",
      });
    }
  });

export const priorityBodySchema = z.object({
  toponym: z.string().min(1, "'toponym' is required"),
  coords: coordsSchema,
  occurrences: z
    .array(z.any())
    .min(1, "'occurrences' must be a non-empty array")
    .max(5000, "Maximum 5,000 occurrences"),
  projectArea: projectAreaSchema.optional(),
  studyAreas: z.array(bufferCircleSchema).max(10).optional(),
});

export const potentialSpeciesBodySchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  radius: radiusSchema.default(2000),
  occurrences: z
    .array(
      z.object({
        key: z.number().int(),
        scientificName: z.string().trim().min(1, "Scientific name is required"),
        decimalLatitude: latSchema,
        decimalLongitude: lngSchema,
        source: z.enum(["gbif", "inaturalist"]),
      }),
    )
    .max(5000, "Maximum 5,000 occurrences"),
  projectArea: projectAreaSchema.optional(),
});

export interface CostLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  release: () => void;
  reason?: "rate" | "concurrency";
}

/** Limiteur borné et sans dépendance, partagé par les routes LLM anonymes. */
export class SlidingWindowCostLimiter {
  private readonly clients = new Map<string, { startedAt: number; requests: number; active: number }>();
  private readonly maxTrackedClients = 5_000;

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number,
    private readonly maxConcurrent: number,
  ) {}

  acquire(key: string, now = Date.now()): CostLimitDecision {
    let state = this.clients.get(key);
    if (!state || now - state.startedAt >= this.windowMs) {
      if (!state && this.clients.size >= this.maxTrackedClients) {
        const oldestKey = this.clients.keys().next().value as string | undefined;
        if (oldestKey) this.clients.delete(oldestKey);
      }
      state = { startedAt: now, requests: 0, active: 0 };
      this.clients.set(key, state);
    }
    const noop = () => undefined;
    if (state.active >= this.maxConcurrent) {
      return { allowed: false, reason: "concurrency", retryAfterSeconds: 2, release: noop };
    }
    if (state.requests >= this.maxRequests) {
      return {
        allowed: false,
        reason: "rate",
        retryAfterSeconds: Math.max(1, Math.ceil((state.startedAt + this.windowMs - now) / 1000)),
        release: noop,
      };
    }
    state.requests++;
    state.active++;
    let released = false;
    return {
      allowed: true,
      retryAfterSeconds: 0,
      release: () => {
        if (released) return;
        released = true;
        state!.active = Math.max(0, state!.active - 1);
      },
    };
  }
}

export const MAX_REFORMAT_REPORT_CHARACTERS = 200_000;
export const MAX_REFORMAT_CONTEXT_CHARACTERS = 120_000;

/** Validate only the shape consumed server-side; preserve other canonical data. */
export const finalStudyContextSchema = z.object({
  request: z.object({
    center: coordsSchema,
    studyAreas: z.array(z.object({
      center: coordsSchema,
      enabled: z.boolean().optional(),
    }).passthrough()).max(10).optional(),
  }).passthrough(),
  inventory: z.object({
    species: z.object({
      items: z.array(z.object({}).passthrough()).max(5000),
    }).passthrough().optional(),
  }).passthrough().nullable().optional(),
}).passthrough();

export const reformatBodySchema = z.object({
  report: z
    .string()
    .min(1, "'report' is required")
    .max(
      MAX_REFORMAT_REPORT_CHARACTERS,
      `Report too long (maximum ${MAX_REFORMAT_REPORT_CHARACTERS.toLocaleString("en-US")} characters)`,
    ),
  context: z
    .string()
    .min(2, "'context' is required")
    .max(
      MAX_REFORMAT_CONTEXT_CHARACTERS,
      `Context too long (maximum ${MAX_REFORMAT_CONTEXT_CHARACTERS.toLocaleString("en-US")} characters)`,
    ),
});

export const harnessConfigBodySchema = harnessConfigSchema;
export const mcpDiscoveryBodySchema = customMcpServerSchema.pick({ label: true, url: true });

export const taxonKeyParamSchema = z.object({
  taxonKey: z.coerce.number().int().positive("taxonKey must be a positive integer"),
});

export function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join(" • ");
}
