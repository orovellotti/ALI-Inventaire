import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { ZodError } from "zod";
import { searchGBIF, searchGBIFMultiCircle, fetchSpeciesDetails } from "./gbif";
import { findSINPPlatforms, SINP_PLATFORMS } from "./sinp";
import { STUDY_AREAS, PROJECT_PRESETS, TAXON_GROUPS } from "./constants";
import { analyzePrioritySpecies, reformatReport } from "./llm";
import { resolveAliUrl } from "./ali";
import { registerMcpEndpoint } from "./mcp";
import { asyncHandler } from "./lib/asyncHandler";
import { HttpError, badGateway } from "./lib/httpError";
import {
  formatZodError,
  inventoryBodySchema,
  simpleInventoryQuerySchema,
  latLngQuerySchema,
  searchQuerySchema,
  priorityBodySchema,
  potentialSpeciesBodySchema,
  reformatBodySchema,
  taxonKeyParamSchema,
  zonagesQuerySchema,
} from "./lib/validation";
import { geocodePlace, reverseGeocode, searchLieuxDits } from "./services/nominatim";
import { getZonages, getNaturaZones } from "./services/geoservices";
import { getSpeciesForSite } from "./services/natura2000Species";
import { storage } from "./storage";
import { getPotentialSpecies } from "./services/potentialSpecies";

const DATA_SOURCES_TTL_MS = 10 * 60 * 1000;
let dataSourcesCache: { data: unknown; expires: number } | null = null;

const ENDPOINTS_DOC = [
  { method: "POST", path: "/api/inventory", description: "Inventaire multi-aires (corps JSON avec circles[])" },
  { method: "GET", path: "/api/inventory/simple?lat=&lng=&radius=", description: "Inventaire simple (un point, un rayon)" },
  { method: "GET", path: "/api/species/:taxonKey", description: "Détails espèce (image, UICN, nom vernaculaire)" },
  { method: "GET", path: "/api/geocode?q=", description: "Géocodage (recherche de lieu)" },
  { method: "GET", path: "/api/lieux-dits?q=", description: "Recherche de lieux-dits (avec polygone si disponible)" },
  { method: "GET", path: "/api/sinp?lat=&lng=", description: "Plateformes SINP régionales" },
  { method: "GET", path: "/api/zonages?lat=&lng=&radius=", description: "Zonages environnementaux (ZNIEFF, Natura 2000, réserves, APB…) intersectant l'aire d'étude (IGN/PatriNat)" },
  { method: "GET", path: "/api/natura-species?code=", description: "Espèces désignatrices (grade A/B/C/D) d'un site Natura 2000 (source EEA, live)" },
  { method: "GET", path: "/api/natura2000/expected?lat=&lng=&radius=", description: "Espèces désignatrices Natura 2000 attendues autour d'un point (base locale, France)" },
  { method: "POST", path: "/api/potential-species", description: "Compatibilité Natura 2000 et espèces documentées dans les ZNIEFF locales" },
  { method: "GET", path: "/api/sinp/all", description: "Toutes les plateformes SINP" },
  { method: "GET", path: "/api/presets", description: "Presets de projets EIE" },
  { method: "GET", path: "/api/study-areas", description: "Définitions des aires d'étude" },
  { method: "GET", path: "/api/taxon-groups", description: "Groupes taxonomiques" },
  { method: "GET", path: "/api/data-sources", description: "Catalogue d'autres sources de données biodiversité (DataCatalog)" },
  { method: "POST", path: "/api/llm/priority-species", description: "Analyse IA des espèces à enjeux pour un toponyme (corps : toponym, coords, occurrences)" },
  { method: "POST", path: "/api/llm/reformat-report", description: "Reformulation IA d'un rapport brut en note de synthèse partageable" },
  { method: "ALL", path: "/mcp", description: "Serveur MCP (Model Context Protocol) — Streamable HTTP, mode stateless." },
];

async function fetchDataSources(): Promise<unknown> {
  if (dataSourcesCache && dataSourcesCache.expires > Date.now()) {
    return dataSourcesCache.data;
  }
  const response = await fetch("https://data-catalog-tool.replit.app/api/providers");
  if (!response.ok) {
    if (dataSourcesCache) return dataSourcesCache.data;
    throw badGateway("Catalogue de sources indisponible");
  }
  const data = await response.json();
  dataSourcesCache = { data, expires: Date.now() + DATA_SOURCES_TTL_MS };
  return data;
}

