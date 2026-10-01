import type { Express, Request, Response, NextFunction } from "express";
import { type Server } from "http";
import { ZodError } from "zod";
import { searchGBIF, searchGBIFMultiCircle, fetchSpeciesDetails } from "./gbif";
import { findSINPPlatforms, SINP_PLATFORMS } from "./sinp";
import { STUDY_AREAS, PROJECT_PRESETS, TAXON_GROUPS } from "./constants";
import { analyzePrioritySpecies, createFinalStudyPromptTrace, getFinalStudyPrompt, reformatReport } from "./llm";
import { resolveAliUrl } from "./ali";
import { getMcpServerRegistry, registerMcpEndpoint } from "./mcp";
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
  harnessConfigBodySchema,
  mcpDiscoveryBodySchema,
  SlidingWindowCostLimiter,
} from "./lib/validation";
import { geocodePlace, reverseGeocode, searchLieuxDits } from "./services/nominatim";
import { getStudyCoverage, requireFrenchCoverage } from "./services/coverage";
import { getZonages, getNaturaZones } from "./services/geoservices";
import { getSpeciesForSite } from "./services/natura2000Species";
import { storage } from "./storage";
import { getPotentialSpecies } from "./services/potentialSpecies";
import { DEFAULT_HARNESS_CONFIG, migrateHarnessConfig } from "@shared/harness";
import { randomUUID } from "node:crypto";
import { getHarnessAccess, requireHarnessAdmin } from "./harnessAuth";
import { getRuntimeHarnessConfig, isAgentEnabled, isAgentOperational, isAgentToolEnabled } from "./harnessRuntime";

const DATA_SOURCES_TTL_MS = 10 * 60 * 1000;
let dataSourcesCache: { data: unknown; expires: number } | null = null;

/** Petit garde-fou en mémoire : l'usage anonyme reste possible, mais borné par IP. */
function createCostControl(limiter: SlidingWindowCostLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const decision = limiter.acquire(key);
    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      res.status(429).json({
        error: decision.reason === "concurrency"
          ? "An analysis is already running for this address."
          : "Temporary analysis limit reached. Please try again later.",
      });
      return;
    }
    res.once("finish", decision.release);
    res.once("close", decision.release);
    next();
  };
}

const priorityCostControl = createCostControl(new SlidingWindowCostLimiter(10 * 60_000, 6, 1));
const reformatCostControl = createCostControl(new SlidingWindowCostLimiter(10 * 60_000, 3, 1));

const ENDPOINTS_DOC = [
  { method: "POST", path: "/api/inventory", description: "Worldwide multi-area inventory (JSON circles[])" },
  { method: "GET", path: "/api/inventory/simple?lat=&lng=&radius=", description: "Worldwide single-location inventory" },
  { method: "GET", path: "/api/species/:taxonKey", description: "Species details (image, IUCN, available common names)" },
  { method: "GET", path: "/api/geocode?q=", description: "Worldwide place geocoding" },
  { method: "GET", path: "/api/coverage?lat=&lng=", description: "Country and source coverage for study coordinates" },
  { method: "GET", path: "/api/lieux-dits?q=", description: "Worldwide locality search (polygon when available)" },
  { method: "GET", path: "/api/sinp?lat=&lng=", description: "French regional SINP platforms (coverage included)" },
  { method: "GET", path: "/api/zonages?lat=&lng=&radius=", description: "French zoning (ZNIEFF, Natura 2000, reserves), France only" },
  { method: "GET", path: "/api/natura-species?code=", description: "Natura 2000 site species (EEA)" },
  { method: "GET", path: "/api/natura2000/expected?lat=&lng=&radius=", description: "Nearby Natura 2000 species (France only)" },
  { method: "POST", path: "/api/potential-species", description: "French Natura 2000 and ZNIEFF potential-species assessment" },
  { method: "GET", path: "/api/sinp/all", description: "French SINP platform directory" },
  { method: "GET", path: "/api/presets", description: "Project presets" },
  { method: "GET", path: "/api/study-areas", description: "Study-area definitions" },
  { method: "GET", path: "/api/taxon-groups", description: "Taxonomic groups" },
  { method: "GET", path: "/api/data-sources", description: "Biodiversity data-source directory" },
  { method: "POST", path: "/api/llm/priority-species", description: "AI-assisted priority species assessment" },
  { method: "POST", path: "/api/llm/reformat-report", description: "Client-ready English preliminary biodiversity study" },
  { method: "ALL", path: "/mcp", description: "MCP server — stateless Streamable HTTP" },
];

