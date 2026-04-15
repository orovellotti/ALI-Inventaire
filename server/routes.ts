import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { searchGBIF, searchGBIFMultiCircle, fetchSpeciesDetails } from "./gbif";
import { findSINPPlatforms, SINP_PLATFORMS } from "./sinp";
import { STUDY_AREAS, PROJECT_PRESETS, TAXON_GROUPS } from "./constants";
import type { BufferCircle } from "@shared/types";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/inventory", async (req: Request, res: Response) => {
    try {
      const { circles } = req.body as { circles: BufferCircle[] };

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

      const result = await searchGBIFMultiCircle(circles);
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

      const result = await searchGBIF(lat, lng, radius);
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

  app.get("/api/presets", (_req: Request, res: Response) => {
    res.json({ presets: PROJECT_PRESETS });
  });

  app.get("/api/study-areas", (_req: Request, res: Response) => {
    res.json({ studyAreas: STUDY_AREAS });
  });

  app.get("/api/taxon-groups", (_req: Request, res: Response) => {
    res.json({ groups: TAXON_GROUPS });
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
        { method: "GET", path: "/api/sinp?lat=&lng=", description: "Plateformes SINP régionales" },
        { method: "GET", path: "/api/sinp/all", description: "Toutes les plateformes SINP" },
        { method: "GET", path: "/api/presets", description: "Presets de projets EIE" },
        { method: "GET", path: "/api/study-areas", description: "Définitions des aires d'étude" },
        { method: "GET", path: "/api/taxon-groups", description: "Groupes taxonomiques" },
      ]
    });
  });

  return httpServer;
}
