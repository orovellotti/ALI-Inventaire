import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { searchGBIF, searchGBIFMultiCircle, fetchSpeciesDetails } from "./gbif";
import { findSINPPlatforms, SINP_PLATFORMS } from "./sinp";
import { STUDY_AREAS, PROJECT_PRESETS, TAXON_GROUPS } from "./constants";
import { analyzePrioritySpecies, reformatReport } from "./llm";
import { resolveAliTaxon } from "./ali";
import { registerMcpEndpoint } from "./mcp";
import type { BufferCircle, Occurrence } from "@shared/types";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  registerMcpEndpoint(app);

  app.post("/api/inventory", async (req: Request, res: Response) => {
    try {
      const { circles, includeINaturalist } = req.body as { circles: BufferCircle[]; includeINaturalist?: boolean };

      if (!circles || !Array.isArray(circles) || circles.length === 0) {
        return res.status(400).json({ error: "Le champ 'circles' est requis (tableau de BufferCircle)" });
      }

      if (circles.length > 10) {
        return res.status(400).json({ error: "Maximum 10 cercles par requête" });
      }

      for (const c of circles) {
        if (!c.center || !Array.isArray(c.center) || c.center.length !== 2) {
          return res.status(400).json({ error: `Cercle '${c.id}': 'center' doit être [lat, lng]` });
        }
        const [lat, lng] = c.center;
        if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
          return res.status(400).json({ error: `Cercle '${c.id}': coordonnées invalides` });
        }
        if (lat < -90 || lat > 90) {
          return res.status(400).json({ error: `Cercle '${c.id}': latitude doit être entre -90 et 90` });
        }
        if (lng < -180 || lng > 180) {
          return res.status(400).json({ error: `Cercle '${c.id}': longitude doit être entre -180 et 180` });
        }
        if (typeof c.radius !== "number" || c.radius <= 0 || isNaN(c.radius)) {
          return res.status(400).json({ error: `Cercle '${c.id}': 'radius' doit être un nombre positif en mètres` });
        }
        if (c.radius > 50000) {
          return res.status(400).json({ error: `Cercle '${c.id}': rayon maximum 50 km` });
        }
      }

      const result = await searchGBIFMultiCircle(circles, { includeINaturalist });
      res.json(result);
    } catch (error: any) {
      console.error("Inventory error:", error);
      res.status(500).json({ error: error.message || "Erreur lors de l'inventaire" });
    }
  });

  app.get("/api/inventory/simple", async (req: Request, res: Response) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      const radius = parseFloat(req.query.radius as string) || 500;

      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: "Paramètres 'lat' et 'lng' requis" });
      }
      if (lat < -90 || lat > 90) {
        return res.status(400).json({ error: "'lat' doit être entre -90 et 90" });
      }
      if (lng < -180 || lng > 180) {
        return res.status(400).json({ error: "'lng' doit être entre -180 et 180" });
      }
      if (radius <= 0 || isNaN(radius)) {
        return res.status(400).json({ error: "'radius' doit être un nombre positif en mètres" });
      }
      if (radius > 50000) {
        return res.status(400).json({ error: "Rayon maximum 50 km" });
      }

      const includeINaturalist = req.query.includeINaturalist !== "false";
      const result = await searchGBIF(lat, lng, radius, { includeINaturalist });
      res.json(result);
    } catch (error: any) {
      console.error("Simple inventory error:", error);
      res.status(500).json({ error: error.message || "Erreur lors de l'inventaire" });
    }
  });

  app.get("/api/species/:taxonKey", async (req: Request, res: Response) => {
    try {
      const taxonKey = parseInt(req.params.taxonKey);
      if (isNaN(taxonKey)) {
        return res.status(400).json({ error: "taxonKey doit être un entier" });
      }

      const details = await fetchSpeciesDetails(taxonKey);
      res.json(details);
    } catch (error: any) {
      console.error("Species detail error:", error);
      res.status(500).json({ error: error.message || "Erreur lors de la récupération" });
    }
  });

  app.get("/api/geocode", async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query || !query.trim()) {
        return res.status(400).json({ error: "Paramètre 'q' requis" });
      }

      const params = new URLSearchParams({
        q: query.trim(),
        format: "json",
        limit: "1",
        addressdetails: "1",
      });

      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { "User-Agent": "InventaireFlash/1.0" },
      });

      if (!response.ok) {
        return res.status(502).json({ error: "Erreur du service de géocodage" });
      }

      const data = await response.json();

      if (data && data.length > 0) {
        res.json({
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
          display_name: data[0].display_name,
        });
      } else {
        res.status(404).json({ error: "Lieu introuvable" });
      }
    } catch (error: any) {
      console.error("Geocoding error:", error);
      res.status(500).json({ error: "Erreur de géocodage" });
    }
  });

  app.get("/api/geocode/reverse", async (req: Request, res: Response) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: "Paramètres 'lat' et 'lng' requis" });
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: "Coordonnées hors limites" });
      }

      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        format: "json",
        zoom: "14",
        addressdetails: "1",
      });

      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
        headers: { "User-Agent": "InventaireFlash/1.0" },
      });

      if (!response.ok) {
        return res.status(502).json({ error: "Erreur du service de géocodage" });
      }

      const data = await response.json();
      if (!data || data.error) {
        return res.status(404).json({ error: "Aucun toponyme trouvé" });
      }

      const addr = data.address || {};
      const place =
        addr.hamlet || addr.isolated_dwelling || addr.farm || addr.locality ||
        addr.neighbourhood || addr.quarter || addr.suburb || addr.village ||
        addr.town || addr.municipality || addr.city || data.name || "";
      const commune = addr.village || addr.town || addr.municipality || addr.city || addr.hamlet || "";
      const departement = addr.county || addr["state_district"] || "";
      const region = addr.state || "";

      const parts = [place, commune && commune !== place ? commune : null, departement, region].filter(Boolean);
      const shortName = parts.join(", ") || data.display_name || `Point ${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      res.json({
        lat,
        lng,
        name: place || commune || data.display_name,
        shortName,
        displayName: data.display_name,
        commune,
        departement,
        region,
      });
    } catch (error: any) {
      console.error("Reverse geocoding error:", error);
      res.status(500).json({ error: "Erreur de reverse géocodage" });
    }
  });

  app.get("/api/sinp", (req: Request, res: Response) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);

      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: "Paramètres 'lat' et 'lng' requis" });
      }

      const platforms = findSINPPlatforms(lat, lng);
      res.json({ platforms });
    } catch (error: any) {
      res.status(500).json({ error: "Erreur SINP" });
    }
  });

  app.get("/api/sinp/all", (_req: Request, res: Response) => {
    res.json({ platforms: SINP_PLATFORMS });
  });

  app.get("/api/ali/resolve", async (req: Request, res: Response) => {
    const name = String(req.query.name || "").trim();
    if (!name) return res.status(400).json({ error: "Paramètre 'name' requis" });
    const hit = await resolveAliTaxon(name);
    if (!hit) return res.json({ found: false });
    const slug = hit.lbNom
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    res.json({
      found: true,
      cdNom: hit.cdNom,
      lbNom: hit.lbNom,
      url: `https://alispecies.io/taxon/${hit.cdNom}-${slug}`,
    });
  });

  app.get("/api/presets", (_req: Request, res: Response) => {
    res.json({ presets: PROJECT_PRESETS });
  });

  app.get("/api/study-areas", (_req: Request, res: Response) => {
    res.json({ studyAreas: STUDY_AREAS });
  });

  app.get("/api/taxon-groups", (_req: Request, res: Response) => {
    res.json({ groups: TAXON_GROUPS });
  });

  app.post("/api/llm/priority-species", async (req: Request, res: Response) => {
    try {
      const { toponym, coords, occurrences } = req.body as {
        toponym: string;
        coords: [number, number];
        occurrences: Occurrence[];
      };

      if (!toponym || typeof toponym !== "string") {
        return res.status(400).json({ error: "Champ 'toponym' requis" });
      }
      if (!coords || !Array.isArray(coords) || coords.length !== 2) {
        return res.status(400).json({ error: "Champ 'coords' requis ([lat, lng])" });
      }
      if (!occurrences || !Array.isArray(occurrences) || occurrences.length === 0) {
        return res.status(400).json({ error: "Champ 'occurrences' requis (tableau non vide)" });
      }
      if (occurrences.length > 5000) {
        return res.status(400).json({ error: "Maximum 5000 occurrences" });
      }

      const analysis = await analyzePrioritySpecies(toponym, coords, occurrences);
      res.json(analysis);
    } catch (error: any) {
      console.error("LLM priority-species error:", error);
      res.status(500).json({ error: error.message || "Erreur lors de l'analyse IA" });
    }
  });

  app.post("/api/llm/reformat-report", async (req: Request, res: Response) => {
    try {
      const { report } = req.body as { report: string };
      if (!report || typeof report !== "string") {
        return res.status(400).json({ error: "Champ 'report' requis" });
      }
      if (report.length > 50000) {
        return res.status(400).json({ error: "Rapport trop long (max 50000 caractères)" });
      }
      const reformatted = await reformatReport(report);
      res.json({ reformatted });
    } catch (error: any) {
      console.error("LLM reformat-report error:", error);
      res.status(500).json({ error: error.message || "Erreur lors de la reformulation IA" });
    }
  });

  app.get("/api/lieux-dits", async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string)?.trim();
      if (!query) {
        return res.status(400).json({ error: "Paramètre 'q' requis" });
      }

      const params = new URLSearchParams({
        q: query,
        format: "json",
        limit: "15",
        addressdetails: "1",
        polygon_geojson: "1",
        countrycodes: "fr,gp,mq,gf,re,yt,pm",
      });

      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { "User-Agent": "InventaireFlash/1.0" },
      });

      if (!response.ok) {
        return res.status(502).json({ error: "Erreur du service de géocodage" });
      }

      const data = await response.json();
      const PLACE_TYPES = new Set([
        "hamlet", "isolated_dwelling", "farm", "locality", "neighbourhood",
        "quarter", "village", "suburb", "allotments",
        "city", "town", "municipality", "administrative",
      ]);
      const ADMIN_TYPES = new Set(["administrative", "boundary"]);

      const results = (Array.isArray(data) ? data : [])
        .filter((r: any) => {
          if (r.class === "place" && PLACE_TYPES.has(r.type)) return true;
          if (r.class === "boundary" && ADMIN_TYPES.has(r.type)) return true;
          return false;
        })
        .map((r: any) => {
          const lat = parseFloat(r.lat);
          const lng = parseFloat(r.lon);
          const addr = r.address || {};
          const commune = addr.village || addr.town || addr.municipality || addr.city || addr.hamlet || "";
          const departement = addr.county || addr["state_district"] || "";
          const region = addr.state || "";
          const hasPolygon = r.geojson && (r.geojson.type === "Polygon" || r.geojson.type === "MultiPolygon");
          return {
            id: `${r.osm_type}-${r.osm_id}`,
            name: r.name || r.display_name.split(",")[0],
            displayName: r.display_name,
            type: r.type,
            lat,
            lng,
            commune,
            departement,
            region,
            geometry: hasPolygon ? r.geojson : null,
            boundingbox: r.boundingbox ? r.boundingbox.map(parseFloat) : null,
          };
        });

      res.json({ results });
    } catch (error: any) {
      console.error("Lieux-dits error:", error);
      res.status(500).json({ error: error.message || "Erreur lors de la recherche" });
    }
  });

  let dataSourcesCache: { data: any; expires: number } | null = null;
  app.get("/api/data-sources", async (_req: Request, res: Response) => {
    try {
      if (dataSourcesCache && dataSourcesCache.expires > Date.now()) {
        return res.json(dataSourcesCache.data);
      }
      const response = await fetch("https://data-catalog-tool.replit.app/api/providers");
      if (!response.ok) {
        throw new Error(`Catalog upstream returned ${response.status}`);
      }
      const data = await response.json();
      dataSourcesCache = { data, expires: Date.now() + 10 * 60 * 1000 };
      res.json(data);
    } catch (error: any) {
      console.error("Data sources error:", error);
      if (dataSourcesCache) {
        return res.json(dataSourcesCache.data);
      }
      res.status(502).json({ error: "Catalogue de sources indisponible" });
    }
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "Inventaire Flash API",
      version: "1.0.0",
      endpoints: [
        { method: "POST", path: "/api/inventory", description: "Inventaire multi-aires (corps JSON avec circles[])" },
        { method: "GET", path: "/api/inventory/simple?lat=&lng=&radius=", description: "Inventaire simple (un point, un rayon)" },
        { method: "GET", path: "/api/species/:taxonKey", description: "Détails espèce (image, UICN, nom vernaculaire)" },
        { method: "GET", path: "/api/geocode?q=", description: "Géocodage (recherche de lieu)" },
        { method: "GET", path: "/api/lieux-dits?q=", description: "Recherche de lieux-dits (avec polygone si disponible)" },
        { method: "GET", path: "/api/sinp?lat=&lng=", description: "Plateformes SINP régionales" },
        { method: "GET", path: "/api/sinp/all", description: "Toutes les plateformes SINP" },
        { method: "GET", path: "/api/presets", description: "Presets de projets EIE" },
        { method: "GET", path: "/api/study-areas", description: "Définitions des aires d'étude" },
        { method: "GET", path: "/api/taxon-groups", description: "Groupes taxonomiques" },
        { method: "GET", path: "/api/data-sources", description: "Catalogue d'autres sources de données biodiversité (DataCatalog)" },
        { method: "POST", path: "/api/llm/priority-species", description: "Analyse IA des espèces à enjeux pour un toponyme (corps : toponym, coords, occurrences)" },
        { method: "ALL",  path: "/mcp", description: "Serveur MCP (Model Context Protocol) — Streamable HTTP, mode stateless. Outils : inventory_simple, inventory_multi, species_details, geocode, sinp_links, priority_species_for_location, list_reference_data" },
      ]
    });
  });

  return httpServer;
}