async function fetchDataSources(): Promise<unknown> {
  if (dataSourcesCache && dataSourcesCache.expires > Date.now()) {
    return dataSourcesCache.data;
  }
  const response = await fetch("https://data-catalog-tool.replit.app/api/providers");
  if (!response.ok) {
    if (dataSourcesCache) return dataSourcesCache.data;
    throw badGateway("Data source catalogue unavailable");
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
  const message = "Internal server error";
  console.error("Unhandled route error:", err);
  res.status(500).json({ error: message });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  registerMcpEndpoint(app);

  app.get("/api/runtime/harness", asyncHandler(async (_req, res) => {
    const stored = await storage.getHarnessConfig();
    const config = migrateHarnessConfig(stored) ?? DEFAULT_HARNESS_CONFIG;
    res.json({
      ...config,
      mcpServers: [],
      agents: config.agents.map((agent) => ({
        ...agent,
        enabled: isAgentOperational(config, agent.id),
        prompt: "",
        mcpId: "none",
        mcpToolIds: [],
      })),
    });
  }));

  app.get("/api/runtime/final-study-prompt", asyncHandler(async (_req, res) => {
    const prompt = await getFinalStudyPrompt();
    const trace = createFinalStudyPromptTrace(prompt, "");
    res.json({
      title: "Saved system prompt for preliminary study generation",
      prompt,
      characters: trace.systemCharacters,
      fingerprint: trace.systemFingerprint,
    });
  }));

  app.get("/api/harness/access", asyncHandler(async (req, res) => {
    res.json(await getHarnessAccess(req));
  }));

  app.get("/api/harness", requireHarnessAdmin, asyncHandler(async (_req, res) => {
    const stored = await storage.getHarnessConfig();
    const config = migrateHarnessConfig(stored) ?? DEFAULT_HARNESS_CONFIG;
    if (stored && (stored as { version?: unknown }).version !== config.version) {
      await storage.saveHarnessConfig(config);
    }
    res.json(config);
  }));

  app.get("/api/harness/mcp-registry", requireHarnessAdmin, asyncHandler(async (_req, res) => {
    const config = migrateHarnessConfig(await storage.getHarnessConfig()) ?? DEFAULT_HARNESS_CONFIG;
    res.json(await getMcpServerRegistry(config.mcpServers));
  }));

  app.post("/api/harness/mcp-discover", requireHarnessAdmin, asyncHandler(async (req, res) => {
    const server = mcpDiscoveryBodySchema.parse(req.body);
    const [entry] = await getMcpServerRegistry([{
      id: `custom-${randomUUID()}`,
      ...server,
    }]).then((registry) => registry.slice(-1));
    if (!entry.connected) throw new HttpError(400, entry.error || "MCP server unavailable or incompatible.");
    res.json(entry);
  }));

  app.put("/api/harness", requireHarnessAdmin, asyncHandler(async (req, res) => {
    const config = harnessConfigBodySchema.parse(req.body);
    const registry = await getMcpServerRegistry(config.mcpServers);
    for (const agent of config.agents) {
      if (agent.mcpId === "none" && agent.mcpToolIds.length > 0) {
        throw new HttpError(400, `Agent ${agent.name} cannot approve tools without an MCP server.`);
      }
      if (agent.mcpId !== "none") {
        const registered = registry.find((entry) => entry.id === agent.mcpId && entry.connected);
        if (
          !registered ||
          agent.mcpToolIds.some((toolId) =>
            !registered.tools.some((tool) => tool.id === toolId && tool.supported !== false),
          )
        ) {
          throw new HttpError(400, `Agent ${agent.name} selected an MCP tool that has not been approved.`);
        }
      }
    }
    console.info(`[harness] configuration updated: ${config.agents.length} agents`);
    res.json(await storage.saveHarnessConfig(config));
  }));

  app.post("/api/harness/reset", requireHarnessAdmin, asyncHandler(async (_req, res) => {
    console.info("[harness] configuration reset");
    res.json(await storage.saveHarnessConfig(DEFAULT_HARNESS_CONFIG));
  }));

  app.post(
    "/api/inventory",
    asyncHandler(async (req, res) => {
      const { circles, includeINaturalist } = inventoryBodySchema.parse(req.body);
      const harness = await getRuntimeHarnessConfig();
      if (!isAgentEnabled(harness, "occurrences")) {
        throw new HttpError(409, "The occurrences analysis is disabled.");
      }
      const result = await searchGBIFMultiCircle(circles, {
        includeINaturalist,
        skipAliSpeciesMcp: !isAgentToolEnabled(
          harness,
          "taxonomy-status",
          "ali-species",
          "get_statuts",
        ),
      });
      res.json(result);
    }),
  );

  app.get(
    "/api/inventory/simple",
    asyncHandler(async (req, res) => {
      const { lat, lng, radius, includeINaturalist } = simpleInventoryQuerySchema.parse(req.query);
      const harness = await getRuntimeHarnessConfig();
      if (!isAgentEnabled(harness, "occurrences")) {
        throw new HttpError(409, "The occurrences analysis is disabled.");
      }
      const result = await searchGBIF(lat, lng, radius, {
        includeINaturalist,
        skipAliSpeciesMcp: !isAgentToolEnabled(
          harness,
          "taxonomy-status",
          "ali-species",
          "get_statuts",
        ),
      });
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

  app.get("/api/coverage", asyncHandler(async (req, res) => {
    const { lat, lng } = latLngQuerySchema.parse(req.query);
    res.json(await getStudyCoverage(lat, lng));
  }));

  app.get(
    "/api/sinp",
    asyncHandler(async (req, res) => {
      const { lat, lng } = latLngQuerySchema.parse(req.query);
      const coverage = await getStudyCoverage(lat, lng);
      res.json({ platforms: coverage.frenchSources ? findSINPPlatforms(lat, lng) : [], coverage });
    }),
  );

  app.get("/api/sinp/all", (_req, res) => {
    res.json({ platforms: SINP_PLATFORMS });
  });

  app.get(
    "/api/zonages",
    asyncHandler(async (req, res) => {
      const harness = await getRuntimeHarnessConfig();
      if (!isAgentEnabled(harness, "zonages")) {
        throw new HttpError(409, "The zoning analysis is disabled.");
      }
      const { lat, lng, radius } = zonagesQuerySchema.parse(req.query);
      const coverage = await requireFrenchCoverage(lat, lng, "French protected-area zoning");
      const includeGeometry = req.query.geometry === "1" || req.query.geometry === "true";
      res.json({ ...await getZonages(lat, lng, radius, { includeGeometry }), coverage });
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
      await requireFrenchCoverage(lat, lng, "French Natura 2000 site species");
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
      const { lat, lng, radius, occurrences, projectArea } =
        potentialSpeciesBodySchema.parse(req.body);
      await requireFrenchCoverage(lat, lng, "French Natura 2000, ZNIEFF and CARHAB potential species");
      const harness = await getRuntimeHarnessConfig();
      if (!isAgentEnabled(harness, "zonages")) {
        throw new HttpError(409, "The zoning analysis is disabled.");
      }
      res.json(await getPotentialSpecies(lat, lng, radius, occurrences, {
        includeHabitats: isAgentOperational(harness, "habitats"),
        projectArea,
      }));
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
    priorityCostControl,
    asyncHandler(async (req, res) => {
      const { toponym, coords, occurrences, projectArea, studyAreas } = priorityBodySchema.parse(req.body);
      const harness = await getRuntimeHarnessConfig();
      if (!isAgentEnabled(harness, "occurrences")) {
        throw new HttpError(409, "The occurrences analysis is disabled.");
      }
      res.json(await analyzePrioritySpecies(toponym, coords, occurrences as any, projectArea, studyAreas));
    }),
  );

  app.post(
    "/api/llm/reformat-report",
    reformatCostControl,
    asyncHandler(async (req, res) => {
      const { report, context } = reformatBodySchema.parse(req.body);
      res.json(await reformatReport(report, context));
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
      service: "ALi Inventaire API",
      version: "1.0.0",
      endpoints: ENDPOINTS_DOC,
    });
  });

  app.use("/api", errorHandler);

  return httpServer;
}
