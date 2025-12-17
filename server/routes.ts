import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeSpecies } from "./ai-analysis";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // AI Analysis endpoint
  app.post("/api/analyze-species", async (req, res) => {
    try {
      const { species } = req.body;
      
      if (!species || !Array.isArray(species)) {
        return res.status(400).json({ error: "species array is required" });
      }

      const analysis = await analyzeSpecies(species);
      res.json(analysis);
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Analysis failed" });
    }
  });

  return httpServer;
}
