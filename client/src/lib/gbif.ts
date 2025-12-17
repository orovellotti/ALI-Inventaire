import { useState, useEffect } from "react";

export interface Occurrence {
  key: number;
  scientificName: string;
  decimalLatitude: number;
  decimalLongitude: number;
  vernacularName?: string;
  order?: string;
  family?: string;
  alertLevel: "high" | "medium" | "low";
}

export interface InventoryResult {
  occurrences: Occurrence[];
  stats: {
    total: number;
    speciesCount: number;
    sensitiveCount: number;
  };
  center: [number, number];
  radius: number;
}

// Mock data generator for the prototype
// In a real app, this would query https://api.gbif.org/v1/occurrence/search
export async function searchGBIF(lat: number, lng: number, radiusMeters: number): Promise<InventoryResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const count = Math.floor(Math.random() * 50) + 20; // 20-70 occurrences
  const occurrences: Occurrence[] = [];
  
  const speciesPool = [
    { name: "Lucanus cervus", vernacular: "Lucane cerf-volant", level: "medium" },
    { name: "Rosalia alpina", vernacular: "Rosalie des Alpes", level: "high" },
    { name: "Passer domesticus", vernacular: "Moineau domestique", level: "low" },
    { name: "Erithacus rubecula", vernacular: "Rouge-gorge familier", level: "low" },
    { name: "Lutra lutra", vernacular: "Loutre d'Europe", level: "high" },
    { name: "Vulpes vulpes", vernacular: "Renard roux", level: "low" },
    { name: "Osmoderma eremita", vernacular: "Pique-prune", level: "high" },
    { name: "Salamandra salamandra", vernacular: "Salamandre tachetée", level: "medium" },
  ];

  for (let i = 0; i < count; i++) {
    // Random position within radius (approximate)
    // 1 deg lat ~ 111km. 100m ~ 0.0009 deg
    const r = radiusMeters / 111000; 
    const u = Math.random();
    const v = Math.random();
    const w = r * Math.sqrt(u);
    const t = 2 * Math.PI * v;
    const x = w * Math.cos(t);
    const y = w * Math.sin(t);
    
    // Adjust longitude for latitude
    const xAdjusted = x / Math.cos(lat * Math.PI / 180);

    const species = speciesPool[Math.floor(Math.random() * speciesPool.length)];

    occurrences.push({
      key: i,
      scientificName: species.name,
      vernacularName: species.vernacular,
      decimalLatitude: lat + y,
      decimalLongitude: lng + xAdjusted,
      alertLevel: species.level as "high" | "medium" | "low",
    });
  }

  const uniqueSpecies = new Set(occurrences.map(o => o.scientificName)).size;
  const sensitiveCount = occurrences.filter(o => o.alertLevel === "high" || o.alertLevel === "medium").length;

  return {
    occurrences,
    stats: {
      total: occurrences.length,
      speciesCount: uniqueSpecies,
      sensitiveCount
    },
    center: [lat, lng],
    radius: radiusMeters
  };
}