function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: formatZodError(err) });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Erreur serveur";
  console.error("Unhandled route error:", err);
  res.status(500).json({ error: message });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  registerMcpEndpoint(app);

  app.post(
    "/api/inventory",
    asyncHandler(async (req, res) => {
      const { circles, includeINaturalist } = inventoryBodySchema.parse(req.body);
      const result = await searchGBIFMultiCircle(circles, { includeINaturalist });
      res.json(result);
    }),
  );

  app.get(
    "/api/inventory/simple",
    asyncHandler(async (req, res) => {
      const { lat, lng, radius, includeINaturalist } = simpleInventoryQuerySchema.parse(req.query);
      const result = await searchGBIF(lat, lng, radius, { includeINaturalist });
      res.json(result);
    }),
  );

  app.get(
    "/api/species/:taxonKey",
    asyncHandler(async (req, res) => {
      const { taxonKey } = taxonKeyParamSchema.parse(req.params);
      res.json(await fetchSpeciesDetails(taxonKey));
    }),
  );

  app.get(
    "/api/geocode",
    asyncHandler(async (req, res) => {
      const { q } = searchQuerySchema.parse(req.query);
      res.json(await geocodePlace(q));
    }),
  );

  app.get(
    "/api/geocode/reverse",
    asyncHandler(async (req, res) => {
      const { lat, lng } = latLngQuerySchema.parse(req.query);
      res.json(await reverseGeocode(lat, lng));
    }),
  );

  app.get(
    "/api/sinp",
    asyncHandler(async (req, res) => {
      const { lat, lng } = latLngQuerySchema.parse(req.query);
      res.json({ platforms: findSINPPlatforms(lat, lng) });
    }),
  );

  app.get("/api/sinp/all", (_req, res) => {
    res.json({ platforms: SINP_PLATFORMS });
  });

  app.get(
    "/api/zonages",
    asyncHandler(async (req, res) => {
      const { lat, lng, radius } = zonagesQuerySchema.parse(req.query);
      const includeGeometry = req.query.geometry === "1" || req.query.geometry === "true";
      res.json(await getZonages(lat, lng, radius, { includeGeometry }));
    }),
  );

  app.get(
    "/api/natura-species",
    asyncHandler(async (req, res) => {
      const code = String(req.query.code || "").trim();
      const all = await getSpeciesForSite(code);
      const rank: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
      const species = all
        .filter((s) => s.grade && rank[s.grade])
        .sort((a, b) => (rank[b.grade!] ?? 0) - (rank[a.grade!] ?? 0) || a.name.localeCompare(b.name));
      res.json({ code, count: species.length, species });
    }),
  );

  app.get(
    "/api/natura2000/expected",
    asyncHandler(async (req, res) => {
      const { lat, lng, radius } = zonagesQuerySchema.parse(req.query);
      const zones = await getNaturaZones(lat, lng, radius);
      const codes = Array.from(
        new Set(
          zones
            .map((z) => (z.code || "").trim().toUpperCase())
            .filter((c) => /^FR\d{7,}$/.test(c)),
        ),
      );
      const rows = await storage.getNaturaSpeciesForSites(codes);
      // Regrouper par espèce (une espèce peut désigner plusieurs sites proches)
      const byName = new Map<
        string,
        {
          scientificName: string;
          speciesGroup: string;
          directive: string;
          annexes: string;
          sites: { code: string; name: string }[];
        }
      >();
      for (const r of rows) {
        const key = r.scientificName.toLowerCase();
        let entry = byName.get(key);
        if (!entry) {
          entry = {
            scientificName: r.scientificName,
            speciesGroup: r.speciesGroup,
            directive: r.directive,
            annexes: r.annexes,
            sites: [],
          };
          byName.set(key, entry);
        }
        if (!entry.sites.some((s) => s.code === r.siteCode)) {
          entry.sites.push({ code: r.siteCode, name: r.siteName });
        }
        if (!entry.directive && r.directive) entry.directive = r.directive;
        if (!entry.annexes && r.annexes) entry.annexes = r.annexes;
      }
      const species = Array.from(byName.values()).sort((a, b) =>
        a.scientificName.localeCompare(b.scientificName),
      );
      res.json({ siteCount: codes.length, count: species.length, species });
    }),
  );

  app.post(
    "/api/potential-species",
    asyncHandler(async (req, res) => {
      const { lat, lng, radius, occurrences } =
        potentialSpeciesBodySchema.parse(req.body);
      res.json(await getPotentialSpecies(lat, lng, radius, occurrences));
    }),
  );

  app.get(
    "/api/ali/redirect",
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? "").trim();
      if (!q) {
        res.redirect(302, "https://alispecies.io");
        return;
      }
      try {
        res.redirect(302, await resolveAliUrl(q));
      } catch {
        res.redirect(302, `https://alispecies.io/?q=${encodeURIComponent(q)}`);
      }
    }),
  );

  app.get("/api/presets", (_req, res) => res.json({ presets: PROJECT_PRESETS }));
  app.get("/api/study-areas", (_req, res) => res.json({ studyAreas: STUDY_AREAS }));
  app.get("/api/taxon-groups", (_req, res) => res.json({ groups: TAXON_GROUPS }));

  app.post(
    "/api/llm/priority-species",
    asyncHandler(async (req, res) => {
      const { toponym, coords, occurrences } = priorityBodySchema.parse(req.body);
      res.json(await analyzePrioritySpecies(toponym, coords, occurrences as any));
    }),
  );

  app.post(
    "/api/llm/reformat-report",
    asyncHandler(async (req, res) => {
      const { report } = reformatBodySchema.parse(req.body);
      res.json({ reformatted: await reformatReport(report) });
    }),
  );

  app.get(
    "/api/lieux-dits",
    asyncHandler(async (req, res) => {
      const { q } = searchQuerySchema.parse(req.query);
      res.json({ results: await searchLieuxDits(q) });
    }),
  );

  app.get(
    "/api/data-sources",
    asyncHandler(async (_req, res) => {
      res.json(await fetchDataSources());
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "Inventaire Flash API",
      version: "1.0.0",
      endpoints: ENDPOINTS_DOC,
    });
  });

  app.use("/api", errorHandler);

  return httpServer;
}
